import { lookup as defaultDnsLookup } from "node:dns/promises";
import { AttachmentBuilder } from "discord.js";
import { UserError } from "fastmcp";

// ── Test injection seam for DNS lookup ──────────────────────────────────────
// Production uses node:dns/promises.lookup. Tests can override via _setSsrfDnsLookup
// to avoid network round-trips while still exercising the SSRF check end-to-end.
// The narrowed signature matches our only call shape — lookup(host, { all: true }).
export type SsrfLookupFn = (
	hostname: string,
	options: { all: true },
) => Promise<{ address: string; family: number }[]>;

const ssrfDeps: { lookup: SsrfLookupFn } = {
	// node:dns/promises.lookup has multiple overloads; the { all: true } overload
	// returns Promise<LookupAddress[]> which matches SsrfLookupFn at runtime.
	lookup: defaultDnsLookup as unknown as SsrfLookupFn,
};

export function _setSsrfDnsLookup(fn: SsrfLookupFn | null): void {
	ssrfDeps.lookup = fn ?? (defaultDnsLookup as unknown as SsrfLookupFn);
}

/**
 * Returns true if the given IP literal targets a private, loopback, link-local,
 * site-local, IPv4-mapped, ULA, multicast, or otherwise non-public range.
 * Accepts IPv4 dotted-quad and IPv6 literals (with or without brackets).
 *
 * Covered ranges:
 *   IPv4 — 0.0.0.0/8, 10/8, 100.64/10 (CGNAT), 127/8, 169.254/16, 172.16/12,
 *          192.0.0/24, 192.0.2/24 (TEST-NET-1), 192.168/16, 198.18/15,
 *          198.51.100/24, 203.0.113/24, 224.0.0/4 multicast and above.
 *   IPv6 — ::, ::1 loopback, ::ffff:/96 IPv4-mapped (recursively checked),
 *          fc00::/7 ULA, fec0::/10 site-local (deprecated), fe80::/10 link-local,
 *          ff00::/8 multicast, 2002::/16 6to4 (recursively checks embedded IPv4).
 */
export function isPrivateAddress(addr: string): boolean {
	const ip = addr.startsWith("[") ? addr.slice(1, -1) : addr;

	// ─── IPv4 ──────────────────────────────────────────────────────────────
	if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
		const parts = ip.split(".").map(Number);
		if (parts.some((p) => p < 0 || p > 255)) return true; // malformed → reject
		const [a, b, c] = parts;
		if (a === 0) return true; // 0.0.0.0/8 — "this network"
		if (a === 10) return true; // RFC1918
		if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
		if (a === 127) return true; // loopback
		if (a === 169 && b === 254) return true; // link-local
		if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
		if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // 192.0.0/24, TEST-NET-1
		if (a === 192 && b === 168) return true; // RFC1918
		if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
		if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
		if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
		if (a >= 224) return true; // 224/4 multicast, 240/4 reserved, 255.255.255.255
		return false;
	}

	// ─── IPv6 ──────────────────────────────────────────────────────────────
	const v6 = ip.toLowerCase();
	if (v6 === "::" || v6 === "::1") return true;
	if (v6.startsWith("::ffff:")) {
		const v4 = v6.slice(7);
		if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v4)) return isPrivateAddress(v4);
		return true; // any other ::ffff: form — block conservatively
	}
	if (/^f[cd][0-9a-f]{2}:/.test(v6)) return true; // fc00::/7 ULA
	if (/^fe[cdef][0-9a-f]:/.test(v6)) return true; // fec0::/10 site-local (deprecated)
	if (/^fe[89ab][0-9a-f]:/.test(v6)) return true; // fe80::/10 link-local
	if (v6.startsWith("ff")) return true; // ff00::/8 multicast
	if (v6.startsWith("2002:")) {
		// 6to4 — first two groups after "2002:" encode the embedded IPv4
		const groups = v6.split(":");
		if (groups.length >= 3 && groups[1] && groups[2]) {
			const g1 = groups[1].padStart(4, "0");
			const g2 = groups[2].padStart(4, "0");
			const v4 = `${Number.parseInt(g1.slice(0, 2), 16)}.${Number.parseInt(g1.slice(2, 4), 16)}.${Number.parseInt(g2.slice(0, 2), 16)}.${Number.parseInt(g2.slice(2, 4), 16)}`;
			if (isPrivateAddress(v4)) return true;
		}
	}
	return false;
}

