/**
 * Tests for native file attachment support across send_message, send_webhook_message,
 * and reply_to_thread.
 *
 * All HTTP calls are intercepted by replacing globalThis.fetch — no real network requests
 * are made. The original fetch is restored after each test.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { UserError } from "fastmcp";
import { registerMessageTools } from "../../tools/messages";
import { registerThreadTools } from "../../tools/threads";
import { registerWebhookTools } from "../../tools/webhooks";
import { createMockDiscordClient } from "../helpers/discord-mock";
import { CHANNEL_GENERAL, GUILD_FIXTURE, THREAD_ACTIVE, WEBHOOK_GITHUB } from "../helpers/fixtures";
import { createTestServer } from "../helpers/test-server";

// ── Mock fetch helpers ────────────────────────────────────────────────────────

const originalFetch = globalThis.fetch;

/** Replace globalThis.fetch with a mock that returns different responses for HEAD vs GET. */
function mockFetch(headResponse: object, getResponse: object): void {
	globalThis.fetch = mock(async (_url: string, opts?: RequestInit) =>
		opts?.method === "HEAD" ? headResponse : getResponse,
	) as unknown as typeof fetch;
}

/** Build a successful HEAD response, optionally with a content-length header. */
function okHead(contentLength?: number): object {
	return {
		ok: true,
		status: 200,
		headers: {
			get: (key: string) =>
				key === "content-length" && contentLength != null ? String(contentLength) : null,
		},
		arrayBuffer: async () => new ArrayBuffer(0),
	};
}

/** Build a successful GET response returning a buffer of the given byte size. */
function okGet(bytes: number): object {
	return {
		ok: true,
		status: 200,
		headers: { get: () => null },
		arrayBuffer: async () => new ArrayBuffer(bytes),
	};
}

/** Build a failed response (HEAD or GET). */
function failResponse(status: number): object {
	return {
		ok: false,
		status,
		headers: { get: () => null },
		arrayBuffer: async () => new ArrayBuffer(0),
	};
}

// ── send_message attachment tests ─────────────────────────────────────────────

