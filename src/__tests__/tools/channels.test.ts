import { beforeEach, describe, expect, it, mock } from "bun:test";
import { UserError } from "fastmcp";
import { registerChannelTools } from "../../tools/channels";
import { createMockDiscordClient } from "../helpers/discord-mock";
import {
	CATEGORY_DEV,
	CATEGORY_GENERAL,
	CHANNEL_ANNOUNCEMENTS,
	CHANNEL_FORUM,
	CHANNEL_GENERAL,
	CHANNEL_VOICE,
	GUILD_FIXTURE,
	REGULAR_USER,
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

	describe("edit_channel", () => {
		it("edits a text channel with text-specific fields", async () => {
			const channel = await client.channels.fetch(CHANNEL_GENERAL.id);
			const editSpy = mock((_opts: unknown) => Promise.resolve());
			channel.edit = editSpy;

			const result = await callTool("edit_channel", {
				channelId: CHANNEL_GENERAL.id,
				name: "new-name",
				topic: "new topic",
				rateLimitPerUser: 5,
				nsfw: true,
			});
			expect(result).toContain("✅");
			expect(result).toContain(CHANNEL_GENERAL.id);
			expect(editSpy).toHaveBeenCalledTimes(1);
			const opts = editSpy.mock.calls[0][0] as Record<string, unknown>;
			expect(opts.name).toBe("new-name");
			expect(opts.topic).toBe("new topic");
			expect(opts.rateLimitPerUser).toBe(5);
			expect(opts.nsfw).toBe(true);
		});

		it("clears topic when empty string is passed", async () => {
			const channel = await client.channels.fetch(CHANNEL_GENERAL.id);
			const editSpy = mock((_opts: unknown) => Promise.resolve());
			channel.edit = editSpy;

			await callTool("edit_channel", { channelId: CHANNEL_GENERAL.id, topic: "" });
			const opts = editSpy.mock.calls[0][0] as Record<string, unknown>;
			expect(opts.topic).toBeNull();
		});

		it("edits a voice channel with voice-specific fields and ignores text-only fields", async () => {
			const channel = await client.channels.fetch(CHANNEL_VOICE.id);
			const editSpy = mock((_opts: unknown) => Promise.resolve());
			channel.edit = editSpy;

			await callTool("edit_channel", {
				channelId: CHANNEL_VOICE.id,
				name: "new-voice",
				topic: "ignored",
				bitrate: 64000,
				userLimit: 10,
			});
			const opts = editSpy.mock.calls[0][0] as Record<string, unknown>;
			expect(opts.name).toBe("new-voice");
			expect(opts.bitrate).toBe(64000);
			expect(opts.userLimit).toBe(10);
			expect(opts.topic).toBeUndefined();
		});

		it("edits a forum channel with topic and slowmode", async () => {
			const channel = await client.channels.fetch(CHANNEL_FORUM.id);
			const editSpy = mock((_opts: unknown) => Promise.resolve());
			channel.edit = editSpy;

			await callTool("edit_channel", {
				channelId: CHANNEL_FORUM.id,
				topic: "forum topic",
				rateLimitPerUser: 30,
			});
			const opts = editSpy.mock.calls[0][0] as Record<string, unknown>;
			expect(opts.topic).toBe("forum topic");
			expect(opts.rateLimitPerUser).toBe(30);
		});

		it("throws UserError for unknown channelId", async () => {
			try {
				await callTool("edit_channel", { channelId: "0000000000000000000", name: "test" });
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});

		it("does not send rateLimitPerUser to announcement channels (not supported by Discord API)", async () => {
			const channel = await client.channels.fetch(CHANNEL_ANNOUNCEMENTS.id);
			const editSpy = mock((_opts: unknown) => Promise.resolve());
			channel.edit = editSpy;

			await callTool("edit_channel", {
				channelId: CHANNEL_ANNOUNCEMENTS.id,
				topic: "announcement topic",
				rateLimitPerUser: 10, // should be ignored for announcement channels
			});
			const opts = editSpy.mock.calls[0][0] as Record<string, unknown>;
			expect(opts.topic).toBe("announcement topic");
			expect(opts.rateLimitPerUser).toBeUndefined();
		});

		it("throws UserError when no valid fields for channel type (voice with text-only fields)", async () => {
			try {
				await callTool("edit_channel", {
					channelId: CHANNEL_VOICE.id,
					topic: "text-only field on a voice channel",
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});

		it("throws UserError for channel type without edit()", async () => {
			const original = client.channels.fetch;
			client.channels.fetch = async () => ({ id: "no-edit", name: "no-edit" });
			try {
				await callTool("edit_channel", { channelId: "no-edit", name: "test" });
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			} finally {
				client.channels.fetch = original;
			}
		});
	});

	describe("create_forum_channel", () => {
		it("creates a forum channel", async () => {
			const result = await callTool("create_forum_channel", {
				name: "new-forum",
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("✅");
			expect(result).toContain("new-forum");
			expect(result).toContain("💬");
			expect(result).toContain("ID:");
		});

		it("creates a forum channel with category and topic", async () => {
			const result = await callTool("create_forum_channel", {
				name: "help-forum",
				guildId: GUILD_FIXTURE.id,
				categoryId: CATEGORY_DEV.id,
				topic: "Ask questions here",
			});
			expect(result).toContain("✅");
			expect(result).toContain("help-forum");
		});
	});

	describe("create_announcement_channel", () => {
		it("creates an announcement channel", async () => {
			const result = await callTool("create_announcement_channel", {
				name: "new-announcements",
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("✅");
			expect(result).toContain("new-announcements");
			expect(result).toContain("📢");
			expect(result).toContain("ID:");
		});

		it("creates an announcement channel with category and topic", async () => {
			const result = await callTool("create_announcement_channel", {
				name: "updates",
				guildId: GUILD_FIXTURE.id,
				categoryId: CATEGORY_GENERAL.id,
				topic: "Server updates",
			});
			expect(result).toContain("✅");
			expect(result).toContain("updates");
		});
	});

	describe("set_channel_permissions", () => {
		it("creates a permission overwrite with allow and deny", async () => {
			const channel = await client.channels.fetch(CHANNEL_GENERAL.id);
			const createSpy = mock(() => Promise.resolve());
			channel.permissionOverwrites = { create: createSpy, delete: async () => {} };

			const result = await callTool("set_channel_permissions", {
				channelId: CHANNEL_GENERAL.id,
				targetId: REGULAR_USER.id,
				allow: ["SendMessages"],
				deny: ["ManageMessages"],
			});
			expect(result).toContain("✅");
			expect(result).toContain(REGULAR_USER.id);
			expect(result).toContain(CHANNEL_GENERAL.id);
			expect(createSpy).toHaveBeenCalledTimes(1);
			// biome-ignore lint/suspicious/noExplicitAny: accessing mock call args dynamically
			const callArgs = createSpy.mock.calls[0] as any;
			expect(callArgs[0]).toBe(REGULAR_USER.id);
			expect(callArgs[1].SendMessages).toBe(true);
			expect(callArgs[1].ManageMessages).toBe(false);
		});

		it("removes an overwrite when deleteOverwrite is true", async () => {
			const channel = await client.channels.fetch(CHANNEL_GENERAL.id);
			const deleteSpy = mock((_targetId: string) => Promise.resolve());
			channel.permissionOverwrites = { create: async () => {}, delete: deleteSpy };

			const result = await callTool("set_channel_permissions", {
				channelId: CHANNEL_GENERAL.id,
				targetId: REGULAR_USER.id,
				deleteOverwrite: true,
			});
			expect(result).toContain("✅");
			expect(result).toContain("Removed");
			expect(deleteSpy).toHaveBeenCalledTimes(1);
			expect(deleteSpy.mock.calls[0][0]).toBe(REGULAR_USER.id);
		});

		it("throws UserError for unknown channelId", async () => {
			try {
				await callTool("set_channel_permissions", {
					channelId: "0000000000000000000",
					targetId: REGULAR_USER.id,
					allow: ["SendMessages"],
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});

		it("throws UserError when no allow or deny provided and not deleting", async () => {
			try {
				await callTool("set_channel_permissions", {
					channelId: CHANNEL_GENERAL.id,
					targetId: REGULAR_USER.id,
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});

		it("throws UserError when same flag appears in both allow and deny", async () => {
			try {
				await callTool("set_channel_permissions", {
					channelId: CHANNEL_GENERAL.id,
					targetId: REGULAR_USER.id,
					allow: ["SendMessages"],
					deny: ["SendMessages"],
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});

		it("throws UserError for invalid permission flag name", async () => {
			try {
				await callTool("set_channel_permissions", {
					channelId: CHANNEL_GENERAL.id,
					targetId: REGULAR_USER.id,
					allow: ["InvalidPermissionName"],
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});

		it("throws UserError for channel type without permissionOverwrites", async () => {
			const original = client.channels.fetch;
			client.channels.fetch = async () => ({ id: "no-perms", name: "no-perms" });
			try {
				await callTool("set_channel_permissions", {
					channelId: "no-perms",
					targetId: REGULAR_USER.id,
					allow: ["SendMessages"],
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			} finally {
				client.channels.fetch = original;
			}
		});
	});
});
