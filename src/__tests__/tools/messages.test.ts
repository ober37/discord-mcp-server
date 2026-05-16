import { beforeEach, describe, expect, it, mock } from "bun:test";
import { UserError } from "fastmcp";
import { registerMessageTools } from "../../tools/messages";
import { createCollection, createMockDiscordClient } from "../helpers/discord-mock";
import {
	BOT_USER,
	CHANNEL_GENERAL,
	CHANNEL_VOICE,
	MESSAGE_FROM_BOT,
	MESSAGE_SIMPLE,
	REGULAR_USER,
} from "../helpers/fixtures";
import { createTestServer } from "../helpers/test-server";

describe("message tools", () => {
	let client: ReturnType<typeof createMockDiscordClient>;
	let callTool: ReturnType<typeof createTestServer>["callTool"];

	beforeEach(() => {
		client = createMockDiscordClient();
		const harness = createTestServer();
		registerMessageTools(harness.server, client);
		callTool = harness.callTool;
	});

	describe("send_message", () => {
		it("sends a message and returns confirmation with ID", async () => {
			const result = await callTool("send_message", {
				channelId: CHANNEL_GENERAL.id,
				message: "Hello from test!",
			});
			expect(result).toContain("✅");
			expect(result).toContain("Message sent");
			expect(result).toContain("ID:");
			expect(result).toContain(`#${CHANNEL_GENERAL.name}`);
		});

		it("sends embeds-only message with image URL", async () => {
			const result = await callTool("send_message", {
				channelId: CHANNEL_GENERAL.id,
				embeds: [{ image: { url: "https://example.com/photo.jpg" } }],
			});
			expect(result).toContain("✅");
			expect(result).toContain("Message sent");
			expect(result).toContain(`#${CHANNEL_GENERAL.name}`);
		});

		it("sends message with both text and multiple image embeds", async () => {
			const result = await callTool("send_message", {
				channelId: CHANNEL_GENERAL.id,
				message: "Check these out:",
				embeds: [
					{ title: "Photo 1", image: { url: "https://example.com/1.jpg" } },
					{ title: "Photo 2", image: { url: "https://example.com/2.jpg" } },
				],
			});
			expect(result).toContain("✅");
			expect(result).toContain("Message sent");
		});

		it("sends embed with all optional fields", async () => {
			const result = await callTool("send_message", {
				channelId: CHANNEL_GENERAL.id,
				embeds: [
					{
						title: "My Title",
						description: "Some description",
						url: "https://example.com",
						color: 16734003,
						image: { url: "https://example.com/img.jpg" },
						thumbnail: { url: "https://example.com/thumb.jpg" },
						fields: [{ name: "Field 1", value: "Value 1", inline: true }],
					},
				],
			});
			expect(result).toContain("✅");
		});

		it("rejects when neither message nor embeds are provided", async () => {
			await expect(callTool("send_message", { channelId: CHANNEL_GENERAL.id })).rejects.toThrow();
		});

		it("rejects embed with malformed image URL", async () => {
			await expect(
				callTool("send_message", {
					channelId: CHANNEL_GENERAL.id,
					embeds: [{ image: { url: "not-a-url" } }],
				}),
			).rejects.toThrow();
		});

		it("rejects embed with empty image URL", async () => {
			await expect(
				callTool("send_message", {
					channelId: CHANNEL_GENERAL.id,
					embeds: [{ image: { url: "" } }],
				}),
			).rejects.toThrow();
		});

		it("throws UserError for voice channelId", async () => {
			try {
				await callTool("send_message", {
					channelId: CHANNEL_VOICE.id,
					message: "Hello",
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});
	});

	describe("read_messages", () => {
		it("returns formatted messages with author details", async () => {
			const result = await callTool("read_messages", {
				channelId: CHANNEL_GENERAL.id,
				count: 10,
			});
			expect(result).toContain(`Messages in #${CHANNEL_GENERAL.name}`);
			expect(result).toContain(REGULAR_USER.username);
			expect(result).toContain(MESSAGE_SIMPLE.content);
		});

		it("returns no-messages message for empty channel", async () => {
			const channel = await client.channels.fetch(CHANNEL_GENERAL.id);
			const originalFetch = channel.messages.fetch;
			channel.messages.fetch = async () => ({ size: 0, sort: () => ({ map: () => [] }) });

			const result = await callTool("read_messages", { channelId: CHANNEL_GENERAL.id });
			expect(result).toContain("No messages found");

			channel.messages.fetch = originalFetch;
		});

		it("throws UserError for voice channelId", async () => {
			try {
				await callTool("read_messages", { channelId: CHANNEL_VOICE.id });
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});
	});

	describe("edit_message", () => {
		it("edits a bot message and confirms", async () => {
			// Spy on the edit method
			const channel = await client.channels.fetch(CHANNEL_GENERAL.id);
			const msg = await channel.messages.fetch(MESSAGE_FROM_BOT.id);
			const editSpy = mock(() => Promise.resolve({ ...msg, content: "Updated content" }));
			msg.edit = editSpy;

			const result = await callTool("edit_message", {
				channelId: CHANNEL_GENERAL.id,
				messageId: MESSAGE_FROM_BOT.id,
				newMessage: "Updated content",
			});
			expect(result).toContain("✅");
			expect(result).toContain("edited successfully");
			expect(result).toContain(MESSAGE_FROM_BOT.id);
			expect(editSpy).toHaveBeenCalledTimes(1);
		});

		it("refuses to edit non-bot message", async () => {
			const result = await callTool("edit_message", {
				channelId: CHANNEL_GENERAL.id,
				messageId: MESSAGE_SIMPLE.id,
				newMessage: "Trying to edit",
			});
			expect(result).toContain("Cannot edit messages from other users");
		});

		it("throws UserError for voice channelId", async () => {
			try {
				await callTool("edit_message", {
					channelId: CHANNEL_VOICE.id,
					messageId: MESSAGE_FROM_BOT.id,
					newMessage: "Updated",
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});
	});

	describe("delete_message", () => {
		it("deletes a message and confirms", async () => {
			const channel = await client.channels.fetch(CHANNEL_GENERAL.id);
			const msg = await channel.messages.fetch(MESSAGE_SIMPLE.id);
			const deleteSpy = mock(() => Promise.resolve());
			msg.delete = deleteSpy;

			const result = await callTool("delete_message", {
				channelId: CHANNEL_GENERAL.id,
				messageId: MESSAGE_SIMPLE.id,
			});
			expect(result).toContain("✅");
			expect(result).toContain("deleted successfully");
			expect(result).toContain(MESSAGE_SIMPLE.id);
			expect(deleteSpy).toHaveBeenCalledTimes(1);
		});
	});

	describe("add_reaction", () => {
		it("adds a reaction and confirms with emoji", async () => {
			const channel = await client.channels.fetch(CHANNEL_GENERAL.id);
			const msg = await channel.messages.fetch(MESSAGE_SIMPLE.id);
			const reactSpy = mock(() => Promise.resolve());
			msg.react = reactSpy;

			const result = await callTool("add_reaction", {
				channelId: CHANNEL_GENERAL.id,
				messageId: MESSAGE_SIMPLE.id,
				emoji: "🎉",
			});
			expect(result).toContain("✅");
			expect(result).toContain("🎉");
			expect(result).toContain(MESSAGE_SIMPLE.id);
			expect(reactSpy).toHaveBeenCalledTimes(1);
		});
	});

	describe("remove_reaction", () => {
		it("removes a reaction and confirms", async () => {
			const result = await callTool("remove_reaction", {
				channelId: CHANNEL_GENERAL.id,
				messageId: MESSAGE_SIMPLE.id,
				emoji: "👍",
			});
			expect(result).toContain("✅");
			expect(result).toContain("Removed reaction");
			expect(result).toContain("👍");
			expect(result).toContain(MESSAGE_SIMPLE.id);
		});

		it("returns not-found message when emoji is not in cache", async () => {
			const channel = await client.channels.fetch(CHANNEL_GENERAL.id);
			const msg = await channel.messages.fetch(MESSAGE_SIMPLE.id);
			const removeSpy = mock(() => Promise.resolve());
			const originalGet = msg.reactions.cache.get;
			msg.reactions.cache.get = () => undefined;

			const result = await callTool("remove_reaction", {
				channelId: CHANNEL_GENERAL.id,
				messageId: MESSAGE_SIMPLE.id,
				emoji: "🔥",
			});

			expect(result).toContain("No reaction");
			expect(result).toContain("🔥");
			expect(removeSpy).not.toHaveBeenCalled();

			msg.reactions.cache.get = originalGet;
		});
	});

	describe("bulk_delete_messages", () => {
		it("deletes messages and returns count confirmation", async () => {
			const channel = await client.channels.fetch(CHANNEL_GENERAL.id);
			const bulkDeleteSpy = mock(() =>
				Promise.resolve(
					createCollection([
						[MESSAGE_SIMPLE.id, undefined],
						[MESSAGE_FROM_BOT.id, undefined],
					]),
				),
			);
			channel.bulkDelete = bulkDeleteSpy;

			const result = await callTool("bulk_delete_messages", {
				channelId: CHANNEL_GENERAL.id,
				messageIds: [MESSAGE_SIMPLE.id, MESSAGE_FROM_BOT.id],
			});
			expect(result).toContain("✅");
			expect(result).toContain("Bulk deleted");
			expect(result).toContain("2");
			expect(bulkDeleteSpy).toHaveBeenCalledTimes(1);
		});

		it("passes the exact IDs to bulkDelete", async () => {
			const channel = await client.channels.fetch(CHANNEL_GENERAL.id);
			const bulkDeleteSpy = mock((ids: string[]) =>
				Promise.resolve(createCollection(ids.map((id) => [id, undefined]))),
			);
			channel.bulkDelete = bulkDeleteSpy;

			const ids = [MESSAGE_SIMPLE.id, MESSAGE_FROM_BOT.id];
			await callTool("bulk_delete_messages", {
				channelId: CHANNEL_GENERAL.id,
				messageIds: ids,
			});
			expect(bulkDeleteSpy).toHaveBeenCalledWith(ids);
		});

		it("returns count=0 when bulkDelete returns empty collection", async () => {
			const channel = await client.channels.fetch(CHANNEL_GENERAL.id);
			channel.bulkDelete = mock(() => Promise.resolve(createCollection([])));

			const result = await callTool("bulk_delete_messages", {
				channelId: CHANNEL_GENERAL.id,
				messageIds: [MESSAGE_SIMPLE.id, MESSAGE_FROM_BOT.id],
			});
			expect(result).toContain("Bulk deleted 0");
		});

		it("rejects fewer than 2 message IDs", async () => {
			await expect(
				callTool("bulk_delete_messages", {
					channelId: CHANNEL_GENERAL.id,
					messageIds: [MESSAGE_SIMPLE.id],
				}),
			).rejects.toThrow();
		});

		it("rejects more than 100 message IDs", async () => {
			const ids = Array.from({ length: 101 }, (_, i) => `id-${i}`);
			await expect(
				callTool("bulk_delete_messages", {
					channelId: CHANNEL_GENERAL.id,
					messageIds: ids,
				}),
			).rejects.toThrow();
		});

		it("throws UserError for voice channelId", async () => {
			try {
				await callTool("bulk_delete_messages", {
					channelId: CHANNEL_VOICE.id,
					messageIds: [MESSAGE_SIMPLE.id, MESSAGE_FROM_BOT.id],
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});
	});

	describe("pin_message", () => {
		it("pins a message and confirms with message ID and channel name", async () => {
			const channel = await client.channels.fetch(CHANNEL_GENERAL.id);
			const msg = await channel.messages.fetch(MESSAGE_SIMPLE.id);
			const pinSpy = mock(() => Promise.resolve());
			msg.pin = pinSpy;

			const result = await callTool("pin_message", {
				channelId: CHANNEL_GENERAL.id,
				messageId: MESSAGE_SIMPLE.id,
			});
			expect(result).toContain("✅");
			expect(result).toContain(MESSAGE_SIMPLE.id);
			expect(result).toContain(`#${CHANNEL_GENERAL.name}`);
			expect(pinSpy).toHaveBeenCalledTimes(1);
		});

		it("throws UserError for voice channelId", async () => {
			try {
				await callTool("pin_message", {
					channelId: CHANNEL_VOICE.id,
					messageId: MESSAGE_SIMPLE.id,
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});

		it("throws UserError for unknown messageId", async () => {
			const channel = await client.channels.fetch(CHANNEL_GENERAL.id);
			channel.messages.fetch = async () => {
				throw new Error("Unknown Message");
			};

			try {
				await callTool("pin_message", {
					channelId: CHANNEL_GENERAL.id,
					messageId: "0000000000000000000",
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});
	});

	describe("unpin_message", () => {
		it("unpins a message and confirms with message ID and channel name", async () => {
			const channel = await client.channels.fetch(CHANNEL_GENERAL.id);
			const msg = await channel.messages.fetch(MESSAGE_SIMPLE.id);
			const unpinSpy = mock(() => Promise.resolve());
			msg.unpin = unpinSpy;

			const result = await callTool("unpin_message", {
				channelId: CHANNEL_GENERAL.id,
				messageId: MESSAGE_SIMPLE.id,
			});
			expect(result).toContain("✅");
			expect(result).toContain(MESSAGE_SIMPLE.id);
			expect(result).toContain(`#${CHANNEL_GENERAL.name}`);
			expect(unpinSpy).toHaveBeenCalledTimes(1);
		});

		it("throws UserError for voice channelId", async () => {
			try {
				await callTool("unpin_message", {
					channelId: CHANNEL_VOICE.id,
					messageId: MESSAGE_SIMPLE.id,
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});

		it("throws UserError for unknown messageId", async () => {
			const channel = await client.channels.fetch(CHANNEL_GENERAL.id);
			channel.messages.fetch = async () => {
				throw new Error("Unknown Message");
			};

			try {
				await callTool("unpin_message", {
					channelId: CHANNEL_GENERAL.id,
					messageId: "0000000000000000000",
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});
	});

	describe("get_pinned_messages", () => {
		it("returns formatted pinned list with count header", async () => {
			const result = await callTool("get_pinned_messages", {
				channelId: CHANNEL_GENERAL.id,
			});
			expect(result).toContain(`Pinned messages in #${CHANNEL_GENERAL.name} (1)`);
		});

		it("formatted output contains bot author tag", async () => {
			const result = await callTool("get_pinned_messages", {
				channelId: CHANNEL_GENERAL.id,
			});
			expect(result).toContain(BOT_USER.tag);
		});

		it("formatted output contains pinned message content", async () => {
			const result = await callTool("get_pinned_messages", {
				channelId: CHANNEL_GENERAL.id,
			});
			expect(result).toContain(MESSAGE_FROM_BOT.content);
		});

		it("returns 'No pinned messages' when channel has none", async () => {
			const channel = await client.channels.fetch(CHANNEL_GENERAL.id);
			channel.messages.fetchPinned = async () => createCollection([]);

			const result = await callTool("get_pinned_messages", {
				channelId: CHANNEL_GENERAL.id,
			});
			expect(result).toContain("No pinned messages");
		});

		it("throws UserError for voice channelId", async () => {
			try {
				await callTool("get_pinned_messages", {
					channelId: CHANNEL_VOICE.id,
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});
	});

	describe("get_reactions", () => {
		it("returns users list for 👍 emoji with count header", async () => {
			const result = await callTool("get_reactions", {
				channelId: CHANNEL_GENERAL.id,
				messageId: MESSAGE_SIMPLE.id,
				emoji: "👍",
			});
			expect(result).toContain(`Users who reacted with 👍 (1)`);
			expect(result).toContain(REGULAR_USER.tag);
			expect(result).toContain(REGULAR_USER.id);
		});

		it("returns user tag and ID in output", async () => {
			const result = await callTool("get_reactions", {
				channelId: CHANNEL_GENERAL.id,
				messageId: MESSAGE_SIMPLE.id,
				emoji: "👍",
			});
			expect(result).toContain(`${REGULAR_USER.tag} (ID: ${REGULAR_USER.id})`);
		});

		it("returns 'No reactions found' when emoji is not on the message", async () => {
			const result = await callTool("get_reactions", {
				channelId: CHANNEL_GENERAL.id,
				messageId: MESSAGE_SIMPLE.id,
				emoji: "🔥",
			});
			expect(result).toContain("No reactions found for 🔥");
			expect(result).toContain(MESSAGE_SIMPLE.id);
		});

		it("returns 'No users have reacted' when reaction exists but has zero users", async () => {
			const channel = await client.channels.fetch(CHANNEL_GENERAL.id);
			const msg = await channel.messages.fetch(MESSAGE_SIMPLE.id);
			msg.reactions.resolve = () => ({
				users: { fetch: async () => createCollection([]) },
			});

			const result = await callTool("get_reactions", {
				channelId: CHANNEL_GENERAL.id,
				messageId: MESSAGE_SIMPLE.id,
				emoji: "👍",
			});
			expect(result).toContain("No users have reacted with 👍");
		});

		it("throws UserError for unknown messageId", async () => {
			const channel = await client.channels.fetch(CHANNEL_GENERAL.id);
			channel.messages.fetch = async () => {
				throw new Error("Unknown Message");
			};

			try {
				await callTool("get_reactions", {
					channelId: CHANNEL_GENERAL.id,
					messageId: "0000000000000000000",
					emoji: "👍",
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});

		it("throws UserError for voice channelId", async () => {
			try {
				await callTool("get_reactions", {
					channelId: CHANNEL_VOICE.id,
					messageId: MESSAGE_SIMPLE.id,
					emoji: "👍",
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});
	});

	describe("clear_reactions", () => {
		it("clears all reactions and confirms with message ID", async () => {
			const channel = await client.channels.fetch(CHANNEL_GENERAL.id);
			const msg = await channel.messages.fetch(MESSAGE_SIMPLE.id);
			const removeAllSpy = mock(() => Promise.resolve());
			msg.reactions.removeAll = removeAllSpy;

			const result = await callTool("clear_reactions", {
				channelId: CHANNEL_GENERAL.id,
				messageId: MESSAGE_SIMPLE.id,
			});
			expect(result).toContain("✅");
			expect(result).toContain("All reactions cleared");
			expect(result).toContain(MESSAGE_SIMPLE.id);
			expect(removeAllSpy).toHaveBeenCalledTimes(1);
		});

		it("throws UserError for voice channelId", async () => {
			try {
				await callTool("clear_reactions", {
					channelId: CHANNEL_VOICE.id,
					messageId: MESSAGE_SIMPLE.id,
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});

		it("throws UserError for unknown messageId", async () => {
			const channel = await client.channels.fetch(CHANNEL_GENERAL.id);
			channel.messages.fetch = async () => {
				throw new Error("Unknown Message");
			};

			try {
				await callTool("clear_reactions", {
					channelId: CHANNEL_GENERAL.id,
					messageId: "0000000000000000000",
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});
	});
});
