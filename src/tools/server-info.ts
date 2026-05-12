import { ChannelType, type Client } from "discord.js";
import type { FastMCP } from "fastmcp";
import { z } from "zod/v4";
import { resolveGuild, withDiscordErrorHandling } from "../utils.ts";

export function registerServerInfoTools(
	server: FastMCP,
	client: Client,
	defaultGuildId?: string,
): void {
	server.addTool({
		name: "list_servers",
		description:
			"List all Discord servers (guilds) the bot is a member of. Returns server names and IDs.",
		parameters: z.object({}),
		execute: async () => {
			const guilds = client.guilds.cache;
			if (guilds.size === 0) {
				return "The bot is not a member of any servers.";
			}

			const lines = guilds.map((g) => `• ${g.name} (ID: ${g.id}, Members: ${g.memberCount})`);
			return `**Servers (${guilds.size}):**\n${lines.join("\n")}`;
		},
	});

	server.addTool({
		name: "get_server_info",
		description:
			"Get detailed information about a Discord server including name, owner, member count, channels, roles, and boost status.",
		parameters: z.object({
			guildId: z
				.string()
				.optional()
				.describe("Server ID. Falls back to DISCORD_GUILD_ID env var if not provided."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				const fullGuild = await guild.fetch();

				const owner = await fullGuild.fetchOwner();
				const channels = fullGuild.channels.cache;
				const textChannels = channels.filter((c) => c.isTextBased() && !c.isThread());
				const voiceChannels = channels.filter((c) => c.isVoiceBased());
				const categories = channels.filter((c) => c.type === ChannelType.GuildCategory);

				return [
					`**${fullGuild.name}**`,
					`ID: ${fullGuild.id}`,
					`Owner: ${owner.user.tag}`,
					`Members: ${fullGuild.memberCount}`,
					`Created: ${fullGuild.createdAt.toISOString()}`,
					`Boost Level: ${fullGuild.premiumTier} (${fullGuild.premiumSubscriptionCount || 0} boosts)`,
					`Channels: ${textChannels.size} text, ${voiceChannels.size} voice, ${categories.size} categories`,
					`Roles: ${fullGuild.roles.cache.size}`,
					fullGuild.description ? `Description: ${fullGuild.description}` : "",
					fullGuild.vanityURLCode ? `Vanity URL: discord.gg/${fullGuild.vanityURLCode}` : "",
				]
					.filter(Boolean)
					.join("\n");
			});
		},
	});
}
