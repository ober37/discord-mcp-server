import type { Client } from "discord.js";
import type { FastMCP } from "fastmcp";
import { UserError } from "fastmcp";
import { z } from "zod/v4";
import { resolveGuild, withDiscordErrorHandling } from "../utils.ts";

export function registerInviteTools(
	server: FastMCP,
	client: Client,
	defaultGuildId?: string,
): void {
	server.addTool({
		name: "create_invite",
		description: "Create an invite link for a channel.",
		parameters: z.object({
			channelId: z.string().describe("ID of the channel to create an invite for."),
			maxAge: z
				.number()
				.int()
				.min(0)
				.max(604800)
				.optional()
				.describe(
					"Duration in seconds before the invite expires. 0 = never. Default: 86400 (24 hours).",
				),
			maxUses: z
				.number()
				.int()
				.min(0)
				.max(100)
				.optional()
				.describe("Maximum number of uses. 0 = unlimited. Default: 0."),
			temporary: z
				.boolean()
				.optional()
				.describe(
					"If true, members who don't receive a role are kicked after 24 hours. Default: false.",
				),
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				await resolveGuild(client, args.guildId, defaultGuildId);
				const channel = await client.channels.fetch(args.channelId);
				if (!channel || !("createInvite" in channel)) {
					throw new UserError(`Channel ${args.channelId} does not support invites.`);
				}
				// biome-ignore lint/suspicious/noExplicitAny: createInvite exists on text, voice, and forum channels — no shared discord.js type covers all three
				const invite = await (channel as any).createInvite({
					maxAge: args.maxAge ?? 86400,
					maxUses: args.maxUses ?? 0,
					temporary: args.temporary ?? false,
				});
				const expiryStr = invite.maxAge === 0 ? "never" : `${invite.maxAge}s`;
				const usesStr = invite.maxUses === 0 ? "unlimited" : String(invite.maxUses);
				return `✅ Created invite: https://discord.gg/${invite.code}\nCode: ${invite.code}\nExpires: ${expiryStr} | Max uses: ${usesStr} | Temporary: ${invite.temporary}`;
			});
		},
	});

	server.addTool({
		name: "list_invites",
		description: "List all active invites for a guild or a specific channel.",
		parameters: z.object({
			channelId: z
				.string()
				.optional()
				.describe("If provided, lists only invites for this channel."),
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				const invites = args.channelId
					? await guild.invites.fetch({ channelId: args.channelId })
					: await guild.invites.fetch();
				if (invites.size === 0) {
					return "No active invites found.";
				}
				const lines = invites.map((inv) => {
					const expiryStr = inv.maxAge === 0 ? "never" : `${inv.maxAge}s`;
					const usesStr =
						inv.maxUses === 0 ? `${inv.uses} (unlimited)` : `${inv.uses}/${inv.maxUses}`;
					const channelName = inv.channel ? `#${inv.channel.name}` : "unknown channel";
					const inviter = inv.inviter?.tag ?? "unknown";
					return `• https://discord.gg/${inv.code} — ${channelName} | Uses: ${usesStr} | Expires: ${expiryStr} | By: ${inviter}`;
				});
				return `**Active invites (${invites.size}):**\n${lines.join("\n")}`;
			});
		},
	});

	server.addTool({
		name: "delete_invite",
		description: "Revoke an invite by its code.",
		parameters: z.object({
			code: z
				.string()
				.describe("The invite code to revoke (e.g. 'abc123' from https://discord.gg/abc123)."),
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				const invite = await guild.invites.fetch(args.code);
				if (!invite) {
					throw new UserError(`Invite "${args.code}" not found.`);
				}
				await invite.delete();
				return `✅ Revoked invite ${args.code}`;
			});
		},
	});
}
