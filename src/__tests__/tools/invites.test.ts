import { beforeEach, describe, expect, it, mock } from "bun:test";
import { UserError } from "fastmcp";
import { registerInviteTools } from "../../tools/invites";
import { createMockDiscordClient } from "../helpers/discord-mock";
import {
	CHANNEL_GENERAL,
	GUILD_FIXTURE,
	INVITE_GENERAL,
	INVITE_NO_EXPIRY,
} from "../helpers/fixtures";
import { createTestServer } from "../helpers/test-server";

describe("invite tools", () => {
	let client: ReturnType<typeof createMockDiscordClient>;
	let callTool: ReturnType<typeof createTestServer>["callTool"];

	beforeEach(() => {
		client = createMockDiscordClient();
		const harness = createTestServer();
		registerInviteTools(harness.server, client, GUILD_FIXTURE.id);
		callTool = harness.callTool;
	});

	describe("create_invite", () => {
		it("creates an invite with default options", async () => {
			const result = await callTool("create_invite", {
				channelId: CHANNEL_GENERAL.id,
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("✅");
			expect(result).toContain("https://discord.gg/");
			expect(result).toContain("Code:");
			expect(result).toContain("86400s");
			expect(result).toContain("unlimited");
		});

		it("creates an invite with custom maxAge, maxUses, temporary", async () => {
			const result = await callTool("create_invite", {
				channelId: CHANNEL_GENERAL.id,
				maxAge: 3600,
				maxUses: 5,
				temporary: true,
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("3600s");
			expect(result).toContain("5");
			expect(result).toContain("true");
		});

		it("creates an invite with maxAge 0 (never expires)", async () => {
			const result = await callTool("create_invite", {
				channelId: CHANNEL_GENERAL.id,
				maxAge: 0,
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("never");
		});

		it("calls channel.createInvite with provided options", async () => {
			const channel = await client.channels.fetch(CHANNEL_GENERAL.id);
			const createInviteSpy = mock(channel.createInvite);
			channel.createInvite = createInviteSpy;

			await callTool("create_invite", {
				channelId: CHANNEL_GENERAL.id,
				maxAge: 7200,
				maxUses: 3,
				temporary: false,
				guildId: GUILD_FIXTURE.id,
			});

			expect(createInviteSpy).toHaveBeenCalledTimes(1);
			expect(createInviteSpy).toHaveBeenCalledWith({
				maxAge: 7200,
				maxUses: 3,
				temporary: false,
			});
		});

		it("throws UserError for a channel that does not support invites", async () => {
			// Use a non-existent channel ID — channels.fetch returns null
			try {
				await callTool("create_invite", {
					channelId: "0000000000000000000",
					guildId: GUILD_FIXTURE.id,
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});
	});

	describe("list_invites", () => {
		it("returns all guild invites", async () => {
			const result = await callTool("list_invites", {
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain(`https://discord.gg/${INVITE_GENERAL.code}`);
			expect(result).toContain(`https://discord.gg/${INVITE_NO_EXPIRY.code}`);
			expect(result).toContain("Active invites (2)");
		});

		it("includes invite details: channel, uses, expiry, inviter", async () => {
			const result = await callTool("list_invites", { guildId: GUILD_FIXTURE.id });
			expect(result).toContain(`#${INVITE_GENERAL.channelName}`);
			expect(result).toContain(INVITE_GENERAL.inviterTag);
			expect(result).toContain(`${INVITE_GENERAL.uses}/${INVITE_GENERAL.maxUses}`);
			expect(result).toContain(`${INVITE_GENERAL.maxAge}s`);
		});

		it("shows 'never' for invites with maxAge 0", async () => {
			const result = await callTool("list_invites", { guildId: GUILD_FIXTURE.id });
			expect(result).toContain("never");
		});

		it("filters invites by channelId", async () => {
			const result = await callTool("list_invites", {
				channelId: CHANNEL_GENERAL.id,
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain(INVITE_GENERAL.code);
			expect(result).not.toContain(INVITE_NO_EXPIRY.code);
		});

		it("returns empty message when no invites found", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			guild.invites.fetch = async () => ({ size: 0, map: () => [] });

			const result = await callTool("list_invites", { guildId: GUILD_FIXTURE.id });
			expect(result).toBe("No active invites found.");
		});
	});

	describe("delete_invite", () => {
		it("revokes a known invite code", async () => {
			const result = await callTool("delete_invite", {
				code: INVITE_GENERAL.code,
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("✅");
			expect(result).toContain(INVITE_GENERAL.code);
		});

		it("calls invite.delete()", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const deleteSpy = mock(() => Promise.resolve());
			const originalFetch = guild.invites.fetch.bind(guild.invites);
			guild.invites.fetch = async (code: string) => {
				const invite = await originalFetch(code);
				invite.delete = deleteSpy;
				return invite;
			};

			await callTool("delete_invite", {
				code: INVITE_GENERAL.code,
				guildId: GUILD_FIXTURE.id,
			});

			expect(deleteSpy).toHaveBeenCalledTimes(1);
		});

		it("throws UserError for an unknown invite code", async () => {
			try {
				await callTool("delete_invite", {
					code: "unknown-code",
					guildId: GUILD_FIXTURE.id,
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});
	});
});
