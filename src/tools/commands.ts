import type { Client } from "discord.js";
import type { FastMCP } from "fastmcp";
import { UserError } from "fastmcp";
import { z } from "zod/v4";
import { resolveGuild, withDiscordErrorHandling } from "../utils.ts";

export function registerCommandTools(
	server: FastMCP,
	client: Client,
	defaultGuildId?: string,
): void {
	server.addTool({
		name: "list_slash_commands",
		description:
			"List all registered application (slash) commands. If guildId is provided, returns guild-specific commands; otherwise returns global commands. Requires the bot application to be ready.",
		parameters: z.object({
			guildId: z
				.string()
				.optional()
				.describe(
					"Server ID for guild-specific commands. Omit to list global commands. Falls back to DISCORD_GUILD_ID env var.",
				),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				if (args.guildId || defaultGuildId) {
					const guild = await resolveGuild(client, args.guildId, defaultGuildId);
					const commands = await guild.commands.fetch();
					if (commands.size === 0) {
						return "No guild-specific slash commands registered.";
					}
					const lines = commands.map(
						(cmd) =>
							`• [${cmd.id}] /${cmd.name} — ${cmd.description || "(no description)"} | Scope: guild`,
					);
					return `**Guild slash commands (${commands.size}):**\n${lines.join("\n")}`;
				}

				if (!client.application) {
					throw new UserError(
						"Bot application is not ready. The client must be fully logged in before fetching global commands.",
					);
				}
				const commands = await client.application.commands.fetch();
				if (commands.size === 0) {
					return "No global slash commands registered.";
				}
				const lines = commands.map(
					(cmd) =>
						`• [${cmd.id}] /${cmd.name} — ${cmd.description || "(no description)"} | Scope: global`,
				);
				return `**Global slash commands (${commands.size}):**\n${lines.join("\n")}`;
			});
		},
	});

	server.addTool({
		name: "delete_slash_command",
		description:
			"Delete a registered application (slash) command by ID. If guildId is provided, deletes a guild-specific command; otherwise deletes a global command. Requires MANAGE_GUILD for guild commands. This action is permanent.",
		parameters: z.object({
			commandId: z.string().describe("ID of the application command to delete."),
			guildId: z
				.string()
				.optional()
				.describe(
					"Server ID for guild-specific command deletion. Omit to delete a global command. Falls back to DISCORD_GUILD_ID env var.",
				),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				if (args.guildId || defaultGuildId) {
					const guild = await resolveGuild(client, args.guildId, defaultGuildId);
					await guild.commands.delete(args.commandId);
					return `✅ Deleted guild slash command (ID: ${args.commandId}) from guild "${guild.name}"`;
				}

				if (!client.application) {
					throw new UserError(
						"Bot application is not ready. The client must be fully logged in before deleting global commands.",
					);
				}
				await client.application.commands.delete(args.commandId);
				return `✅ Deleted global slash command (ID: ${args.commandId})`;
			});
		},
	});
}