describe("send_message — native attachments", () => {
	let callTool: ReturnType<typeof createTestServer>["callTool"];

	beforeEach(() => {
		const client = createMockDiscordClient();
		const harness = createTestServer();
		registerMessageTools(harness.server, client);
		callTool = harness.callTool;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("sends an attachments-only message", async () => {
		mockFetch(okHead(500), okGet(500));
		const result = await callTool("send_message", {
			channelId: CHANNEL_GENERAL.id,
			attachmentUrls: ["https://example.com/photo.jpg"],
		});
		expect(result).toContain("✅");
		expect(result).toContain("Message sent");
	});

	it("sends message + embeds + attachments together", async () => {
		mockFetch(okHead(500), okGet(500));
		const result = await callTool("send_message", {
			channelId: CHANNEL_GENERAL.id,
			message: "See attached",
			embeds: [{ title: "An embed" }],
			attachmentUrls: ["https://example.com/doc.pdf"],
		});
		expect(result).toContain("✅");
	});

	it("throws UserError when HEAD content-length exceeds tier limit (Tier 0 = 8 MB)", async () => {
		const overSize = 9 * 1024 * 1024; // 9 MB > 8 MB
		mockFetch(okHead(overSize), okGet(overSize));
		await expect(
			callTool("send_message", {
				channelId: CHANNEL_GENERAL.id,
				attachmentUrls: ["https://example.com/big.zip"],
			}),
		).rejects.toBeInstanceOf(UserError);
	});

	it("throws UserError when GET returns non-200", async () => {
		mockFetch(okHead(500), failResponse(403));
		await expect(
			callTool("send_message", {
				channelId: CHANNEL_GENERAL.id,
				attachmentUrls: ["https://example.com/private.png"],
			}),
		).rejects.toBeInstanceOf(UserError);
	});

	it("throws UserError when content-length absent but buffer exceeds limit post-download", async () => {
		const overSize = 9 * 1024 * 1024;
		mockFetch(okHead(), okGet(overSize)); // HEAD has no content-length
		await expect(
			callTool("send_message", {
				channelId: CHANNEL_GENERAL.id,
				attachmentUrls: ["https://example.com/surprise.bin"],
			}),
		).rejects.toBeInstanceOf(UserError);
	});

	it("succeeds when HEAD returns non-OK (CDN 403/405 fallthrough to GET)", async () => {
		// Many CDNs (S3, Cloudflare R2) return 403 on HEAD while allowing GET.
		// The server should fall through to GET and succeed.
		mockFetch(failResponse(403), okGet(500));
		const result = await callTool("send_message", {
			channelId: CHANNEL_GENERAL.id,
			attachmentUrls: ["https://s3.example.com/photo.jpg"],
		});
		expect(result).toContain("✅");
	});

	it("rejects malformed attachment URL at schema validation — no fetch called", async () => {
		// Zod .url() catches this before fetchAttachments is ever invoked
		await expect(
			callTool("send_message", {
				channelId: CHANNEL_GENERAL.id,
				attachmentUrls: ["not-a-url"],
			}),
		).rejects.toThrow();
	});

	it("rejects when no message, embeds, or attachmentUrls provided", async () => {
		await expect(callTool("send_message", { channelId: CHANNEL_GENERAL.id })).rejects.toThrow();
	});
});

// ── send_webhook_message attachment tests ─────────────────────────────────────

describe("send_webhook_message — native attachments", () => {
	let callTool: ReturnType<typeof createTestServer>["callTool"];

	beforeEach(() => {
		const client = createMockDiscordClient();
		const harness = createTestServer();
		registerWebhookTools(harness.server, client);
		callTool = harness.callTool;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("sends an attachments-only webhook message", async () => {
		mockFetch(okHead(500), okGet(500));
		const result = await callTool("send_webhook_message", {
			webhookUrl: WEBHOOK_GITHUB.url,
			attachmentUrls: ["https://example.com/photo.jpg"],
		});
		expect(result).toContain("✅");
		expect(result).toContain("Message sent via webhook");
	});

	it("sends webhook message with text + embeds + attachments", async () => {
		mockFetch(okHead(500), okGet(500));
		const result = await callTool("send_webhook_message", {
			webhookUrl: WEBHOOK_GITHUB.url,
			message: "Attached files:",
			embeds: [{ title: "Details" }],
			attachmentUrls: ["https://example.com/report.pdf"],
		});
		expect(result).toContain("✅");
	});

	it("throws UserError when attachment exceeds 8 MB limit (webhooks have no tier context)", async () => {
		const overSize = 9 * 1024 * 1024;
		mockFetch(okHead(overSize), okGet(overSize));
		await expect(
			callTool("send_webhook_message", {
				webhookUrl: WEBHOOK_GITHUB.url,
				attachmentUrls: ["https://example.com/big.zip"],
			}),
		).rejects.toBeInstanceOf(UserError);
	});
});

// ── reply_to_thread attachment tests ─────────────────────────────────────────

describe("reply_to_thread — native attachments", () => {
	let callTool: ReturnType<typeof createTestServer>["callTool"];

	beforeEach(() => {
		const client = createMockDiscordClient();
		const harness = createTestServer();
		registerThreadTools(harness.server, client, GUILD_FIXTURE.id);
		callTool = harness.callTool;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("sends an attachments-only thread reply", async () => {
		mockFetch(okHead(500), okGet(500));
		const result = await callTool("reply_to_thread", {
			threadId: THREAD_ACTIVE.id,
			attachmentUrls: ["https://example.com/image.png"],
		});
		expect(result).toContain("✅");
		expect(result).toContain("Reply sent");
	});

	it("sends thread reply with text + embeds + attachments", async () => {
		mockFetch(okHead(500), okGet(500));
		const result = await callTool("reply_to_thread", {
			threadId: THREAD_ACTIVE.id,
			message: "Here:",
			embeds: [{ image: { url: "https://example.com/img.jpg" } }],
			attachmentUrls: ["https://example.com/file.pdf"],
		});
		expect(result).toContain("✅");
	});

	it("throws UserError when attachment exceeds tier limit", async () => {
		const overSize = 9 * 1024 * 1024;
		mockFetch(okHead(overSize), okGet(overSize));
		await expect(
			callTool("reply_to_thread", {
				threadId: THREAD_ACTIVE.id,
				attachmentUrls: ["https://example.com/big.bin"],
			}),
		).rejects.toBeInstanceOf(UserError);
	});
});
