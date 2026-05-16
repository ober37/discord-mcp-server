import {
	ChannelType,
	type Client,
	type ForumChannel,
	type TextChannel,
	type ThreadChannel,
} from "discord.js";
import type { FastMCP } from "fastmcp";
import { UserError } from "fastmcp";
import { z } from "zod/v4";
import { DEFAULT_MAX_FILE_BYTES, fetchAttachments, maxFileBytesForTier } from "../attachments.ts";
import { attachmentUrlsParam, embedsParam } from "../schemas.ts";
import { formatMessage, resolveGuild, withDiscordErrorHandling } from "../utils.ts";

export function registerThreadTools(
	server: FastMCP,
	client: Client,
	defaultGuildId?: string,
): void {
	server.addTool({
		name: "list_threads",
		description:
			"List active threads in a channel or all active threads in a server. Includes thread name, message count, and whether it's archived.",
		parameters: z.object({
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
			channelId: z
				.string()
				.optional()
				.describe(
					"Channel ID to list threads from. If omitted, lists all active threads in the server.",
				),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);

				if (args.channelId) {
					const channel = await client.channels.fetch(args.channelId);
					if (!channel?.isTextBased() || !("threads" in channel)) {
						throw new UserError(`Channel ${args.channelId} does not support threads.`);
					}

					const activeThreads = await (channel as TextChannel).threads.fetchActive();
					const archivedThreads = await (channel as TextChannel).threads.fetchArchived();

					const allThreads = [
						...activeThreads.threads.values(),
						...archivedThreads.threads.values(),
					];

					if (allThreads.length === 0) {
						return `No threads found in channel ${args.channelId}.`;
					}

					return formatThreadList(allThreads);
				}

				const activeThreads = await guild.channels.fetchActiveThreads();
				const threads = [...activeThreads.threads.values()];

				if (threads.length === 0) {
					return "No active threads found in this server.";
				}

				return formatThreadList(threads);
			});
		},
	});

	server.addTool({
		name: "create_thread",
		description:
			"Create a new thread in a text channel. Can be standalone or attached to a message.",
		parameters: z.object({
			channelId: z.string().describe("ID of the channel to create the thread in."),
			name: z.string().describe("Name for the new thread."),
			message: z
				.string()
				.optional()
				.describe(
					"Initial message content for the thread. If creating a forum post, this is required.",
				),
			messageId: z
				.string()
				.optional()
				.describe(
					"Message ID to create the thread from (creates a thread attached to that message).",
				),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const channel = await client.channels.fetch(args.channelId);
				if (!channel) {
					throw new UserError(`Channel ${args.channelId} not found.`);
				}

				// Forum channel: create a post
				if (channel.type === ChannelType.GuildForum) {
					if (!args.message) {
						throw new UserError("A message is required when creating a forum post.");
					}

					const thread = await (channel as ForumChannel).threads.create({
						name: args.name,
						message: { content: args.message },
					});

					return `✅ Created forum post "${thread.name}" (ID: ${thread.id}) in ${channel.name}`;
				}

				// Text channel: create a thread
				if (!channel.isTextBased() || !("threads" in channel)) {
					throw new UserError("This channel does not support threads.");
				}

				const textChannel = channel as TextChannel;

				if (args.messageId) {
					// Thread from a message
					const message = await textChannel.messages.fetch(args.messageId);
					const thread = await message.startThread({ name: args.name });

					if (args.message) {
						await thread.send(args.message);
					}

					return `✅ Created thread "${thread.name}" (ID: ${thread.id}) from message ${args.messageId}`;
				}

				// Standalone thread
				const thread = await textChannel.threads.create({
					name: args.name,
					type: ChannelType.PublicThread,
				});

				if (args.message) {
					await thread.send(args.message);
				}

				return `✅ Created thread "${thread.name}" (ID: ${thread.id}) in #${textChannel.name}`;
			});
		},
	});

	server.addTool({
		name: "reply_to_thread",
		description:
			"Send a message in an existing thread. Supports plain text, embeds, and native file attachments. " +
			"At least one of `message`, `embeds`, or `attachmentUrls` must be provided.",
		parameters: z
			.object({
				threadId: z.string().describe("ID of the thread to reply in."),
				message: z
					.string()
					.optional()
					.describe(
						"Message content to send (max 2000 characters). Optional if embeds or attachmentUrls are provided.",
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
				const thread = await client.channels.fetch(args.threadId);
				if (!thread?.isThread()) {
					throw new UserError(`${args.threadId} is not a thread.`);
				}

				const threadChannel = thread as ThreadChannel;
				const maxFileBytes = threadChannel.guild
					? maxFileBytesForTier(threadChannel.guild.premiumTier)
					: DEFAULT_MAX_FILE_BYTES;

				const files = args.attachmentUrls?.length
					? await fetchAttachments(args.attachmentUrls, maxFileBytes)
					: undefined;

				const sent = await threadChannel.send({
					content: args.message || undefined,
					embeds: args.embeds,
					files,
				});
				return `✅ Reply sent in thread "${thread.name}" (Message ID: ${sent.id})`;
			});
		},
	});

	server.addTool({
		name: "get_thread",
		description: "Get details and recent messages from a thread or forum post.",
		parameters: z.object({
			threadId: z.string().describe("ID of the thread to fetch."),
			messageCount: z
				.number()
				.int()
				.min(1)
				.max(100)
				.optional()
				.default(10)
				.describe("Number of recent messages to include (1-100, default 10)."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const thread = await client.channels.fetch(args.threadId);
				if (!thread?.isThread()) {
					throw new UserError(`${args.threadId} is not a thread.`);
				}

				const threadChannel = thread as ThreadChannel;
				const messages = await threadChannel.messages.fetch({
					limit: args.messageCount,
				});

				const sorted = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

				const header = [
					`**Thread: ${threadChannel.name}**`,
					`ID: ${threadChannel.id}`,
					`Parent: #${threadChannel.parent?.name || "unknown"}`,
					`Created: ${threadChannel.createdAt?.toISOString()}`,
					`Archived: ${threadChannel.archived ? "Yes" : "No"}`,
					`Message Count: ${threadChannel.messageCount || "unknown"}`,
					`Members: ${threadChannel.memberCount || "unknown"}`,
				].join("\n");

				if (messages.size === 0) {
					return `${header}\n\nNo messages in this thread.`;
				}

				const formattedMessages = sorted.map(formatMessage).join("\n");
				return `${header}\n\n**Recent Messages:**\n${formattedMessages}`;
			});
		},
	});

	server.addTool({
		name: "archive_thread",
		description:
			"Archive or unarchive a thread. Archiving a thread you did not create requires MANAGE_THREADS.",
		parameters: z.object({
			threadId: z.string().describe("ID of the thread to archive or unarchive."),
			archived: z
				.boolean()
				.default(true)
				.describe("True to archive, false to unarchive. Default: true."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const thread = await client.channels.fetch(args.threadId);
				if (!thread?.isThread()) {
					throw new UserError(`${args.threadId} is not a thread.`);
				}
				await (thread as ThreadChannel).edit({ archived: args.archived });
				const action = args.archived ? "archived" : "unarchived";
				return `✅ Thread "${thread.name}" has been ${action}.`;
			});
		},
	});

	server.addTool({
		name: "lock_thread",
		description:
			"Lock or unlock a thread. Locking prevents new messages (requires MANAGE_THREADS). Thread must be unarchived before it can be locked.",
		parameters: z.object({
			threadId: z.string().describe("ID of the thread to lock or unlock."),
			locked: z.boolean().default(true).describe("True to lock, false to unlock. Default: true."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const thread = await client.channels.fetch(args.threadId);
				if (!thread?.isThread()) {
					throw new UserError(`${args.threadId} is not a thread.`);
				}
				await (thread as ThreadChannel).edit({ locked: args.locked });
				const action = args.locked ? "locked" : "unlocked";
				return `✅ Thread "${thread.name}" has been ${action}.`;
			});
		},
	});

	server.addTool({
		name: "add_thread_member",
		description:
			"Add a user to a private thread. Only applies to private threads — public thread membership is implicit.",
		parameters: z.object({
			threadId: z.string().describe("ID of the private thread."),
			userId: z.string().describe("ID of the user to add."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const thread = await client.channels.fetch(args.threadId);
				if (!thread?.isThread()) {
					throw new UserError(`${args.threadId} is not a thread.`);
				}
				const threadChannel = thread as ThreadChannel;
				if (threadChannel.type !== ChannelType.PrivateThread) {
					throw new UserError(
						"add_thread_member only applies to private threads. Public thread membership is implicit.",
					);
				}
				await threadChannel.members.add(args.userId);
				return `✅ Added user ${args.userId} to private thread "${thread.name}".`;
			});
		},
	});

	server.addTool({
		name: "remove_thread_member",
		description:
			"Remove a user from a private thread. Only applies to private threads — public thread membership is implicit.",
		parameters: z.object({
			threadId: z.string().describe("ID of the private thread."),
			userId: z.string().describe("ID of the user to remove."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const thread = await client.channels.fetch(args.threadId);
				if (!thread?.isThread()) {
					throw new UserError(`${args.threadId} is not a thread.`);
				}
				const threadChannel = thread as ThreadChannel;
				if (threadChannel.type !== ChannelType.PrivateThread) {
					throw new UserError(
						"remove_thread_member only applies to private threads. Public thread membership is implicit.",
					);
				}
				await threadChannel.members.remove(args.userId);
				return `✅ Removed user ${args.userId} from private thread "${thread.name}".`;
			});
		},
	});
}

function formatThreadList(threads: ThreadChannel[]): string {
	const lines = threads.map((t) => {
		const archived = t.archived ? " 📦 Archived" : " 🟢 Active";
		const msgs = t.messageCount ? ` (${t.messageCount} messages)` : "";
		const parent = t.parent?.name ? ` in #${t.parent.name}` : "";
		return `• ${t.name}${archived}${msgs}${parent} (ID: ${t.id})`;
	});

	return `**Threads (${threads.length}):**\n${lines.join("\n")}`;
}
