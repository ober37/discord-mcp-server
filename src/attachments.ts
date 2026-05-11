import { AttachmentBuilder } from "discord.js";
import { UserError } from "fastmcp";

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

/**
 * Returns the per-file upload limit for the given guild premium tier.
 * Falls back to 8 MB for unknown tier values.
 */
export function maxFileBytesForTier(premiumTier: number): number {
	return FILE_SIZE_BY_TIER[premiumTier] ?? DEFAULT_MAX_FILE_BYTES;
}

/**
 * Downloads each URL and returns AttachmentBuilder instances ready for discord.js send().
 *
 * Strategy:
 *   1. Advisory HEAD — detect oversized files before downloading. Non-fatal: many CDNs
 *      (S3, Cloudflare R2, Imgur) return 403/405 on HEAD while allowing GET. Any HEAD
 *      failure other than a confirmed size violation falls through to GET.
 *   2. GET — download the file.
 *   3. Post-download size guard — catches files where HEAD lacked content-length.
 *
 * Runs all downloads in parallel (Promise.all). If any URL fails the entire call rejects
 * — no partial sends to Discord.
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
			// ── 1. Advisory HEAD ─────────────────────────────────────────────────
			try {
				const head = await fetch(url, { method: "HEAD" });
				if (head.ok) {
					const contentLength = head.headers.get("content-length");
					if (contentLength !== null) {
						const bytes = Number(contentLength);
						if (bytes > maxFileBytes) {
							throw new UserError(
								`Attachment too large (${(bytes / 1024 / 1024).toFixed(1)} MB, ` +
									`limit ${(maxFileBytes / 1024 / 1024).toFixed(0)} MB): ${url}`,
							);
						}
					}
				}
				// Non-OK HEAD (403, 405, etc.) → fall through to GET
			} catch (err) {
				if (err instanceof UserError) throw err; // re-throw confirmed size violations
				// All other HEAD failures → proceed to GET and rely on post-download check
			}

			// ── 2. GET ───────────────────────────────────────────────────────────
			const response = await fetch(url);
			if (!response.ok) {
				throw new UserError(`Failed to download attachment (HTTP ${response.status}): ${url}`);
			}

			// ── 3. Post-download size guard ──────────────────────────────────────
			const buffer = Buffer.from(await response.arrayBuffer());
			if (buffer.byteLength > maxFileBytes) {
				throw new UserError(
					`Attachment too large (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB, ` +
						`limit ${(maxFileBytes / 1024 / 1024).toFixed(0)} MB): ${url}`,
				);
			}

			// ── 4. Build attachment ──────────────────────────────────────────────
			const filename = new URL(url).pathname.split("/").pop() || "attachment";
			return new AttachmentBuilder(buffer, { name: filename });
		}),
	);
}
