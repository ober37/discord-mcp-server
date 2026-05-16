import { beforeEach, describe, expect, it, mock } from "bun:test";
import { UserError } from "fastmcp";
import { registerWebhookTools } from "../../tools/webhooks";
import { createMockDiscordClient } from "../helpers/discord-mock";
import {
	CHANNEL_GENERAL,
	CHANNEL_VOICE,
	WEBHOOK_GITHUB,
	WEBHOOK_MONITORING,
} from "../helpers/fixtures";
import { createTestServer } from "../helpers/test-server";

describe("webhook tools", () => {
	let client: ReturnType<typeof createMockDiscordClient>;
	let callTool: ReturnType<typeof createTestServer>["callTool"];

	beforeEach(() => {
		client = createMockDiscordClient();
		const harness = createTestServer();
		registerWebhookTools(harness.server, client);
		callTool = harness.callTool;
	});

	describe("list_webhooks", () => {
		it("returns webhooks for a channel with details", async () => {
			const result = await callTool("list_webhooks", {
				channelId: CHANNEL_GENERAL.id,
			});
			expect(result).toContain(WEBHOOK_GITHUB.name);
			expect(result).toContain(WEBHOOK_MONITORING.name);
			expect(result).toContain(`ID: ${WEBHOOK_GITHUB.id}`);
		});

		it("throws UserError for voice channel (does not support webhooks)", async () => {
			await expect(
				callTool("list_webhooks", { channelId: CHANNEL_VOICE.id }),
			).rejects.toBeInstanceOf(UserError);
		});
	});

	describe("create_webhook", () => {
		it("creates a new webhook and returns URL", async () => {
			const result = await callTool("create_webhook", {
				channelId: CHANNEL_GENERAL.id,
				name: "Test Webhook",
			});
			expect(result).toContain("✅");
			expect(result).toContain("Created webhook");
			expect(result).toContain("Test Webhook");
			expect(result).toContain("URL:");
		});

		it("throws UserError for voice channel (does not support webhooks)", async () => {
			await expect(
				callTool("create_webhook", {
					channelId: CHANNEL_VOICE.id,
					name: "Test",
				}),
			).rejects.toBeInstanceOf(UserError);
		});
	});

	describe("delete_webhook", () => {
		it("deletes a webhook and confirms", async () => {
			// fetchWebhook returns a mock webhook — spy on its delete
			const webhook = await client.fetchWebhook(WEBHOOK_GITHUB.id);
			const deleteSpy = mock(() => Promise.resolve());
			// Override fetchWebhook for this test to return our spied version
			const originalFetch = client.fetchWebhook;
			client.fetchWebhook = mock(async (id: string, token?: string) => {
				if (id === WEBHOOK_GITHUB.id && !token) {
					return { ...webhook, delete: deleteSpy };
				}
				return originalFetch(id, token);
			});

			const result = await callTool("delete_webhook", {
				webhookId: WEBHOOK_GITHUB.id,
			});
			expect(result).toContain("✅");
			expect(result).toContain("Deleted webhook");
			expect(result).toContain(WEBHOOK_GITHUB.name);
			expect(result).toContain(WEBHOOK_GITHUB.id);
			expect(deleteSpy).toHaveBeenCalledTimes(1);
		});
	});

	describe("send_webhook_message", () => {
		it("sends a message via webhook URL", async () => {
			const result = await callTool("send_webhook_message", {
				webhookUrl: WEBHOOK_GITHUB.url,
				message: "Hello from webhook!",
			});
			expect(result).toContain("✅");
			expect(result).toContain("Message sent via webhook");
		});

		it("sends embeds-only message via webhook", async () => {
			const result = await callTool("send_webhook_message", {
				webhookUrl: WEBHOOK_GITHUB.url,
				embeds: [{ image: { url: "https://example.com/photo.jpg" } }],
			});
			expect(result).toContain("✅");
			expect(result).toContain("Message sent via webhook");
		});

		it("sends message with both text and embeds via webhook", async () => {
			const result = await callTool("send_webhook_message", {
				webhookUrl: WEBHOOK_GITHUB.url,
				message: "Here are some images:",
				embeds: [
					{ title: "Image 1", image: { url: "https://example.com/1.jpg" } },
					{ title: "Image 2", image: { url: "https://example.com/2.jpg" } },
				],
			});
			expect(result).toContain("✅");
		});

		it("rejects when neither message nor embeds are provided", async () => {
			await expect(
				callTool("send_webhook_message", { webhookUrl: WEBHOOK_GITHUB.url }),
			).rejects.toThrow();
		});

		it("rejects webhook embed with malformed image URL", async () => {
			await expect(
				callTool("send_webhook_message", {
					webhookUrl: WEBHOOK_GITHUB.url,
					embeds: [{ image: { url: "not-a-url" } }],
				}),
			).rejects.toThrow();
		});

		it("throws UserError for invalid webhook URL format", async () => {
			await expect(
				callTool("send_webhook_message", {
					webhookUrl: "https://example.com/not-a-webhook",
					message: "Oops",
				}),
			).rejects.toBeInstanceOf(UserError);
		});

		it("calls webhook.send with correct content and username override", async () => {
			const sendSpy = mock(() => Promise.resolve({ id: "sent-msg" }));
			const originalFetch = client.fetchWebhook;
			client.fetchWebhook = mock(async () => ({
				name: WEBHOOK_GITHUB.name,
				send: sendSpy,
			}));

			await callTool("send_webhook_message", {
				webhookUrl: WEBHOOK_GITHUB.url,
				message: "Hello from test",
				username: "CustomBot",
			});

			expect(sendSpy).toHaveBeenCalledTimes(1);
			expect(sendSpy).toHaveBeenCalledWith(
				expect.objectContaining({ content: "Hello from test", username: "CustomBot" }),
			);

			client.fetchWebhook = originalFetch;
		});

		it("accepts discordapp.com domain variant in URL", async () => {
			const result = await callTool("send_webhook_message", {
				webhookUrl: "https://discordapp.com/api/webhooks/9900000000000000001/abc123token",
				message: "Alt domain",
			});
			expect(result).toContain("✅");
		});
	});

	describe("edit_webhook", () => {
		it("edits a webhook name", async () => {
			const result = await callTool("edit_webhook", {
				webhookId: WEBHOOK_GITHUB.id,
				name: "Updated Webhook",
			});
			expect(result).toContain("✅");
			expect(result).toContain("Updated webhook");
			expect(result).toContain(WEBHOOK_GITHUB.id);
		});

		it("returns no-changes message when no updates specified", async () => {
			const result = await callTool("edit_webhook", {
				webhookId: WEBHOOK_GITHUB.id,
			});
			expect(result).toContain("No changes specified");
		});

		it("calls webhook.edit with the correct updates object", async () => {
			const editSpy = mock(() => Promise.resolve({}));
			const originalFetch = client.fetchWebhook;
			client.fetchWebhook = mock(async () => ({
				name: WEBHOOK_GITHUB.name,
				edit: editSpy,
			}));

			await callTool("edit_webhook", {
				webhookId: WEBHOOK_GITHUB.id,
				name: "Renamed",
			});

			expect(editSpy).toHaveBeenCalledTimes(1);
			expect(editSpy).toHaveBeenCalledWith(expect.objectContaining({ name: "Renamed" }));

			client.fetchWebhook = originalFetch;
		});
	});
});
