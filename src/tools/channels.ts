import {
	ChannelType,
	type Client,
	type NonThreadGuildBasedChannel,
	PermissionsBitField,
	type PermissionsString,
} from "discord.js";
import type { FastMCP } from "fastmcp";
import { UserError } from "fastmcp";
import { z } from "zod/v4";
import { resolveGuild, withDiscordErrorHandling } from "../utils.ts";

export function registerChannelTools(
	server: FastMCP,
	client: Client,
	defaultGuildId?: string,
): void {
	server.addTool({
		name: "list_channels",
		description:
			"List all channels in a Discord server, organized by category. Returns channel names, types, and IDs.",
		parameters: z.object({
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				const channels = guild.channels.cache
					.filter((c): c is NonThreadGuildBasedChannel => !c.isThread())
					.sort((a, b) => a.position - b.position);

				if (channels.size === 0) return "No channels found.";

				const categories = channels.filter((c) => c.type === ChannelType.GuildCategory);
				const uncategorized = channels.filter(
					(c) => c.type !== ChannelType.GuildCategory && !c.parentId,
				);

				const lines: string[] = [];

				// Uncategorized channels first
				for (const channel of uncategorized.values()) {
					const typeLabel = getChannelTypeLabel(channel.type);
					lines.push(`• ${typeLabel} ${channel.name} (ID: ${channel.id})`);
				}

				// Then by category
				for (const category of categories.values()) {
					lines.push(`\n📁 **${category.name}**`);
					const children = channels
						.filter((c): c is NonThreadGuildBasedChannel => c.parentId === category.id)
						.sort((a, b) => a.position - b.position);
					for (const child of children.values()) {
						const typeLabel = getChannelTypeLabel(child.type);
						lines.push(`  ${typeLabel} ${child.name} (ID: ${child.id})`);
					}
				}

				return `**Channels (${channels.size}):**\n${lines.join("\n")}`;
			});
		},
	});

	server.addTool({
		name: "find_channel",
		description:
			"Find channels by name in a Discord server. Supports partial matching. Returns matching channel names and IDs.",
		parameters: z.object({
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
			channelName: z.string().describe("Channel name or partial name to search for."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				const query = args.channelName.toLowerCase();
				const matches = guild.channels.cache.filter((c) => c.name.toLowerCase().includes(query));

				if (matches.size === 0) {
					return `No channels found matching "${args.channelName}".`;
				}

				const lines = matches.map((c) => {
					const typeLabel = getChannelTypeLabel(c.type);
					return `${typeLabel} ${c.name} (ID: ${c.id})`;
				});

				return `**Found ${matches.size} channel(s) matching "${args.channelName}":**\n${lines.join("\n")}`;
			});
		},
	});

	server.addTool({
		name: "create_text_channel",
		description: "Create a new text channel in a Discord server.",
		parameters: z.object({
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
			name: z.string().describe("Name for the new channel (will be slugified)."),
			categoryId: z.string().optional().describe("Category ID to place the channel under."),
			topic: z.string().optional().describe("Channel topic/description."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				const channel = await guild.channels.create({
					name: args.name,
					type: ChannelType.GuildText,
					parent: args.categoryId,
					topic: args.topic,
				});

				return `✅ Created text channel #${channel.name} (ID: ${channel.id})`;
			});
		},
	});

	server.addTool({
		name: "create_voice_channel",
		description: "Create a new voice channel in a Discord server.",
		parameters: z.object({
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
			name: z.string().describe("Name for the new voice channel."),
			categoryId: z.string().optional().describe("Category ID to place the channel under."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				const channel = await guild.channels.create({
					name: args.name,
					type: ChannelType.GuildVoice,
					parent: args.categoryId,
				});

				return `✅ Created voice channel 🔊 ${channel.name} (ID: ${channel.id})`;
			});
		},
	});

	server.addTool({
		name: "delete_channel",
		description:
			"Delete a channel from a Discord server. This action is irreversible. The bot must have Manage Channels permission.",
		parameters: z.object({
			channelId: z.string().describe("ID of the channel to delete."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const channel = await client.channels.fetch(args.channelId);
				if (!channel) {
					throw new UserError(`Channel ${args.channelId} not found.`);
				}
				if (!("delete" in channel)) {
					throw new UserError("This channel type cannot be deleted.");
				}
				const name = "name" in channel ? channel.name : args.channelId;
				await channel.delete();
				return `✅ Deleted channel "${name}" (ID: ${args.channelId})`;
			});
		},
	});

	server.addTool({
		name: "create_category",
		description:
			"Create a new channel category in a Discord server. Categories are used to group text and voice channels.",
		parameters: z.object({
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
			name: z.string().describe("Name for the new category."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				const category = await guild.channels.create({
					name: args.name,
					type: ChannelType.GuildCategory,
				});

				return `✅ Created category 📁 ${category.name} (ID: ${category.id})`;
			});
		},
	});

	server.addTool({
		name: "list_categories",
		description: "List all channel categories in a Discord server with their child channels.",
		parameters: z.object({
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				const categories = guild.channels.cache
					.filter((c) => c.type === ChannelType.GuildCategory)
					.sort((a, b) => a.position - b.position);

				if (categories.size === 0) return "No categories found.";

				const lines = categories.map((cat) => {
					const children = guild.channels.cache.filter((c) => c.parentId === cat.id);
					return `📁 **${cat.name}** (ID: ${cat.id}) — ${children.size} channel(s)`;
				});

				return `**Categories (${categories.size}):**\n${lines.join("\n")}`;
			});
		},
	});

	server.addTool({
		name: "edit_channel",
		description:
			"Edit a channel's settings. For text, announcement, and forum channels: name, topic, slowmode (rateLimitPerUser), or NSFW flag. For voice channels: name, bitrate, or user limit. Fields that do not apply to the channel type are ignored. Requires Manage Channels permission.",
		parameters: z.object({
			channelId: z.string().describe("ID of the channel to edit."),
			name: z.string().optional().describe("New name for the channel."),
			topic: z
				.string()
				.optional()
				.describe(
					"New topic/description. Pass empty string to clear. Only for text, announcement, and forum channels.",
				),
			rateLimitPerUser: z
				.number()
				.int()
				.min(0)
				.max(21600)
				.optional()
				.describe(
					"Slowmode delay in seconds (0–21600, 0 to disable). Only for text and forum channels.",
				),
			nsfw: z
				.boolean()
				.optional()
				.describe(
					"Mark channel as age-restricted (NSFW). Only for text, announcement, and forum channels.",
				),
			bitrate: z
				.number()
				.int()
				.min(8000)
				.max(384000)
				.optional()
				.describe(
					"Voice channel bitrate in bits per second (8000–384000). Only for voice channels.",
				),
			userLimit: z
				.number()
				.int()
				.min(0)
				.max(99)
				.optional()
				.describe(
					"Maximum number of users in a voice channel (0 = unlimited). Only for voice channels.",
				),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const channel = await client.channels.fetch(args.channelId);
				if (!channel) {
					throw new UserError(`Channel ${args.channelId} not found.`);
				}
				if (!("edit" in channel)) {
					throw new UserError("This channel type cannot be edited.");
				}

				const isTextLike =
					channel.type === ChannelType.GuildText ||
					channel.type === ChannelType.GuildAnnouncement ||
					channel.type === ChannelType.GuildForum;
				// Announcement channels do not support slowmode — Discord API returns 50035 if attempted
				const supportsSlowmode =
					channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildForum;
				const isVoice = channel.type === ChannelType.GuildVoice;

				// biome-ignore lint/suspicious/noExplicitAny: options shape varies by channel type
				const options: Record<string, any> = {};

				if (args.name !== undefined) options.name = args.name;

				if (isTextLike) {
					if (args.topic !== undefined) options.topic = args.topic === "" ? null : args.topic;
					if (args.nsfw !== undefined) options.nsfw = args.nsfw;
				}

				if (supportsSlowmode) {
					if (args.rateLimitPerUser !== undefined) options.rateLimitPerUser = args.rateLimitPerUser;
				}

				if (isVoice) {
					if (args.bitrate !== undefined) options.bitrate = args.bitrate;
					if (args.userLimit !== undefined) options.userLimit = args.userLimit;
				}

				if (Object.keys(options).length === 0) {
					throw new UserError(
						"No valid fields provided for this channel type. Text/forum channels support: name, topic, rateLimitPerUser, nsfw. Announcement channels support: name, topic, nsfw. Voice channels support: name, bitrate, userLimit.",
					);
				}

				// biome-ignore lint/suspicious/noExplicitAny: channel narrowed to guild channel via "edit" check above
				await (channel as any).edit(options);

				// Use the requested new name if provided; otherwise fall back to the current name
				const displayName = args.name ?? ("name" in channel ? channel.name : args.channelId);
				return `✅ Updated channel "${displayName}" (ID: ${args.channelId})`;
			});
		},
	});

	server.addTool({
		name: "create_forum_channel",
		description:
			"Create a new forum channel in a Discord server. Forum channels allow members to create threaded posts for structured discussions. Requires Manage Channels permission.",
		parameters: z.object({
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
			name: z.string().describe("Name for the new forum channel."),
			categoryId: z.string().optional().describe("Category ID to place the channel under."),
			topic: z.string().optional().describe("Topic/description shown in the channel guidelines."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				const channel = await guild.channels.create({
					name: args.name,
					type: ChannelType.GuildForum,
					parent: args.categoryId,
					topic: args.topic,
				});

				return `✅ Created forum channel 💬 ${channel.name} (ID: ${channel.id})`;
			});
		},
	});

	server.addTool({
		name: "create_announcement_channel",
		description:
			"Create a new announcement channel in a Discord server. Announcement channels let members follow and receive cross-server notifications. Requires Manage Channels permission. Note: the server must have Community mode enabled in Discord Server Settings — creation will fail with 'Invalid form body' on non-Community servers.",
		parameters: z.object({
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
			name: z.string().describe("Name for the new announcement channel."),
			categoryId: z.string().optional().describe("Category ID to place the channel under."),
			topic: z.string().optional().describe("Channel topic/description."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				const channel = await guild.channels.create({
					name: args.name,
					type: ChannelType.GuildAnnouncement,
					parent: args.categoryId,
					topic: args.topic,
				});

				return `✅ Created announcement channel 📢 ${channel.name} (ID: ${channel.id})`;
			});
		},
	});

	server.addTool({
		name: "set_channel_permissions",
		description:
			"Set or remove permission overwrites for a user or role on a channel. Pass allow and deny as arrays of Discord permission flag names (e.g. 'SendMessages', 'ViewChannel', 'ManageMessages'). Set deleteOverwrite to true to remove an existing overwrite entirely. Requires MANAGE_CHANNELS permission (and MANAGE_ROLES when setting role permission overwrites).",
		parameters: z.object({
			channelId: z.string().describe("ID of the channel to modify permissions on."),
			targetId: z.string().describe("ID of the user or role to set permissions for."),
			targetType: z
				.enum(["user", "role"])
				.describe(
					"Whether targetId is a 'user' (guild member) or 'role'. Required to correctly resolve the target.",
				),
			allow: z
				.array(z.string())
				.optional()
				.describe(
					"Permission flag names to explicitly allow (e.g. ['SendMessages', 'ViewChannel']).",
				),
			deny: z.array(z.string()).optional().describe("Permission flag names to explicitly deny."),
			deleteOverwrite: z
				.boolean()
				.optional()
				.describe(
					"If true, removes the existing permission overwrite for this target. When true, allow and deny are ignored.",
				),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const channel = await client.channels.fetch(args.channelId);
				if (!channel) {
					throw new UserError(`Channel ${args.channelId} not found.`);
				}
				if (!("permissionOverwrites" in channel)) {
					throw new UserError("Permission overwrites are not supported for this channel type.");
				}

				const name = "name" in channel ? channel.name : args.channelId;

				// biome-ignore lint/suspicious/noExplicitAny: permissionOverwrites and guild confirmed present on GuildChannel
				const guildChannel = channel as any;

				// Resolve the target to a concrete Role or GuildMember object so discord.js
				// can determine the overwrite type without relying solely on the members cache.
				let resolvedTarget: unknown;
				if (args.targetType === "role") {
					resolvedTarget = guildChannel.guild?.roles?.cache?.get(args.targetId);
					if (!resolvedTarget) {
						throw new UserError(`Role ${args.targetId} not found in this server.`);
					}
				} else {
					// Fetch the member from the API — throws on miss (mapped to Discord error
					// 10007 by withDiscordErrorHandling). Always returns a member on success.
					resolvedTarget = await guildChannel.guild?.members?.fetch(args.targetId);
				}

				if (args.deleteOverwrite) {
					await guildChannel.permissionOverwrites.delete(resolvedTarget);
					return `✅ Removed permission overwrite for ${args.targetType} ${args.targetId} on channel "${name}" (ID: ${args.channelId})`;
				}

				const allow = args.allow ?? [];
				const deny = args.deny ?? [];

				if (allow.length === 0 && deny.length === 0) {
					throw new UserError(
						"At least one permission must be specified in allow or deny, or set deleteOverwrite to true to remove the overwrite.",
					);
				}

				const overlap = allow.filter((p) => deny.includes(p));
				if (overlap.length > 0) {
					throw new UserError(`Flags cannot appear in both allow and deny: ${overlap.join(", ")}`);
				}

				// Validate all permission flag names before calling the API
				try {
					new PermissionsBitField([...allow, ...deny] as PermissionsString[]);
				} catch {
					throw new UserError(
						"Invalid permission flag name. Use standard Discord permission names like 'SendMessages', 'ViewChannel', 'ManageMessages', etc.",
					);
				}

				const permOptions: Record<string, boolean> = {};
				for (const perm of allow) permOptions[perm] = true;
				for (const perm of deny) permOptions[perm] = false;

				await guildChannel.permissionOverwrites.create(resolvedTarget, permOptions);

				const allowDesc = allow.length > 0 ? `allow: [${allow.join(", ")}]` : "";
				const denyDesc = deny.length > 0 ? `deny: [${deny.join(", ")}]` : "";
				const permsDesc = [allowDesc, denyDesc].filter(Boolean).join(", ");
				return `✅ Set permissions for ${args.targetType} ${args.targetId} on channel "${name}" (ID: ${args.channelId}): ${permsDesc}`;
			});
		},
	});

	server.addTool({
		name: "move_member_to_voice",
		description:
			"Move a guild member to a different voice channel. The member must currently be connected to a voice channel. Requires MOVE_MEMBERS permission.",
		parameters: z.object({
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
			userId: z.string().describe("ID of the member to move."),
			channelId: z.string().describe("ID of the voice channel to move the member into."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				const member = await guild.members.fetch(args.userId);

				const channel = await client.channels.fetch(args.channelId);
				if (!channel) {
					throw new UserError(`Channel ${args.channelId} not found.`);
				}
				if (
					channel.type !== ChannelType.GuildVoice &&
					channel.type !== ChannelType.GuildStageVoice
				) {
					throw new UserError(
						`Channel ${args.channelId} is not a voice channel. Only GuildVoice and GuildStageVoice channels are valid targets.`,
					);
				}

				await member.voice.setChannel(args.channelId);
				const channelName = "name" in channel ? channel.name : args.channelId;
				return `✅ Moved ${member.user.username} to voice channel "${channelName}" (ID: ${args.channelId})`;
			});
		},
	});

	server.addTool({
		name: "disconnect_member_from_voice",
		description:
			"Disconnect a guild member from the voice channel they are currently in. Requires MOVE_MEMBERS permission.",
		parameters: z.object({
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
			userId: z.string().describe("ID of the member to disconnect from voice."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				const member = await guild.members.fetch(args.userId);

				// member.voice.channelId relies on the GuildVoiceStates Gateway cache and is
				// unreliable when that intent is not enabled. Let the Discord API enforce the
				// "must be in voice" constraint — error 40032 is mapped to a friendly message.
				await member.voice.setChannel(null);
				return `✅ Disconnected ${member.user.username} from voice`;
			});
		},
	});

	server.addTool({
		name: "move_channel",
		description:
			"Move a channel into a category. Requires MANAGE_CHANNELS permission. When moving into a category, also requires MANAGE_ROLES to sync permission overwrites with the parent.",
		parameters: z.object({
			channelId: z.string().describe("ID of the channel to move."),
			categoryId: z
				.string()
				.nullable()
				.describe(
					"ID of the category to move the channel into. Pass null to remove from any category.",
				),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const channel = await client.channels.fetch(args.channelId);
				if (!channel) {
					throw new UserError(`Channel ${args.channelId} not found.`);
				}
				if (!("setParent" in channel)) {
					throw new UserError("This channel type cannot be moved.");
				}
				const name = "name" in channel ? channel.name : args.channelId;
				// Normalize: MCP clients may pass the string "null" instead of JSON null.
				const categoryId =
					args.categoryId === null || args.categoryId === "null" ? null : args.categoryId;
				// lockPermissions: true syncs permission overwrites with the parent category when
				// moving into one (discord.js default). Must be false when uncategorizing (null) —
				// there is no parent to sync from and discord.js's default causes a malformed
				// API body in that case.
				await (channel as NonThreadGuildBasedChannel).setParent(categoryId, {
					lockPermissions: categoryId !== null,
				});
				const destination = categoryId ? `category ${categoryId}` : "no category";
				return `✅ Moved "${name}" to ${destination}`;
			});
		},
	});
}

function getChannelTypeLabel(type: ChannelType): string {
	switch (type) {
		case ChannelType.GuildText:
			return "#";
		case ChannelType.GuildVoice:
			return "🔊";
		case ChannelType.GuildAnnouncement:
			return "📢";
		case ChannelType.GuildStageVoice:
			return "🎭";
		case ChannelType.GuildForum:
			return "💬";
		case ChannelType.GuildMedia:
			return "📷";
		default:
			return "•";
	}
}
