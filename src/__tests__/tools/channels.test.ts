import { beforeEach, describe, expect, it, mock } from "bun:test";
import { UserError } from "fastmcp";
import { registerChannelTools } from "../../tools/channels";
import { createMockDiscordClient } from "../helpers/discord-mock";
import {
	CATEGORY_DEV,
	CATEGORY_GENERAL,
	CHANNEL_GENERAL,
	CHANNEL_VOICE,
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

		it("returns no-channels message for empty guild", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const originalCache = guild.channels.cache;
			const emptyChain = { size: 0, values: () => [][Symbol.iterator](), map: () => [] };
			guild.channels.cache = {
				size: 0,
				filter: () => ({ ...emptyChain, sort: () => emptyChain }),
				map: () => [],
			};

			const result = await callTool("list_channels", { guildId: GUILD_FIXTURE.id });
			expect(result).toContain("No channels found");

			guild.channels.cache = originalCache;
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

		it("throws UserError for unknown channelId", async () => {
			try {
				await callTool("delete_channel", { channelId: "0000000000000000000" });
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});

		it("throws UserError for channel type that cannot be deleted", async () => {
			const original = client.channels.fetch;
			client.channels.fetch = async () => ({ id: "no-delete", name: "no-delete" }); // no delete()
			try {
				await callTool("delete_channel", { channelId: "no-delete" });
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			} finally {
				client.channels.fetch = original;
			}
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

		it("returns no-categories message when guild has none", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const originalCache = guild.channels.cache;
			// Replace cache with one that contains no category-type channels
			guild.channels.cache = {
				size: 0,
				filter: () => ({ size: 0, sort: () => ({ size: 0, map: () => [] }) }),
				sort: () => ({ size: 0, map: () => [] }),
				map: () => [],
			};

			const result = await callTool("list_categories", { guildId: GUILD_FIXTURE.id });
			expect(result).toContain("No categories found");

			guild.channels.cache = originalCache;
		});
	});

	describe("move_channel", () => {
		it("moves a channel to a category", async () => {
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

		it("throws UserError for unknown channelId", async () => {
			try {
				await callTool("move_channel", {
					channelId: "0000000000000000000",
					categoryId: CATEGORY_DEV.id,
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});

		it("throws UserError for channel type that cannot be moved", async () => {
			const original = client.channels.fetch;
			client.channels.fetch = async () => ({ id: "no-move", name: "no-move" }); // no setParent()
			try {
				await callTool("move_channel", {
					channelId: "no-move",
					categoryId: CATEGORY_DEV.id,
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			} finally {
				client.channels.fetch = original;
			}
		});

		it("uses voice channel ID — still works since voice supports setParent", async () => {
			const channel = await client.channels.fetch(CHANNEL_VOICE.id);
			const setParentSpy = mock(() => Promise.resolve());
			channel.setParent = setParentSpy;

			const result = await callTool("move_channel", {
				channelId: CHANNEL_VOICE.id,
				categoryId: CATEGORY_GENERAL.id,
			});
			expect(result).toContain("✅");
			expect(setParentSpy).toHaveBeenCalledTimes(1);
		});
	});
});
