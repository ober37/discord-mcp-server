import { beforeEach, describe, expect, it, mock } from "bun:test";
import { registerChannelTools } from "../../tools/channels";
import { createMockDiscordClient } from "../helpers/discord-mock";
import {
	CATEGORY_DEV,
	CATEGORY_GENERAL,
	CHANNEL_GENERAL,
	GUILD_FIXTURE,
} from "../helpers/fixtures";
import { createTestServer } from "../helpers/test-server";

describe("channel tools", () => {
	let client: ReturnType<typeof createMockDiscordClient>;
	let callTool: ReturnType<typeof createTestServer>["callTool"];

	beforeEach(() => {
		client = createMockDiscordClient();
		const harness = createTestServer();
		registerChannelTools(harness.server, client, GUILD_FIXTURE.id);
		callTool = harness.callTool;
	});

	describe("list_channels", () => {
		it("returns channels organized by category", async () => {
			const result = await callTool("list_channels", {
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain(CHANNEL_GENERAL.name);
			expect(result).toContain("dev-chat");
			expect(result).toContain(`📁 **${CATEGORY_GENERAL.name}**`);
			expect(result).toContain(`📁 **${CATEGORY_DEV.name}**`);
			expect(result).toContain(`ID: ${CHANNEL_GENERAL.id}`);
		});
	});

	describe("find_channel", () => {
		it("finds a channel by partial name", async () => {
			const result = await callTool("find_channel", {
				channelName: "gen",
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain(CHANNEL_GENERAL.name);
			expect(result).toContain(CHANNEL_GENERAL.id);
			expect(result).toContain("Found");
		});

		it("returns no-match message for unknown channel", async () => {
			const result = await callTool("find_channel", {
				channelName: "nonexistent-xyz",
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("No channels found");
			expect(result).toContain("nonexistent-xyz");
		});
	});

	describe("create_text_channel", () => {
		it("creates a new text channel", async () => {
			const result = await callTool("create_text_channel", {
				name: "new-channel",
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("✅");
			expect(result).toContain("new-channel");
			expect(result).toContain("ID:");
		});
	});

	describe("create_voice_channel", () => {
		it("creates a new voice channel", async () => {
			const result = await callTool("create_voice_channel", {
				name: "New Voice",
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("✅");
			expect(result).toContain("New Voice");
			expect(result).toContain("🔊");
		});
	});

	describe("delete_channel", () => {
		it("deletes a channel and reports success", async () => {
			// Spy on the delete method to verify it was called
			const channel = await client.channels.fetch(CHANNEL_GENERAL.id);
			const deleteSpy = mock(() => Promise.resolve());
			channel.delete = deleteSpy;

			const result = await callTool("delete_channel", {
				channelId: CHANNEL_GENERAL.id,
			});
			expect(result).toContain("✅");
			expect(result).toContain("Deleted");
			expect(result).toContain(CHANNEL_GENERAL.name);
			expect(result).toContain(CHANNEL_GENERAL.id);
			expect(deleteSpy).toHaveBeenCalledTimes(1);
		});
	});

	describe("create_category", () => {
		it("creates a new category", async () => {
			const result = await callTool("create_category", {
				name: "New Category",
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("✅");
			expect(result).toContain("New Category");
			expect(result).toContain("📁");
		});
	});

	describe("list_categories", () => {
		it("returns all categories with their channels", async () => {
			const result = await callTool("list_categories", {
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain(CATEGORY_GENERAL.name);
			expect(result).toContain(CATEGORY_DEV.name);
			expect(result).toContain(`ID: ${CATEGORY_GENERAL.id}`);
			expect(result).toContain("channel(s)");
		});
	});

	describe("move_channel", () => {
		it("moves a channel to a category", async () => {
			// Spy on setParent to verify it was called with the right category
			const channel = await client.channels.fetch(CHANNEL_GENERAL.id);
			const setParentSpy = mock(() => Promise.resolve());
			channel.setParent = setParentSpy;

			const result = await callTool("move_channel", {
				channelId: CHANNEL_GENERAL.id,
				categoryId: CATEGORY_DEV.id,
			});
			expect(result).toContain("✅");
			expect(result).toContain("Moved");
			expect(result).toContain(CHANNEL_GENERAL.name);
			expect(result).toContain(CATEGORY_DEV.id);
			expect(setParentSpy).toHaveBeenCalledTimes(1);
		});
	});
});