/**
 * Validates that the URL is safe to fetch:
 *  • http(s) only (no file://, gopher://, etc.).
 *  • Hostname is not "localhost".
 *  • If hostname is an IP literal, it must not be private.
 *  • If hostname is a DNS name, every resolved address must be public.
 *
 * Throws UserError on any violation. DNS resolution uses node:dns/promises.lookup
 * (overridable via _setSsrfDnsLookup for tests).
 */
export async function assertPublicUrl(url: string): Promise<void> {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new UserError(`Invalid URL: ${url}`);
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new UserError(`Only http(s) URLs are allowed: ${url}`);
	}
	// URL.hostname wraps IPv6 in brackets; isPrivateAddress strips them, but the
	// IP-literal detector below needs the unwrapped form too.
	const hostname = parsed.hostname.startsWith("[") ? parsed.hostname.slice(1, -1) : parsed.hostname;
	if (hostname === "" || hostname.toLowerCase() === "localhost") {
		throw new UserError(`Attachment URL targets a private or internal address: ${url}`);
	}
	const looksLikeIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":");
	if (looksLikeIp) {
		if (isPrivateAddress(hostname)) {
			throw new UserError(`Attachment URL targets a private or internal address: ${url}`);
		}
		return;
	}
	// DNS name — resolve and check every returned address (defeats domains that
	// point at internal IPs, basic DNS rebinding mitigation).
	let addresses: { address: string }[];
	try {
		addresses = await ssrfDeps.lookup(hostname, { all: true });
	} catch {
		throw new UserError(`Failed to resolve hostname for attachment URL: ${url}`);
	}
	for (const { address } of addresses) {
		if (isPrivateAddress(address)) {
			throw new UserError(`Attachment URL resolves to a private or internal address: ${url}`);
		}
	}
}

/**
 * Discord per-file upload size limits by server boost tier.
 * discord.js exposes guild.premiumTier as GuildPremiumTier (enum 0–3).
 * There is no maximumFileSize property on Guild — limits are derived here.
 */
export const FILE_SIZE_BY_TIER: Record<number, number> = {
	0: 8 * 1024 * 1024, //   Tier None — 8 MB
	1: 8 * 1024 * 1024, //   Tier 1    — 8 MB
	2: 50 * 1024 * 1024, //  Tier 2    — 50 MB
	3: 100 * 1024 * 1024, // Tier 3    — 100 MB
};

/** Fallback used when guild context is unavailable (e.g. webhooks). */
export const DEFAULT_MAX_FILE_BYTES = FILE_SIZE_BY_TIER[0]; // 8 MB

/** Discord custom-emoji image size limit. */
export const EMOJI_MAX_BYTES = 256 * 1024; // 256 KB

/**
 * Returns the per-file upload limit for the given guild premium tier.
 * Falls back to 8 MB for unknown tier values.
 */
export function maxFileBytesForTier(premiumTier: number): number {
	return FILE_SIZE_BY_TIER[premiumTier] ?? DEFAULT_MAX_FILE_BYTES;
}

/**
 * Streams a response body in chunks, aborting once cumulative byte count
 * exceeds maxBytes. Falls back to arrayBuffer() if the body is non-streamable
 * (e.g. inside test mocks); the same size check is applied to the result.
 */
async function readBodyWithLimit(
	response: Response,
	url: string,
	maxBytes: number,
): Promise<Buffer> {
	const reader = response.body?.getReader();
	if (!reader) {
		const buf = Buffer.from(await response.arrayBuffer());
		if (buf.byteLength > maxBytes) {
			throw new UserError(
				`Attachment too large (${(buf.byteLength / 1024 / 1024).toFixed(1)} MB, ` +
					`limit ${(maxBytes / 1024 / 1024).toFixed(0)} MB): ${url}`,
			);
		}
		return buf;
	}
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;
			total += value.byteLength;
			if (total > maxBytes) {
				try {
					await reader.cancel();
				} catch {
					// already closed
				}
				throw new UserError(
					`Attachment too large (limit ${(maxBytes / 1024 / 1024).toFixed(0)} MB): ${url}`,
				);
			}
			chunks.push(value);
		}
	} finally {
		try {
			reader.releaseLock();
		} catch {
			// lock already released by cancel()
		}
	}
	return Buffer.concat(chunks);
}

