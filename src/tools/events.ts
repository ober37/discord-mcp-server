import {
	type Client,
	GuildScheduledEventEntityType,
	GuildScheduledEventPrivacyLevel,
	GuildScheduledEventStatus,
} from "discord.js";
import type { FastMCP } from "fastmcp";
import { UserError } from "fastmcp";
import { z } from "zod/v4";
import { resolveGuild, withDiscordErrorHandling } from "../utils.ts";

export function registerEventTools(server: FastMCP, client: Client, defaultGuildId?: string): void {
	server.addTool({
		name: "list_events",
		description:
			"List all scheduled events in a guild, including name, ID, type, status, start time, description, and attendee count.",
		parameters: z.object({
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				const events = await guild.scheduledEvents.fetch();
				if (events.size === 0) {
					return "No scheduled events found.";
				}
				const lines = events.map((event) => {
					const typeName =
						event.entityType === GuildScheduledEventEntityType.StageInstance
							? "Stage"
							: event.entityType === GuildScheduledEventEntityType.Voice
								? "Voice"
								: "External";
					const statusName =
						event.status === GuildScheduledEventStatus.Scheduled
							? "Scheduled"
							: event.status === GuildScheduledEventStatus.Active
								? "Active"
								: event.status === GuildScheduledEventStatus.Completed
									? "Completed"
									: "Cancelled";
					const start = event.scheduledStartAt?.toISOString() ?? "unknown";
					const location =
						event.entityType === GuildScheduledEventEntityType.External
							? ` | Location: ${event.entityMetadata?.location ?? "unknown"}`
							: event.channel
								? ` | Channel: #${event.channel.name}`
								: "";
					const desc = event.description ? ` | ${event.description}` : "";
					return `• [${event.id}] ${event.name} — ${typeName} | ${statusName} | Starts: ${start} | Attendees: ${event.userCount ?? 0}${location}${desc}`;
				});
				return `**Scheduled events (${events.size}):**\n${lines.join("\n")}`;
			});
		},
	});

	server.addTool({
		name: "create_event",
		description:
			"Create a scheduled event in a guild. Requires MANAGE_EVENTS permission. " +
			"Type must be STAGE_INSTANCE, VOICE, or EXTERNAL. " +
			"EXTERNAL requires a location string and an end time. " +
			"STAGE_INSTANCE and VOICE require a channelId (voice or stage channel). " +
			"Start time must be in the future (ISO 8601 string, e.g. '2025-01-15T18:00:00.000Z').",
		parameters: z.object({
			name: z.string().describe("Name of the event (1–100 characters)."),
			scheduledStartTime: z
				.string()
				.describe("Event start time as an ISO 8601 string (must be in the future)."),
			entityType: z
				.enum(["STAGE_INSTANCE", "VOICE", "EXTERNAL"])
				.describe("Event type: STAGE_INSTANCE, VOICE, or EXTERNAL."),
			description: z
				.string()
				.optional()
				.describe("Optional event description (up to 1000 characters)."),
			scheduledEndTime: z
				.string()
				.optional()
				.describe("Event end time as an ISO 8601 string. Required for EXTERNAL type."),
			channelId: z
				.string()
				.optional()
				.describe("Voice or stage channel ID. Required for STAGE_INSTANCE and VOICE types."),
			location: z
				.string()
				.optional()
				.describe("Physical or URL location string. Required for EXTERNAL type."),
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);

				const entityType =
					args.entityType === "STAGE_INSTANCE"
						? GuildScheduledEventEntityType.StageInstance
						: args.entityType === "VOICE"
							? GuildScheduledEventEntityType.Voice
							: GuildScheduledEventEntityType.External;

				if (entityType === GuildScheduledEventEntityType.External) {
					if (!args.location) {
						throw new UserError("EXTERNAL events require a location. Pass a location string.");
					}
					if (!args.scheduledEndTime) {
						throw new UserError(
							"EXTERNAL events require a scheduledEndTime. Pass an ISO 8601 end time.",
						);
					}
				} else {
					if (!args.channelId) {
						throw new UserError(
							`${args.entityType} events require a channelId. Pass a voice or stage channel ID.`,
						);
					}
				}

				// biome-ignore lint/suspicious/noExplicitAny: discord.js create() overloads differ by entityType; union typing is unwieldy here
				const createOptions: any = {
					name: args.name,
					scheduledStartTime: new Date(args.scheduledStartTime),
					entityType,
					privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
				};

				if (args.description) createOptions.description = args.description;

				if (entityType === GuildScheduledEventEntityType.External) {
					createOptions.entityMetadata = { location: args.location };
					createOptions.scheduledEndTime = new Date(args.scheduledEndTime as string);
				} else {
					createOptions.channel = args.channelId;
				}

				const event = await guild.scheduledEvents.create(createOptions);
				const typeName = args.entityType;
				const start = event.scheduledStartAt?.toISOString() ?? args.scheduledStartTime;
				return `✅ Created scheduled event "${event.name}" (ID: ${event.id}) | Type: ${typeName} | Starts: ${start}`;
			});
		},
	});

	server.addTool({
		name: "edit_event",
		description:
			"Update an existing scheduled event's name, description, start/end time, or status. " +
			"Requires MANAGE_EVENTS permission. " +
			"Valid status transitions: SCHEDULED → ACTIVE (start the event), ACTIVE → COMPLETED (end it), " +
			"SCHEDULED or ACTIVE → CANCELLED. Completed and cancelled events cannot be changed.",
		parameters: z.object({
			eventId: z.string().describe("ID of the scheduled event to edit."),
			name: z.string().optional().describe("New name for the event."),
			description: z
				.string()
				.optional()
				.describe("New description. Pass an empty string to clear."),
			scheduledStartTime: z.string().optional().describe("New start time as an ISO 8601 string."),
			scheduledEndTime: z.string().optional().describe("New end time as an ISO 8601 string."),
			status: z
				.enum(["ACTIVE", "COMPLETED", "CANCELLED"])
				.optional()
				.describe(
					"New status. SCHEDULED → ACTIVE starts the event; ACTIVE → COMPLETED ends it; either → CANCELLED cancels it.",
				),
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				const event = await guild.scheduledEvents.fetch(args.eventId);

				// biome-ignore lint/suspicious/noExplicitAny: edit() options type is complex; partial union avoids awkward type gymnastics
				const updates: any = {};
				if (args.name !== undefined) updates.name = args.name;
				if (args.description !== undefined)
					updates.description = args.description === "" ? null : args.description;
				if (args.scheduledStartTime !== undefined)
					updates.scheduledStartTime = new Date(args.scheduledStartTime);
				if (args.scheduledEndTime !== undefined)
					updates.scheduledEndTime = new Date(args.scheduledEndTime);
				if (args.status !== undefined) {
					updates.status =
						args.status === "ACTIVE"
							? GuildScheduledEventStatus.Active
							: args.status === "COMPLETED"
								? GuildScheduledEventStatus.Completed
								: GuildScheduledEventStatus.Canceled;
				}

				if (Object.keys(updates).length === 0) {
					return "No changes specified.";
				}

				const updated = await event.edit(updates);
				return `✅ Updated scheduled event "${updated.name}" (ID: ${updated.id})`;
			});
		},
	});

	server.addTool({
		name: "delete_event",
		description:
			"Delete a scheduled event by ID. Requires MANAGE_EVENTS permission. This action is permanent.",
		parameters: z.object({
			eventId: z.string().describe("ID of the scheduled event to delete."),
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				const event = await guild.scheduledEvents.fetch(args.eventId);
				const name = event.name;
				await event.delete();
				return `✅ Deleted scheduled event "${name}" (ID: ${args.eventId})`;
			});
		},
	});
}
