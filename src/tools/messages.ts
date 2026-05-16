import type { Client, TextChannel } from "discord.js";
import type { FastMCP } from "fastmcp";
import { UserError } from "fastmcp";
import { z } from "zod/v4";
import { DEFAULT_MAX_FILE_BYTES, fetchAttachments, maxFileBytesForTier } from "../attachments.ts";
import { attachmentUrlsParam, embedsParam } from "../schemas.ts";
import { formatMessage, withDiscordErrorHandling } from "../utils.ts";

export function registerMessageTools(
	server: FastMCP,
	client: Client,
	_defaultGuildId?: string,
): void {
	server.addTool({
		name: "send_message",
		description:
			"Send a message to a Discord channel. Supports plain text, embeds (images, titles, descriptions), " +
			"and native file attachments fetched server-side from URLs. " +
			"At least one of `message`, `embeds`, or `attachmentUrls` must be provided. " +
			"Returns the sent message ID.",
		parameters: z
			.object({
				channelId: z.string().describe("ID of the channel to send the message to."),
				message: z
					.string()
					.optional()
					.describe(
						"Text content to send (max 2000 characters). Optional if embeds or attachmentUrls are provided.",
					),
				embeds: embedsParam,
				attachmentUrls: attachmentUrlsParam,
			})
			.refine(
				(data) =>
					data.message ||
					(data.embeds && data.embeds.length > 0) ||
					(data.attachmentUrls && data.attachmentUrls.length > 0),
				{
					message: "At least one of `message`, `embeds`, or `attachmentUrls` must be provided.",
				},
			),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const channel = await client.channels.fetch(args.channelId);
				if (!channel?.isTextBased() || !("send" in channel)) {
					throw new UserError(`Channel ${args.channelId} is not a text-based channel.`);
				}

				const guildChannel = channel as TextChannel;
				const maxFileBytes = guildChannel.guild
					? maxFileBytesForTier(guildChannel.guild.premiumTier)
					: DEFAULT_MAX_FILE_BYTES;

				const files = args.attachmentUrls?.length
					? await fetchAttachments(args.attachmentUrls, maxFileBytes)
					: undefined;

				const sent = await guildChannel.send({
					content: args.message || undefined,
					embeds: args.embeds,
					files,
				});
				return `✅ Message sent (ID: ${sent.id}) in #${guildChannel.name}`;
			});
		},
	});

	server.addTool({
		name: "read_messages",
		description:
			"Read recent messages from a Discord channel. Returns messages with author, timestamp, and content.",
		parameters: z.object({
			channelId: z.string().describe("ID of the channel to read messages from."),
			count: z
				.number()
				.int()
				.min(1)
				.max(100)
				.optional()
				.default(50)
				.describe("Number of messages to read (1-100, default 50)."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const channel = await client.channels.fetch(args.channelId);
				if (!channel?.isTextBased() || !("messages" in channel)) {
					throw new UserError(`Channel ${args.channelId} is not a text-based channel.`);
				}

				const messages = await (channel as TextChannel).messages.fetch({
					limit: args.count,
				});

				if (messages.size === 0) {
					return "No messages found in this channel.";
				}

				const formatted = messages
					.sort((a, b) => a.createdTimestamp - b.createdTimestamp)
					.map(formatMessage);

				return `**Messages in #${(channel as TextChannel).name} (${messages.size}):**\n\n${formatted.join("\n")}`;
			});
		},
	});

	server.addTool({
		name: "edit_message",
		description: "Edit a message previously sent by the bot in a Discord channel.",
		parameters: z.object({
			channelId: z.string().describe("ID of the channel containing the message."),
			messageId: z.string().describe("ID of the message to edit."),
			newMessage: z.string().describe("New content for the message (max 2000 characters)."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const channel = await client.channels.fetch(args.channelId);
				if (!channel?.isTextBased() || !("messages" in channel)) {
					throw new UserError(`Channel ${args.channelId} is not a text-based channel.`);
				}

				const message = await (channel as TextChannel).messages.fetch(args.messageId);
				if (message.author.id !== client.user?.id) {
					return "Cannot edit messages from other users. The bot can only edit its own messages.";
				}

				await message.edit(args.newMessage);
				return `✅ Message ${args.messageId} edited successfully.`;
			});
		},
	});

	server.addTool({
		name: "delete_message",
		description:
			"Delete a message from a Discord channel. Bot can delete its own messages or others if it has Manage Messages permission.",
		parameters: z.object({
			channelId: z.string().describe("ID of the channel containing the message."),
			messageId: z.string().describe("ID of the message to delete."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const channel = await client.channels.fetch(args.channelId);
				if (!channel?.isTextBased() || !("messages" in channel)) {
					throw new UserError(`Channel ${args.channelId} is not a text-based channel.`);
				}

				const message = await (channel as TextChannel).messages.fetch(args.messageId);
				await message.delete();
				return `✅ Message ${args.messageId} deleted successfully.`;
			});
		},
	});

	server.addTool({
		name: "add_reaction",
		description: "Add an emoji reaction to a message in a Discord channel.",
		parameters: z.object({
			channelId: z.string().describe("ID of the channel containing the message."),
			messageId: z.string().describe("ID of the message to react to."),
			emoji: z.string().describe("Emoji to react with (e.g., '👍', '🎉', or custom emoji name)."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const channel = await client.channels.fetch(args.channelId);
				if (!channel?.isTextBased() || !("messages" in channel)) {
					throw new UserError(`Channel ${args.channelId} is not a text-based channel.`);
				}

				const message = await (channel as TextChannel).messages.fetch(args.messageId);
				await message.react(args.emoji);
				return `✅ Added reaction ${args.emoji} to message ${args.messageId}.`;
			});
		},
	});

	server.addTool({
		name: "remove_reaction",
		description: "Remove the bot's emoji reaction from a message.",
		parameters: z.object({
			channelId: z.string().describe("ID of the channel containing the message."),
			messageId: z.string().describe("ID of the message to remove reaction from."),
			emoji: z.string().describe("Emoji to remove (e.g., '👍', '🎉')."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const channel = await client.channels.fetch(args.channelId);
				if (!channel?.isTextBased() || !("messages" in channel)) {
					throw new UserError(`Channel ${args.channelId} is not a text-based channel.`);
				}

				const message = await (channel as TextChannel).messages.fetch(args.messageId);
				const reaction = message.reactions.cache.get(args.emoji);
				if (!reaction) {
					return `No reaction ${args.emoji} found on message ${args.messageId}.`;
				}
				await reaction.users.remove(client.user?.id);
				return `✅ Removed reaction ${args.emoji} from message ${args.messageId}.`;
			});
		},
	});

	server.addTool({
		name: "bulk_delete_messages",
		description:
			"Delete 2–100 messages at once from a channel. Only messages under 14 days old can be bulk deleted. Requires Manage Messages permission.",
		parameters: z.object({
			channelId: z.string().describe("ID of the channel to delete messages from."),
			messageIds: z
				.array(z.string())
				.min(2)
				.max(100)
				.describe("Array of 2–100 message IDs to delete."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const channel = await client.channels.fetch(args.channelId);
				if (!channel?.isTextBased() || !("messages" in channel)) {
					throw new UserError(`Channel ${args.channelId} is not a text-based channel.`);
				}
				const deleted = await (channel as TextChannel).bulkDelete(args.messageIds);
				return `✅ Bulk deleted ${deleted.size} messages from the channel.`;
			});
		},
	});

	server.addTool({
		name: "pin_message",
		description: "Pin a message in a channel. Requires Manage Messages permission.",
		parameters: z.object({
			channelId: z.string().describe("ID of the channel containing the message."),
			messageId: z.string().describe("ID of the message to pin."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const channel = await client.channels.fetch(args.channelId);
				if (!channel?.isTextBased() || !("messages" in channel)) {
					throw new UserError(`Channel ${args.channelId} is not a text-based channel.`);
				}
				const message = await (channel as TextChannel).messages.fetch(args.messageId);
				await message.pin();
				return `✅ Message ${args.messageId} pinned in #${(channel as TextChannel).name}.`;
			});
		},
	});

	server.addTool({
		name: "unpin_message",
		description: "Unpin a message from a channel. Requires Manage Messages permission.",
		parameters: z.object({
			channelId: z.string().describe("ID of the channel containing the message."),
			messageId: z.string().describe("ID of the message to unpin."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const channel = await client.channels.fetch(args.channelId);
				if (!channel?.isTextBased() || !("messages" in channel)) {
					throw new UserError(`Channel ${args.channelId} is not a text-based channel.`);
				}
				const message = await (channel as TextChannel).messages.fetch(args.messageId);
				await message.unpin();
				return `✅ Message ${args.messageId} unpinned from #${(channel as TextChannel).name}.`;
			});
		},
	});

	server.addTool({
		name: "get_pinned_messages",
		description: "Fetch all pinned messages in a channel.",
		parameters: z.object({
			channelId: z.string().describe("ID of the channel to get pinned messages from."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const channel = await client.channels.fetch(args.channelId);
				if (!channel?.isTextBased() || !("messages" in channel)) {
					throw new UserError(`Channel ${args.channelId} is not a text-based channel.`);
				}
				const pinned = await (channel as TextChannel).messages.fetchPinned();
				if (pinned.size === 0) {
					return "No pinned messages in this channel.";
				}
				const formatted = pinned
					.sort((a, b) => a.createdTimestamp - b.createdTimestamp)
					.map(formatMessage);
				return `**Pinned messages in #${(channel as TextChannel).name} (${pinned.size}):**\n\n${formatted.join("\n")}`;
			});
		},
	});

	server.addTool({
		name: "get_reactions",
		description: "List users who reacted with a specific emoji on a message.",
		parameters: z.object({
			channelId: z.string().describe("ID of the channel containing the message."),
			messageId: z.string().describe("ID of the message to get reactions for."),
			emoji: z
				.string()
				.describe(
					"Emoji to get reactions for (e.g., '👍', '🎉', or custom emoji in 'name:id' format).",
				),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const channel = await client.channels.fetch(args.channelId);
				if (!channel?.isTextBased() || !("messages" in channel)) {
					throw new UserError(`Channel ${args.channelId} is not a text-based channel.`);
				}
				const message = await (channel as TextChannel).messages.fetch(args.messageId);
				const reaction = message.reactions.resolve(args.emoji);
				if (!reaction) {
					return `No reactions found for ${args.emoji} on message ${args.messageId}.`;
				}
				const users = await reaction.users.fetch();
				if (users.size === 0) {
					return `No users have reacted with ${args.emoji}.`;
				}
				const userList = users.map((u: { tag: string; id: string }) => `${u.tag} (ID: ${u.id})`);
				return `**Users who reacted with ${args.emoji} (${users.size}):**\n${userList.join("\n")}`;
			});
		},
	});

	server.addTool({
		name: "clear_reactions",
		description: "Remove all reactions from a message. Requires Manage Messages permission.",
		parameters: z.object({
			channelId: z.string().describe("ID of the channel containing the message."),
			messageId: z.string().describe("ID of the message to clear reactions from."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const channel = await client.channels.fetch(args.channelId);
				if (!channel?.isTextBased() || !("messages" in channel)) {
					throw new UserError(`Channel ${args.channelId} is not a text-based channel.`);
				}
				const message = await (channel as TextChannel).messages.fetch(args.messageId);
				await message.reactions.removeAll();
				return `✅ All reactions cleared from message ${args.messageId}.`;
			});
		},
	});
}
