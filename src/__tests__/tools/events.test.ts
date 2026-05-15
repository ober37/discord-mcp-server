import { beforeEach, describe, expect, it, mock } from "bun:test";
import { UserError } from "fastmcp";
import { registerEventTools } from "../../tools/events";
import { createMockDiscordClient } from "../helpers/discord-mock";
import { EVENT_EXTERNAL, EVENT_VOICE, GUILD_FIXTURE } from "../helpers/fixtures";
import { createTestServer } from "../helpers/test-server";

describe("event tools", () => {
	let client: ReturnType<typeof createMockDiscordClient>;
	let callTool: ReturnType<typeof createTestServer>["callTool"];

	beforeEach(() => {
		client = createMockDiscordClient();
		const harness = createTestServer();
		registerEventTools(harness.server, client, GUILD_FIXTURE.id);
		callTool = harness.callTool;
	});

	describe("list_events", () => {
		it("returns all scheduled events", async () => {
			const result = await callTool("list_events", { guildId: GUILD_FIXTURE.id });
			expect(result).toContain("Scheduled events (2)");
			expect(result).toContain(EVENT_EXTERNAL.name);
			expect(result).toContain(EVENT_VOICE.name);
		});

		it("includes event type, status, start time, and attendee count", async () => {
			const result = await callTool("list_events", { guildId: GUILD_FIXTURE.id });
			expect(result).toContain("External");
			expect(result).toContain("Scheduled");
			expect(result).toContain(EVENT_EXTERNAL.scheduledStartAt.toISOString());
			expect(result).toContain(`Attendees: ${EVENT_EXTERNAL.userCount}`);
		});

		it("shows location for EXTERNAL events", async () => {
			const result = await callTool("list_events", { guildId: GUILD_FIXTURE.id });
			expect(result).toContain(EVENT_EXTERNAL.entityMetadata.location);
		});

		it("shows channel name for VOICE events", async () => {
			const result = await callTool("list_events", { guildId: GUILD_FIXTURE.id });
			expect(result).toContain(`#${EVENT_VOICE.channel.name}`);
		});

		it("shows Active status for VOICE event", async () => {
			const result = await callTool("list_events", { guildId: GUILD_FIXTURE.id });
			expect(result).toContain("Active");
		});

		it("includes event description when present", async () => {
			const result = await callTool("list_events", { guildId: GUILD_FIXTURE.id });
			expect(result).toContain(EVENT_EXTERNAL.description);
		});

		it("returns empty message when no events exist", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			guild.scheduledEvents.fetch = async () => ({ size: 0, map: () => [] });

			const result = await callTool("list_events", { guildId: GUILD_FIXTURE.id });
			expect(result).toBe("No scheduled events found.");
		});
	});

	describe("create_event", () => {
		it("creates an EXTERNAL event with required fields", async () => {
			const result = await callTool("create_event", {
				name: "Test Event",
				scheduledStartTime: "2026-12-01T18:00:00.000Z",
				entityType: "EXTERNAL",
				location: "Test Location",
				scheduledEndTime: "2026-12-01T20:00:00.000Z",
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("✅");
			expect(result).toContain("Test Event");
			expect(result).toContain("EXTERNAL");
		});

		it("creates an EXTERNAL event with optional description", async () => {
			const result = await callTool("create_event", {
				name: "Described Event",
				scheduledStartTime: "2026-12-01T18:00:00.000Z",
				entityType: "EXTERNAL",
				location: "Test Location",
				scheduledEndTime: "2026-12-01T20:00:00.000Z",
				description: "Test description",
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("✅");
			expect(result).toContain("Described Event");
		});

		it("creates a VOICE event with channelId", async () => {
			const result = await callTool("create_event", {
				name: "Voice Event",
				scheduledStartTime: "2026-12-01T20:00:00.000Z",
				entityType: "VOICE",
				channelId: "1200000000000000003",
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("✅");
			expect(result).toContain("Voice Event");
			expect(result).toContain("VOICE");
		});

		it("calls guild.scheduledEvents.create with correct payload for EXTERNAL", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const createSpy = mock(guild.scheduledEvents.create);
			guild.scheduledEvents.create = createSpy;

			await callTool("create_event", {
				name: "Spy Event",
				scheduledStartTime: "2026-12-01T18:00:00.000Z",
				entityType: "EXTERNAL",
				location: "Spy Location",
				scheduledEndTime: "2026-12-01T20:00:00.000Z",
				guildId: GUILD_FIXTURE.id,
			});

			expect(createSpy).toHaveBeenCalledTimes(1);
			// biome-ignore lint/suspicious/noExplicitAny: spy call args are untyped
			const callArg = (createSpy.mock.calls as any[][])[0][0] as Record<string, unknown>;
			expect(callArg.name).toBe("Spy Event");
			expect(callArg.entityType).toBe(3); // GuildScheduledEventEntityType.External
			expect(callArg.entityMetadata).toEqual({ location: "Spy Location" });
			expect(callArg.privacyLevel).toBe(2);
		});

		it("throws UserError for EXTERNAL without location", async () => {
			try {
				await callTool("create_event", {
					name: "Bad Event",
					scheduledStartTime: "2026-12-01T18:00:00.000Z",
					entityType: "EXTERNAL",
					scheduledEndTime: "2026-12-01T20:00:00.000Z",
					guildId: GUILD_FIXTURE.id,
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
				expect((e as UserError).message).toContain("location");
			}
		});

		it("throws UserError for EXTERNAL without scheduledEndTime", async () => {
			try {
				await callTool("create_event", {
					name: "Bad Event",
					scheduledStartTime: "2026-12-01T18:00:00.000Z",
					entityType: "EXTERNAL",
					location: "Somewhere",
					guildId: GUILD_FIXTURE.id,
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
				expect((e as UserError).message).toContain("scheduledEndTime");
			}
		});

		it("throws UserError for VOICE without channelId", async () => {
			try {
				await callTool("create_event", {
					name: "Bad Voice Event",
					scheduledStartTime: "2026-12-01T20:00:00.000Z",
					entityType: "VOICE",
					guildId: GUILD_FIXTURE.id,
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
				expect((e as UserError).message).toContain("channelId");
			}
		});

		it("throws UserError for STAGE_INSTANCE without channelId", async () => {
			try {
				await callTool("create_event", {
					name: "Bad Stage Event",
					scheduledStartTime: "2026-12-01T20:00:00.000Z",
					entityType: "STAGE_INSTANCE",
					guildId: GUILD_FIXTURE.id,
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
				expect((e as UserError).message).toContain("channelId");
			}
		});
	});

	describe("edit_event", () => {
		it("updates an event name", async () => {
			const result = await callTool("edit_event", {
				eventId: EVENT_EXTERNAL.id,
				name: "New Name",
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("✅");
			expect(result).toContain(EVENT_EXTERNAL.id);
		});

		it("updates event status to CANCELLED", async () => {
			const result = await callTool("edit_event", {
				eventId: EVENT_EXTERNAL.id,
				status: "CANCELLED",
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("✅");
		});

		it("updates event status to ACTIVE", async () => {
			const result = await callTool("edit_event", {
				eventId: EVENT_EXTERNAL.id,
				status: "ACTIVE",
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("✅");
		});

		it("updates event status to COMPLETED", async () => {
			const result = await callTool("edit_event", {
				eventId: EVENT_VOICE.id,
				status: "COMPLETED",
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("✅");
		});

		it("clears description when empty string is passed", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const originalFetch = guild.scheduledEvents.fetch.bind(guild.scheduledEvents);
			// biome-ignore lint/suspicious/noExplicitAny: spy capture
			let capturedUpdates: any;
			guild.scheduledEvents.fetch = async (id?: string) => {
				const event = await originalFetch(id);
				const origEdit = event.edit.bind(event);
				event.edit = async (opts: Record<string, unknown>) => {
					capturedUpdates = opts;
					return origEdit(opts);
				};
				return event;
			};

			await callTool("edit_event", {
				eventId: EVENT_EXTERNAL.id,
				description: "",
				guildId: GUILD_FIXTURE.id,
			});

			expect(capturedUpdates.description).toBeNull();
		});

		it("calls event.edit with provided options", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const originalFetch = guild.scheduledEvents.fetch.bind(guild.scheduledEvents);
			const editSpy = mock(() => Promise.resolve({ id: EVENT_EXTERNAL.id, name: "Renamed" }));
			guild.scheduledEvents.fetch = async (id?: string) => {
				const event = await originalFetch(id);
				event.edit = editSpy;
				return event;
			};

			await callTool("edit_event", {
				eventId: EVENT_EXTERNAL.id,
				name: "Renamed",
				guildId: GUILD_FIXTURE.id,
			});

			expect(editSpy).toHaveBeenCalledTimes(1);
			// biome-ignore lint/suspicious/noExplicitAny: spy call args are untyped
			expect((editSpy.mock.calls as any[][])[0][0]).toMatchObject({ name: "Renamed" });
		});

		it("throws UserError for unknown eventId", async () => {
			try {
				await callTool("edit_event", {
					eventId: "0000000000000000000",
					name: "Ghost",
					guildId: GUILD_FIXTURE.id,
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});
	});

	describe("delete_event", () => {
		it("deletes a known event", async () => {
			const result = await callTool("delete_event", {
				eventId: EVENT_EXTERNAL.id,
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("✅");
			expect(result).toContain(EVENT_EXTERNAL.name);
			expect(result).toContain(EVENT_EXTERNAL.id);
		});

		it("calls event.delete()", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const deleteSpy = mock(() => Promise.resolve());
			const originalFetch = guild.scheduledEvents.fetch.bind(guild.scheduledEvents);
			guild.scheduledEvents.fetch = async (id?: string) => {
				const event = await originalFetch(id);
				event.delete = deleteSpy;
				return event;
			};

			await callTool("delete_event", {
				eventId: EVENT_EXTERNAL.id,
				guildId: GUILD_FIXTURE.id,
			});

			expect(deleteSpy).toHaveBeenCalledTimes(1);
		});

		it("throws UserError for unknown eventId", async () => {
			try {
				await callTool("delete_event", {
					eventId: "0000000000000000000",
					guildId: GUILD_FIXTURE.id,
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});
	});
});
