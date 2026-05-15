import type { Client } from "discord.js";
import type { FastMCP } from "fastmcp";
import { z } from "zod/v4";
import { formatMessage, withDiscordErrorHandling } from "../utils.ts";

export function registerDmTools(server: FastMCP, client: Client): void {
	server.addTool({
		name: "send_dm",
		description:
			"Send a direct message to a user as the bot. Requires the user to have DMs enabled from server members.",
		parameters: z.object({
			userId: z.string().describe("ID of the user to send a DM to."),
			content: z.string().describe("Text content of the message to send."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const user = await client.users.fetch(args.userId);
				const dmChannel = await user.createDM();
				await dmChannel.send(args.content);
				const preview = args.content.length > 100 ? `${args.content.slice(0, 100)}…` : args.content;
				return `✅ Sent DM to ${user.tag}: ${preview}`;
			});
		},
	});

	server.addTool({
		name: "read_dm",
		description: "Fetch conversation history from the DM channel with a specific user.",
		parameters: z.object({
			userId: z.string().describe("ID of the user whose DM history to read."),
			limit: z
				.number()
				.int()
				.min(1)
				.max(100)
				.optional()
				.describe("Number of messages to fetch. Default: 25. Max: 100."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const user = await client.users.fetch(args.userId);
				const dmChannel = await user.createDM();
				const messages = await dmChannel.messages.fetch({ limit: args.limit ?? 25 });
				if (messages.size === 0) {
					return "No messages found in this DM channel.";
				}
				const sorted = messages.sort(
					(a: { createdTimestamp: number }, b: { createdTimestamp: number }) =>
						a.createdTimestamp - b.createdTimestamp,
				);
				const lines = sorted.map((msg: Parameters<typeof formatMessage>[0]) => formatMessage(msg));
				return `**DM with ${user.tag} (${messages.size} messages):**\n${lines.join("\n")}`;
			});
		},
	});
}
