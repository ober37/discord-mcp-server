import type { Client, Role } from "discord.js";
import type { FastMCP } from "fastmcp";
import { UserError } from "fastmcp";
import { z } from "zod/v4";
import { resolveGuild, withDiscordErrorHandling } from "../utils.ts";

export function registerRoleTools(server: FastMCP, client: Client, defaultGuildId?: string): void {
	server.addTool({
		name: "list_roles",
		description: "List all roles in a Discord server with their color, position, and member count.",
		parameters: z.object({
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				// Fetch all members to populate guild.members.cache so that
				// role.members (which filters the cache) returns accurate counts.
				await guild.members.fetch();
				const roles = guild.roles.cache.sort((a, b) => b.position - a.position);

				const lines = roles.map((role) => {
					const color = role.hexColor !== "#000000" ? ` [${role.hexColor}]` : "";
					const mentionable = role.mentionable ? " 📣" : "";
					const hoisted = role.hoist ? " 📌" : "";
					return `• ${role.name}${color}${hoisted}${mentionable} (ID: ${role.id}, Members: ${role.members.size})`;
				});

				return `**Roles (${roles.size}):**\n${lines.join("\n")}`;
			});
		},
	});

	server.addTool({
		name: "create_role",
		description: "Create a new role in a Discord server.",
		parameters: z.object({
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
			name: z.string().describe("Name for the new role."),
			color: z
				.string()
				.optional()
				.describe("Hex color for the role (e.g., '#FF5733'). Default: no color."),
			hoist: z
				.boolean()
				.optional()
				.default(false)
				.describe("Whether the role should be displayed separately in the member list."),
			mentionable: z
				.boolean()
				.optional()
				.default(false)
				.describe("Whether the role can be mentioned by anyone."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);

				const role = await guild.roles.create({
					name: args.name,
					color: args.color ? (args.color as `#${string}`) : undefined,
					hoist: args.hoist,
					mentionable: args.mentionable,
				});

				return `✅ Created role "${role.name}" (ID: ${role.id}, Color: ${role.hexColor})`;
			});
		},
	});

	server.addTool({
		name: "edit_role",
		description: "Edit an existing role in a Discord server.",
		parameters: z.object({
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
			roleId: z.string().describe("ID of the role to edit."),
			name: z.string().optional().describe("New name for the role."),
			color: z.string().optional().describe("New hex color for the role (e.g., '#FF5733')."),
			hoist: z
				.boolean()
				.optional()
				.describe("Whether to display the role separately in member list."),
			mentionable: z.boolean().optional().describe("Whether the role can be mentioned."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				const role = guild.roles.cache.get(args.roleId);

				if (!role) {
					throw new UserError(`Role ${args.roleId} not found.`);
				}
				guardEveryone(role);

				const updates: Record<string, unknown> = {};
				if (args.name !== undefined) updates.name = args.name;
				if (args.color !== undefined) updates.color = args.color;
				if (args.hoist !== undefined) updates.hoist = args.hoist;
				if (args.mentionable !== undefined) updates.mentionable = args.mentionable;

				if (Object.keys(updates).length === 0) {
					return "No changes specified.";
				}

				await role.edit(updates);
				return `✅ Updated role "${role.name}" (ID: ${role.id})`;
			});
		},
	});

	server.addTool({
		name: "delete_role",
		description:
			"Delete a role from a Discord server. Cannot delete the @everyone role. This is irreversible.",
		parameters: z.object({
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
			roleId: z.string().describe("ID of the role to delete."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				const role = guild.roles.cache.get(args.roleId);

				if (!role) {
					throw new UserError(`Role ${args.roleId} not found.`);
				}
				guardEveryone(role);

				const name = role.name;
				await role.delete();
				return `✅ Deleted role "${name}" (ID: ${args.roleId})`;
			});
		},
	});

	server.addTool({
		name: "assign_role",
		description: "Assign a role to a user in a Discord server.",
		parameters: z.object({
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
			userId: z.string().describe("ID of the user to assign the role to."),
			roleId: z.string().describe("ID of the role to assign."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				const member = await guild.members.fetch(args.userId);
				const role = guild.roles.cache.get(args.roleId);

				if (!role) {
					throw new UserError(`Role ${args.roleId} not found.`);
				}
				guardEveryone(role);

				await member.roles.add(role);
				return `✅ Assigned role "${role.name}" to ${member.user.tag}`;
			});
		},
	});

	server.addTool({
		name: "remove_role",
		description: "Remove a role from a user in a Discord server.",
		parameters: z.object({
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
			userId: z.string().describe("ID of the user to remove the role from."),
			roleId: z.string().describe("ID of the role to remove."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				const member = await guild.members.fetch(args.userId);
				const role = guild.roles.cache.get(args.roleId);

				if (!role) {
					throw new UserError(`Role ${args.roleId} not found.`);
				}
				guardEveryone(role);

				await member.roles.remove(role);
				return `✅ Removed role "${role.name}" from ${member.user.tag}`;
			});
		},
	});
}

/**
 * Prevents modification of the @everyone role.
 */
function guardEveryone(role: Role): void {
	if (role.name === "@everyone") {
		throw new UserError("Cannot modify the @everyone role.");
	}
}
