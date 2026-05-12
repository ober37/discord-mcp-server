import type { Client } from "discord.js";
import type { FastMCP } from "fastmcp";
import { z } from "zod/v4";
import { resolveGuild, withDiscordErrorHandling } from "../utils.ts";

export function registerMemberTools(
	server: FastMCP,
	client: Client,
	defaultGuildId?: string,
): void {
	server.addTool({
		name: "get_member",
		description:
			"Fetch a guild member's profile including joined date, roles, nickname, and boost status.",
		parameters: z.object({
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
			userId: z.string().describe("ID of the member to fetch."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				const member = await guild.members.fetch(args.userId);

				const roles = member.roles.cache
					.filter((r) => r.name !== "@everyone")
					.sort((a, b) => b.position - a.position)
					.map((r) => `${r.name} (${r.id})`);

				const nickname = member.nickname ?? "(none)";
				const joinedAt = member.joinedAt?.toISOString() ?? "unknown";
				const boostSince = member.premiumSince ? member.premiumSince.toISOString() : "not boosting";
				const avatar = member.displayAvatarURL();

				return [
					`**Member: ${member.user.tag}** (ID: ${member.id})`,
					`Nickname: ${nickname}`,
					`Joined: ${joinedAt}`,
					`Boosting since: ${boostSince}`,
					`Avatar: ${avatar}`,
					`Roles (${roles.length}): ${roles.length > 0 ? roles.join(", ") : "none"}`,
				].join("\n");
			});
		},
	});

	server.addTool({
		name: "list_members",
		description:
			"List guild members with optional role filter. Returns up to 1000 members per call.",
		parameters: z.object({
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
			limit: z
				.number()
				.optional()
				.default(100)
				.describe("Number of members to return (1–1000). Default: 100."),
			roleId: z.string().optional().describe("Filter to members who have this role ID."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				const limit = Math.min(Math.max(args.limit ?? 100, 1), 1000);

				let members = await guild.members.list({ limit });

				if (args.roleId) {
					const roleId = args.roleId;
					members = members.filter((m) => m.roles.cache.has(roleId));
				}

				if (members.size === 0) {
					return "No members found.";
				}

				const lines = members.map((m) => {
					const nick = m.nickname ? ` (${m.nickname})` : "";
					return `• ${m.user.tag}${nick} (ID: ${m.id})`;
				});

				return `**Members (${members.size}):**\n${lines.join("\n")}`;
			});
		},
	});

	server.addTool({
		name: "edit_member",
		description:
			"Edit a guild member's nickname or server mute/deafen state. All fields are optional.",
		parameters: z.object({
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
			userId: z.string().describe("ID of the member to edit."),
			nickname: z
				.string()
				.optional()
				.describe("New nickname. Pass an empty string to clear the nickname."),
			mute: z.boolean().optional().describe("Server-mute the member in voice channels."),
			deaf: z.boolean().optional().describe("Server-deafen the member in voice channels."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				const member = await guild.members.fetch(args.userId);

				const updates: Record<string, unknown> = {};
				if (args.nickname !== undefined) updates.nick = args.nickname;
				if (args.mute !== undefined) updates.mute = args.mute;
				if (args.deaf !== undefined) updates.deaf = args.deaf;

				if (Object.keys(updates).length === 0) {
					return "No changes specified.";
				}

				await member.edit(updates);
				return `✅ Updated member ${member.user.tag} (ID: ${member.id})`;
			});
		},
	});
}
