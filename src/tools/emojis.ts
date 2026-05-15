import type { Client } from "discord.js";
import type { FastMCP } from "fastmcp";
import { z } from "zod/v4";
import { resolveGuild, withDiscordErrorHandling } from "../utils.ts";

export function registerEmojiTools(server: FastMCP, client: Client, defaultGuildId?: string): void {
	server.addTool({
		name: "list_emojis",
		description: "List all custom emojis in a Discord server.",
		parameters: z.object({
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				const emojis = await guild.emojis.fetch();
				if (emojis.size === 0) {
					return "No custom emojis found in this server.";
				}
				const lines = emojis.map(
					(emoji) => `• ${emoji.name} (ID: ${emoji.id})${emoji.animated ? " [animated]" : ""}`,
				);
				return `**Custom Emojis (${emojis.size}):**\n${lines.join("\n")}`;
			});
		},
	});

	server.addTool({
		name: "create_emoji",
		description:
			"Create a custom emoji in a Discord server from a publicly accessible image URL. " +
			"Requires the Manage Guild Expressions permission. Image must be a PNG, JPG, or GIF under 256 KB.",
		parameters: z.object({
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
			name: z
				.string()
				.describe("Name for the emoji (2–32 characters, letters, numbers, and underscores only)."),
			imageUrl: z
				.string()
				.url()
				.describe("Publicly accessible URL to the emoji image (PNG/JPG/GIF, max 256 KB)."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				const emoji = await guild.emojis.create({
					attachment: args.imageUrl,
					name: args.name,
				});
				return `✅ Created emoji :${emoji.name}: (ID: ${emoji.id})`;
			});
		},
	});

	server.addTool({
		name: "delete_emoji",
		description:
			"Delete a custom emoji from a Discord server by its ID. " +
			"Requires the Manage Guild Expressions permission.",
		parameters: z.object({
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
			emojiId: z.string().describe("ID of the emoji to delete."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				const emoji = await guild.emojis.fetch(args.emojiId);
				const name = emoji.name;
				await emoji.delete();
				return `✅ Deleted emoji :${name}: (ID: ${args.emojiId})`;
			});
		},
	});
}
