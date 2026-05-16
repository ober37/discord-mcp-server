import { beforeEach, describe, expect, it, mock } from "bun:test";
import { UserError } from "fastmcp";
import { registerThreadTools } from "../../tools/threads";
import { createMockDiscordClient } from "../helpers/discord-mock";
import {
	CHANNEL_DEV_CHAT,
	CHANNEL_FORUM,
	CHANNEL_VOICE,
	GUILD_FIXTURE,
	MESSAGE_SIMPLE,
	REGULAR_USER,
	THREAD_ACTIVE,
	THREAD_ARCHIVED,
	THREAD_PRIVATE,
} from "../helpers/fixtures";
import { createTestServer } from "../helpers/test-server";

describe("thread tools", () => {
	let client: ReturnType<typeof createMockDiscordClient>;
	let callTool: ReturnType<typeof createTestServer>["callTool"];

	beforeEach(() => {
		client = createMockDiscordClient();
		const harness = createTestServer();
		registerThreadTools(harness.server, client, GUILD_FIXTURE.id);
		callTool = harness.callTool;
	});

	describe("list_threads", () => {
		it("returns active threads for a guild", async () => {
			const result = await callTool("list_threads", {
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain(THREAD_ACTIVE.name);
			expect(result).toContain(`ID: ${THREAD_ACTIVE.id}`);
			expect(result).toContain("🟢 Active");
		});

		it("returns no-threads message when guild has no active threads", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const originalFetch = guild.channels.fetchActiveThreads;
			guild.channels.fetchActiveThreads = async () => ({
				threads: { values: () => [][Symbol.iterator]() },
			});

			const result = await callTool("list_threads", { guildId: GUILD_FIXTURE.id });
			expect(result).toContain("No active threads found");

			guild.channels.fetchActiveThreads = originalFetch;
		});

		it("returns threads for a specific channel", async () => {
			const result = await callTool("list_threads", {
				guildId: GUILD_FIXTURE.id,
				channelId: CHANNEL_DEV_CHAT.id,
			});
			expect(result).toContain(THREAD_ACTIVE.name);
			expect(result).toContain(THREAD_ARCHIVED.name);
			expect(result).toContain("📦 Archived");
		});

		it("returns no-threads message when channel has no threads", async () => {
			const channel = await client.channels.fetch(CHANNEL_DEV_CHAT.id);
			const empty = async () => ({ threads: { values: () => [][Symbol.iterator]() } });
			channel.threads.fetchActive = empty;
			channel.threads.fetchArchived = empty;

			const result = await callTool("list_threads", {
				guildId: GUILD_FIXTURE.id,
				channelId: CHANNEL_DEV_CHAT.id,
			});
			expect(result).toContain("No threads found");
		});

		it("throws UserError for voice channelId (does not support threads)", async () => {
			await expect(
				callTool("list_threads", {
					guildId: GUILD_FIXTURE.id,
					channelId: CHANNEL_VOICE.id,
				}),
			).rejects.toBeInstanceOf(UserError);
		});
	});

	describe("create_thread", () => {
		it("creates a thread from a message", async () => {
			const result = await callTool("create_thread", {
				channelId: CHANNEL_DEV_CHAT.id,
				name: "New Discussion",
				messageId: MESSAGE_SIMPLE.id,
			});
			expect(result).toContain("✅");
			expect(result).toContain("Created thread");
			expect(result).toContain("New Discussion");
			expect(result).toContain("ID:");
			expect(result).toContain(MESSAGE_SIMPLE.id);
		});

		it("creates a standalone thread", async () => {
			const result = await callTool("create_thread", {
				channelId: CHANNEL_DEV_CHAT.id,
				name: "Standalone Thread",
			});
			expect(result).toContain("✅");
			expect(result).toContain("Created thread");
			expect(result).toContain("Standalone Thread");
			expect(result).toContain(`#${CHANNEL_DEV_CHAT.name}`);
		});

		it("requires message content for forum posts", async () => {
			try {
				await callTool("create_thread", {
					channelId: CHANNEL_FORUM.id,
					name: "Forum Post",
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
				expect((e as UserError).message).toContain("message is required");
			}
		});

		it("creates a forum post successfully when message is provided", async () => {
			const result = await callTool("create_thread", {
				channelId: CHANNEL_FORUM.id,
				name: "Help Request",
				message: "How do I do X?",
			});
			expect(result).toContain("✅");
			expect(result).toContain("forum post");
			expect(result).toContain("Help Request");
		});

		it("sends initial message into standalone thread when message arg is provided", async () => {
			const channel = await client.channels.fetch(CHANNEL_DEV_CHAT.id);
			const sendSpy = mock(() => Promise.resolve({ id: "new-msg-id", content: "Hello thread" }));
			channel.threads.create = mock(async () => ({
				id: "new-thread-id",
				name: "My Thread",
				send: sendSpy,
			}));

			await callTool("create_thread", {
				channelId: CHANNEL_DEV_CHAT.id,
				name: "My Thread",
				message: "Hello thread",
			});

			expect(sendSpy).toHaveBeenCalledWith("Hello thread");
		});

		it("sends message into thread-from-message when message arg is also provided", async () => {
			const channel = await client.channels.fetch(CHANNEL_DEV_CHAT.id);
			const sendSpy = mock(() => Promise.resolve({ id: "reply-id" }));
			const msg = await channel.messages.fetch(MESSAGE_SIMPLE.id);
			msg.startThread = mock(async () => ({
				id: "new-from-msg-thread",
				name: "Forked Thread",
				send: sendSpy,
			}));

			await callTool("create_thread", {
				channelId: CHANNEL_DEV_CHAT.id,
				name: "Forked Thread",
				messageId: MESSAGE_SIMPLE.id,
				message: "First reply",
			});

			expect(sendSpy).toHaveBeenCalledWith("First reply");
		});
	});

	describe("reply_to_thread", () => {
		it("sends a reply in a thread", async () => {
			const thread = await client.channels.fetch(THREAD_ACTIVE.id);
			const sendSpy = mock(() => Promise.resolve({ id: "new-reply-id", content: "Thread reply" }));
			thread.send = sendSpy;

			const result = await callTool("reply_to_thread", {
				threadId: THREAD_ACTIVE.id,
				message: "Thread reply",
			});
			expect(result).toContain("✅");
			expect(result).toContain("Reply sent");
			expect(result).toContain(THREAD_ACTIVE.name);
			expect(sendSpy).toHaveBeenCalledTimes(1);
		});

		it("sends embeds-only reply in a thread", async () => {
			const result = await callTool("reply_to_thread", {
				threadId: THREAD_ACTIVE.id,
				embeds: [{ image: { url: "https://example.com/photo.jpg" } }],
			});
			expect(result).toContain("✅");
			expect(result).toContain("Reply sent");
			expect(result).toContain(THREAD_ACTIVE.name);
		});

		it("sends reply with both text and embeds in a thread", async () => {
			const result = await callTool("reply_to_thread", {
				threadId: THREAD_ACTIVE.id,
				message: "Here's the image:",
				embeds: [{ title: "Photo", image: { url: "https://example.com/photo.jpg" } }],
			});
			expect(result).toContain("✅");
			expect(result).toContain("Reply sent");
		});

		it("rejects when neither message nor embeds are provided", async () => {
			await expect(callTool("reply_to_thread", { threadId: THREAD_ACTIVE.id })).rejects.toThrow();
		});

		it("rejects thread reply embed with malformed image URL", async () => {
			await expect(
				callTool("reply_to_thread", {
					threadId: THREAD_ACTIVE.id,
					embeds: [{ image: { url: "not-a-url" } }],
				}),
			).rejects.toThrow();
		});
	});

	describe("get_thread", () => {
		it("returns thread details with messages", async () => {
			const result = await callTool("get_thread", {
				threadId: THREAD_ACTIVE.id,
				messageCount: 10,
			});
			expect(result).toContain(`Thread: ${THREAD_ACTIVE.name}`);
			expect(result).toContain(`ID: ${THREAD_ACTIVE.id}`);
			expect(result).toContain("Archived: No");
			expect(result).toContain("Recent Messages");
		});

		it("shows no-messages text when thread is empty", async () => {
			const thread = await client.channels.fetch(THREAD_ACTIVE.id);
			thread.messages.fetch = async () => ({
				size: 0,
				sort: () => ({ map: () => [] }),
			});

			const result = await callTool("get_thread", { threadId: THREAD_ACTIVE.id });
			expect(result).toContain("No messages in this thread");
			expect(result).toContain(`Thread: ${THREAD_ACTIVE.name}`);
		});
	});

	describe("archive_thread", () => {
		it("archives a thread", async () => {
			const thread = await client.channels.fetch(THREAD_ACTIVE.id);
			const editSpy = mock(async () => {});
			thread.edit = editSpy;

			const result = await callTool("archive_thread", { threadId: THREAD_ACTIVE.id });
			expect(result).toContain("✅");
			expect(result).toContain("archived");
			expect(result).toContain(THREAD_ACTIVE.name);
			expect(editSpy).toHaveBeenCalledWith({ archived: true });
		});

		it("unarchives a thread", async () => {
			const thread = await client.channels.fetch(THREAD_ACTIVE.id);
			const editSpy = mock(async () => {});
			thread.edit = editSpy;

			const result = await callTool("archive_thread", {
				threadId: THREAD_ACTIVE.id,
				archived: false,
			});
			expect(result).toContain("✅");
			expect(result).toContain("unarchived");
			expect(editSpy).toHaveBeenCalledWith({ archived: false });
		});

		it("throws UserError for unknown threadId", async () => {
			try {
				await callTool("archive_thread", { threadId: "0000000000000000000" });
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});
	});

	describe("lock_thread", () => {
		it("locks a thread", async () => {
			const thread = await client.channels.fetch(THREAD_ACTIVE.id);
			const editSpy = mock(async () => {});
			thread.edit = editSpy;

			const result = await callTool("lock_thread", { threadId: THREAD_ACTIVE.id });
			expect(result).toContain("✅");
			expect(result).toContain("locked");
			expect(result).toContain(THREAD_ACTIVE.name);
			expect(editSpy).toHaveBeenCalledWith({ locked: true });
		});

		it("unlocks a thread", async () => {
			const thread = await client.channels.fetch(THREAD_ACTIVE.id);
			const editSpy = mock(async () => {});
			thread.edit = editSpy;

			const result = await callTool("lock_thread", {
				threadId: THREAD_ACTIVE.id,
				locked: false,
			});
			expect(result).toContain("✅");
			expect(result).toContain("unlocked");
			expect(editSpy).toHaveBeenCalledWith({ locked: false });
		});

		it("throws UserError for unknown threadId", async () => {
			try {
				await callTool("lock_thread", { threadId: "0000000000000000000" });
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});
	});

	describe("add_thread_member", () => {
		it("adds a user to a private thread", async () => {
			const thread = await client.channels.fetch(THREAD_PRIVATE.id);
			const addSpy = mock(async () => {});
			thread.members.add = addSpy;

			const result = await callTool("add_thread_member", {
				threadId: THREAD_PRIVATE.id,
				userId: REGULAR_USER.id,
			});
			expect(result).toContain("✅");
			expect(result).toContain(REGULAR_USER.id);
			expect(result).toContain(THREAD_PRIVATE.name);
			expect(addSpy).toHaveBeenCalledWith(REGULAR_USER.id);
		});

		it("throws UserError for public thread", async () => {
			try {
				await callTool("add_thread_member", {
					threadId: THREAD_ACTIVE.id,
					userId: REGULAR_USER.id,
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
				expect((e as UserError).message).toContain("private threads");
			}
		});

		it("throws UserError for unknown threadId", async () => {
			try {
				await callTool("add_thread_member", {
					threadId: "0000000000000000000",
					userId: REGULAR_USER.id,
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});
	});

	describe("remove_thread_member", () => {
		it("removes a user from a private thread", async () => {
			const thread = await client.channels.fetch(THREAD_PRIVATE.id);
			const removeSpy = mock(async () => {});
			thread.members.remove = removeSpy;

			const result = await callTool("remove_thread_member", {
				threadId: THREAD_PRIVATE.id,
				userId: REGULAR_USER.id,
			});
			expect(result).toContain("✅");
			expect(result).toContain(REGULAR_USER.id);
			expect(result).toContain(THREAD_PRIVATE.name);
			expect(removeSpy).toHaveBeenCalledWith(REGULAR_USER.id);
		});

		it("throws UserError for public thread", async () => {
			try {
				await callTool("remove_thread_member", {
					threadId: THREAD_ACTIVE.id,
					userId: REGULAR_USER.id,
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
				expect((e as UserError).message).toContain("private threads");
			}
		});

		it("throws UserError for unknown threadId", async () => {
			try {
				await callTool("remove_thread_member", {
					threadId: "0000000000000000000",
					userId: REGULAR_USER.id,
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});
	});
});
