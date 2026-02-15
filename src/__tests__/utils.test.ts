import { describe, expect, it } from "bun:test";
import { DiscordAPIError } from "discord.js";
import { UserError } from "fastmcp";
import { formatMessage, resolveGuild, resolveGuildId, withDiscordErrorHandling } from "../utils";
import { createMockDiscordClient } from "./helpers/discord-mock";
import { GUILD_FIXTURE, MESSAGE_SIMPLE, MESSAGE_WITH_ATTACHMENTS } from "./helpers/fixtures";

// ─── resolveGuildId ─────────────────────────────────────────────────────────

describe("resolveGuildId", () => {
	it("returns the provided guild ID when given", () => {
		expect(resolveGuildId("provided-id", "default-id")).toBe("provided-id");
	});

	it("falls back to the default guild ID", () => {
		expect(resolveGuildId(undefined, "default-id")).toBe("default-id");
	});

	it("throws UserError when neither ID is provided", () => {
		expect(() => resolveGuildId(undefined, undefined)).toThrow(UserError);
	});

	it("throws UserError with helpful message", () => {
		try {
			resolveGuildId(undefined, undefined);
		} catch (e) {
			expect(e).toBeInstanceOf(UserError);
			expect((e as UserError).message).toContain("No guild ID provided");
		}
	});
});

// ─── resolveGuild ───────────────────────────────────────────────────────────

describe("resolveGuild", () => {
	it("resolves a guild from the client cache", async () => {
		const client = createMockDiscordClient();
		const guild = await resolveGuild(client, GUILD_FIXTURE.id);
		expect(guild.id).toBe(GUILD_FIXTURE.id);
		expect(guild.name).toBe(GUILD_FIXTURE.name);
	});

	it("throws UserError when guild is not found", async () => {
		const client = createMockDiscordClient();
		try {
			await resolveGuild(client, "non-existent-id");
			expect.unreachable("Should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(UserError);
			expect((e as UserError).message).toContain("not found");
		}
	});

	it("uses default guild ID when guildId is not provided", async () => {
		const client = createMockDiscordClient();
		const guild = await resolveGuild(client, undefined, GUILD_FIXTURE.id);
		expect(guild.id).toBe(GUILD_FIXTURE.id);
	});
});

// ─── formatMessage ──────────────────────────────────────────────────────────

describe("formatMessage", () => {
	it("formats a simple message with timestamp, author, and content", () => {
		const result = formatMessage(MESSAGE_SIMPLE as never);
		expect(result).toContain("2024-06-15");
		expect(result).toContain(MESSAGE_SIMPLE.author.tag);
		expect(result).toContain(MESSAGE_SIMPLE.content);
		expect(result).toContain(MESSAGE_SIMPLE.id);
	});

	it("includes attachment URLs when present", () => {
		const result = formatMessage(MESSAGE_WITH_ATTACHMENTS as never);
		expect(result).toContain("Attachments:");
		expect(result).toContain("cdn.discordapp.com");
	});

	it("includes embed count when present", () => {
		const result = formatMessage(MESSAGE_WITH_ATTACHMENTS as never);
		expect(result).toContain("Embeds: 1");
	});

	it("does not show attachments/embeds sections when absent", () => {
		const result = formatMessage(MESSAGE_SIMPLE as never);
		expect(result).not.toContain("Attachments:");
		expect(result).not.toContain("Embeds:");
	});
});

// ─── withDiscordErrorHandling ───────────────────────────────────────────────

describe("withDiscordErrorHandling", () => {
	it("returns the value from a successful operation", async () => {
		const result = await withDiscordErrorHandling(async () => "success");
		expect(result).toBe("success");
	});

	it("passes through UserError unchanged", async () => {
		try {
			await withDiscordErrorHandling(async () => {
				throw new UserError("Custom error");
			});
			expect.unreachable("Should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(UserError);
			expect((e as UserError).message).toBe("Custom error");
		}
	});

	it("maps known Discord API error codes to friendly messages", async () => {
		// Simulate a DiscordAPIError with code 50013 (Missing Permissions)
		const error = new DiscordAPIError(
			{ code: 50013, message: "Missing Permissions" },
			50013,
			403,
			"POST",
			"/api/test",
			{} as never,
		);

		try {
			await withDiscordErrorHandling(async () => {
				throw error;
			});
			expect.unreachable("Should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(UserError);
			expect((e as UserError).message).toContain("Missing permissions");
		}
	});

	it("wraps unknown errors in UserError", async () => {
		try {
			await withDiscordErrorHandling(async () => {
				throw new Error("Something broke");
			});
			expect.unreachable("Should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(UserError);
			expect((e as UserError).message).toContain("Something broke");
		}
	});

	it("handles non-Error thrown values", async () => {
		try {
			await withDiscordErrorHandling(async () => {
				throw "string error";
			});
			expect.unreachable("Should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(UserError);
			expect((e as UserError).message).toContain("unknown error");
		}
	});
});