/**
 * SSRF-safe fetch of a single URL with a per-file byte budget.
 *
 * Pipeline:
 *   1. assertPublicUrl — protocol, hostname, and DNS-resolved IP all validated public.
 *   2. Advisory HEAD with redirect: "manual" — early-reject oversized files via
 *      content-length. Non-OK HEAD (403/405) falls through (CDNs like S3 commonly
 *      reject HEAD but allow GET). 3xx HEAD is treated as an SSRF-redirect attempt
 *      and refused.
 *   3. GET with redirect: "manual" — 3xx refused (would otherwise be a redirect-based
 *      SSRF bypass since assertPublicUrl only validated the initial URL).
 *   4. Body streamed chunk-by-chunk; aborts mid-download once maxBytes is exceeded.
 *      Caps memory at maxBytes even when the server lies about content-length.
 */
async function fetchPublicUrl(
	url: string,
	maxBytes: number,
): Promise<{ buffer: Buffer; filename: string }> {
	await assertPublicUrl(url);

	// ── 1. Advisory HEAD ─────────────────────────────────────────────────
	try {
		const head = await fetch(url, { method: "HEAD", redirect: "manual" });
		if (head.status >= 300 && head.status < 400) {
			throw new UserError(`Refusing to follow redirect for attachment URL: ${url}`);
		}
		if (head.ok) {
			const contentLength = head.headers.get("content-length");
			if (contentLength !== null) {
				const bytes = Number(contentLength);
				if (bytes > maxBytes) {
					throw new UserError(
						`Attachment too large (${(bytes / 1024 / 1024).toFixed(1)} MB, ` +
							`limit ${(maxBytes / 1024 / 1024).toFixed(0)} MB): ${url}`,
					);
				}
			}
		}
		// Non-OK HEAD (403, 405, etc.) → fall through to GET
	} catch (err) {
		if (err instanceof UserError) throw err;
		// Other HEAD failures (e.g. CDN connection reset) → proceed to GET
	}

	// ── 2. GET ───────────────────────────────────────────────────────────
	const response = await fetch(url, { redirect: "manual" });
	if (response.status >= 300 && response.status < 400) {
		throw new UserError(`Refusing to follow redirect for attachment URL: ${url}`);
	}
	if (!response.ok) {
		throw new UserError(`Failed to download attachment (HTTP ${response.status}): ${url}`);
	}

	// ── 3. Streamed body with size budget ────────────────────────────────
	const buffer = await readBodyWithLimit(response, url, maxBytes);
	const filename = new URL(url).pathname.split("/").pop() || "attachment";
	return { buffer, filename };
}

/**
 * Downloads each URL through the SSRF-safe pipeline and returns AttachmentBuilder
 * instances ready for discord.js send(). Runs all downloads in parallel
 * (Promise.all); if any URL fails the entire call rejects — no partial sends.
 *
 * @param urls         Syntactically-valid URLs (pre-validated by Zod schema).
 * @param maxFileBytes Per-file byte limit; defaults to 8 MB.
 */
export async function fetchAttachments(
	urls: string[],
	maxFileBytes: number = DEFAULT_MAX_FILE_BYTES,
): Promise<AttachmentBuilder[]> {
	return Promise.all(
		urls.map(async (url) => {
			const { buffer, filename } = await fetchPublicUrl(url, maxFileBytes);
			return new AttachmentBuilder(buffer, { name: filename });
		}),
	);
}

/**
 * SSRF-safe fetch of an image URL, returning a Buffer ready to pass to
 * discord.js APIs that would otherwise fetch the URL themselves
 * (e.g. guild.emojis.create({ attachment: <buffer> })). Mandatory for any
 * tool that takes a user-supplied image URL — discord.js does not perform
 * SSRF checks on URLs it fetches internally.
 */
export async function fetchImageBuffer(
	url: string,
	maxBytes: number = EMOJI_MAX_BYTES,
): Promise<Buffer> {
	const { buffer } = await fetchPublicUrl(url, maxBytes);
	return buffer;
}
