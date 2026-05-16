import type { Client, GuildBan, PresenceStatus } from "discord.js";
import { type FastMCP, UserError } from "fastmcp";
import { z } from "zod/v4";
import { resolveGuild, withDiscordErrorHandling } from "../utils.ts";

export interface PresenceData {
	status: PresenceStatus; // "online" | "idle" | "dnd" | "offline" | "invisible"
	activity: string | null;
	lastSeen: string; // ISO timestamp
}

export function registerMemberTools(
	server: FastMCP,
	client: Client,
	defaultGuildId?: string,
	presenceCache?: Map<string, PresenceData>,
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
				.int()
				.min(1)
				.max(1000)
				.optional()
				.default(100)
				.describe("Number of members to return (1–1000). Default: 100."),
			roleId: z
				.string()
				.optional()
				.describe(
					"Filter to members who have this role ID. Note: the limit is applied before filtering, so set limit to 1000 to ensure all role members are returned.",
				),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				// Zod schema already enforces .min(1).max(1000).default(100) — no runtime clamp needed.
				let members = await guild.members.list({ limit: args.limit });

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
				if (args.nickname !== undefined) updates.nick = args.nickname === "" ? null : args.nickname;
				if (args.mute !== undefined) updates.mute = args.mute;
				if (args.deaf !== undefined) updates.deaf = args.deaf;

				if (Object.keys(updates).length === 0) {
					return "No changes specified.";
				}

				// discord.js v14 emits a DeprecationWarning (which throws in some runtimes)
				// when the bot edits its OWN nickname and nick is the ONLY field being changed.
				// guild.members.editMe() is the correct API for that case and bypasses the
				// deprecated code path entirely.
				const isSelfNickOnly =
					member.id === client.user?.id && Object.keys(updates).length === 1 && "nick" in updates;

				if (isSelfNickOnly) {
					await guild.members.editMe({ nick: updates.nick as string | null });
				} else {
					await member.edit(updates);
				}

				return `✅ Updated member ${member.user.tag} (ID: ${member.id})`;
			});
		},
	});

	server.addTool({
		name: "get_member_presence",
		description:
			"Get a member's current online status and active activity. " +
			"Requires the GuildPresence privileged intent to be enabled in the Discord Developer Portal. " +
			"Returns offline status with a note if the bot has not yet received a presenceUpdate event " +
			"for this member since last restart.",
		parameters: z.object({
			userId: z.string().describe("Discord user ID of the member."),
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				// Validate member exists in guild — same pattern as get_member
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				const member = await guild.members.fetch(args.userId);

				const cached = presenceCache?.get(args.userId);
				if (!cached) {
					return [
						`**${member.user.tag}** — Status: offline (not yet cached)`,
						"Activity: None",
						"Note: Presence data is only available after the bot observes a live presenceUpdate event for this member.",
					].join("\n");
				}

				return [
					`**${member.user.tag}**`,
					`Status: ${cached.status}`,
					`Activity: ${cached.activity ?? "None"}`,
					`Last seen: ${cached.lastSeen}`,
				].join("\n");
			});
		},
	});

	server.addTool({
		name: "kick_member",
		description:
			"Remove a member from the guild. They can rejoin with a valid invite. Requires the Kick Members permission.",
		parameters: z.object({
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
			userId: z.string().describe("ID of the member to kick."),
			reason: z.string().optional().describe("Reason for the kick (recorded in the audit log)."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				const member = await guild.members.fetch(args.userId);
				if (!member.kickable) {
					throw new UserError(
						`Cannot kick ${member.user.tag}: the bot lacks the Kick Members permission or the member's role is equal to or higher than the bot's highest role.`,
					);
				}
				await member.kick(args.reason);
				return `✅ Kicked ${member.user.tag} (ID: ${member.id})${args.reason ? ` — Reason: ${args.reason}` : ""}`;
			});
		},
	});

	server.addTool({
		name: "ban_member",
		description:
			"Ban a user from the guild, optionally deleting their recent messages. Requires the Ban Members permission.",
		parameters: z.object({
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
			userId: z
				.string()
				.describe("ID of the user to ban. The user does not need to be a current member."),
			reason: z.string().optional().describe("Reason for the ban (recorded in the audit log)."),
			deleteMessageDays: z
				.number()
				.int()
				.min(0)
				.max(7)
				.optional()
				.describe("Days of message history to delete (0–7). Default: 0."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				const days = Math.min(Math.max(args.deleteMessageDays ?? 0, 0), 7);
				const banOptions: { deleteMessageSeconds: number; reason?: string } = {
					deleteMessageSeconds: days * 86400,
				};
				if (args.reason !== undefined) banOptions.reason = args.reason;
				await guild.bans.create(args.userId, banOptions);
				const daysSuffix = days > 0 ? ` (deleted ${days}d of messages)` : "";
				return `✅ Banned user ID ${args.userId}${args.reason ? ` — Reason: ${args.reason}` : ""}${daysSuffix}`;
			});
		},
	});

	server.addTool({
		name: "unban_member",
		description:
			"Reverse a ban by user ID, restoring their ability to join the guild. Requires the Ban Members permission.",
		parameters: z.object({
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
			userId: z.string().describe("ID of the user to unban."),
			reason: z.string().optional().describe("Reason for the unban (recorded in the audit log)."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				await guild.bans.remove(args.userId, args.reason);
				return `✅ Unbanned user ID ${args.userId}${args.reason ? ` — Reason: ${args.reason}` : ""}`;
			});
		},
	});

	server.addTool({
		name: "list_bans",
		description: "List all active bans in the guild. Requires the Ban Members permission.",
		parameters: z.object({
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
			limit: z
				.number()
				.int()
				.min(1)
				.max(1000)
				.optional()
				.describe("Maximum number of bans to return (1–1000). Default: 100."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				const limit = Math.min(Math.max(args.limit ?? 100, 1), 1000);
				const bans = await guild.bans.fetch({ limit });
				if (bans.size === 0) return "No active bans.";
				const lines = bans.map((ban: GuildBan) => {
					const reason = ban.reason ? ` — ${ban.reason}` : "";
					return `• ${ban.user.tag} (ID: ${ban.user.id})${reason}`;
				});
				return `**Bans (${bans.size}):**\n${lines.join("\n")}`;
			});
		},
	});

	server.addTool({
		name: "timeout_member",
		description:
			"Apply or remove a communication timeout for a member. Timed-out members cannot send messages, add reactions, join voice, or use stage channels. Requires the Moderate Members permission.",
		parameters: z.object({
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
			userId: z.string().describe("ID of the member to timeout."),
			durationMinutes: z
				.number()
				.int()
				.min(0)
				.max(40320)
				.optional()
				.describe(
					"Timeout duration in minutes (1–40320, max 28 days). Omit or pass 0 to remove an existing timeout.",
				),
			reason: z.string().optional().describe("Reason for the timeout (recorded in the audit log)."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				const member = await guild.members.fetch(args.userId);
				if (!member.moderatable) {
					throw new UserError(
						`Cannot timeout ${member.user.tag}: the bot lacks the Moderate Members permission or the member's role is equal to or higher than the bot's highest role.`,
					);
				}
				const clampedMinutes =
					args.durationMinutes && args.durationMinutes > 0
						? Math.min(args.durationMinutes, 40320)
						: null;
				const durationMs = clampedMinutes !== null ? clampedMinutes * 60 * 1000 : null;
				await member.timeout(durationMs, args.reason);
				if (durationMs === null) {
					return `✅ Removed timeout for ${member.user.tag} (ID: ${member.id})`;
				}
				return `✅ Timed out ${member.user.tag} (ID: ${member.id}) for ${clampedMinutes} minute(s)${args.reason ? ` — Reason: ${args.reason}` : ""}`;
			});
		},
	});
}
