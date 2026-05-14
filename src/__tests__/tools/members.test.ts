import { beforeEach, describe, expect, it, mock } from "bun:test";
import { UserError } from "fastmcp";
import { registerMemberTools } from "../../tools/members";
import { createMockDiscordClient } from "../helpers/discord-mock";
import {
	ANOTHER_USER,
	BAN_FIXTURE,
	BANNED_USER,
	BOT_USER,
	GUILD_FIXTURE,
	MEMBER_ONE_FIXTURE,
	MEMBER_TWO_FIXTURE,
	REGULAR_USER,
	ROLE_ADMIN,
	ROLE_MEMBER,
} from "../helpers/fixtures";
import { createTestServer } from "../helpers/test-server";

describe("member tools", () => {
	let client: ReturnType<typeof createMockDiscordClient>;
	let callTool: ReturnType<typeof createTestServer>["callTool"];

	beforeEach(() => {
		client = createMockDiscordClient();
		const harness = createTestServer();
		registerMemberTools(harness.server, client, GUILD_FIXTURE.id);
		callTool = harness.callTool;
	});

	describe("get_member", () => {
		it("returns member profile with tag, nickname, joined date, and roles", async () => {
			const result = await callTool("get_member", {
				userId: REGULAR_USER.id,
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain(REGULAR_USER.tag);
			expect(result).toContain(REGULAR_USER.id);
			expect(result).toContain(MEMBER_ONE_FIXTURE.nickname as string);
			expect(result).toContain("2024-02-01");
			expect(result).toContain(ROLE_MEMBER.name);
		});

		it("shows '(none)' nickname for member with no nickname set", async () => {
			const result = await callTool("get_member", {
				userId: ANOTHER_USER.id,
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("(none)");
		});

		it("shows boost date when member is a booster", async () => {
			const result = await callTool("get_member", {
				userId: ANOTHER_USER.id,
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain(ANOTHER_USER.tag);
			expect(result).toContain("2024-04-01");
		});

		it("shows 'not boosting' for non-booster", async () => {
			const result = await callTool("get_member", {
				userId: REGULAR_USER.id,
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("not boosting");
		});

		it("lists multiple roles for member with several roles", async () => {
			const result = await callTool("get_member", {
				userId: ANOTHER_USER.id,
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain(ROLE_ADMIN.name);
			expect(result).toContain(ROLE_MEMBER.name);
		});

		it("excludes @everyone from roles display", async () => {
			const result = await callTool("get_member", {
				userId: REGULAR_USER.id,
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).not.toContain("@everyone");
			expect(result).toContain(ROLE_MEMBER.name);
		});

		it("throws UserError for unknown userId", async () => {
			try {
				await callTool("get_member", {
					userId: "0000000000000000000",
					guildId: GUILD_FIXTURE.id,
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});
	});

	describe("list_members", () => {
		it("returns all members", async () => {
			const result = await callTool("list_members", {
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain(REGULAR_USER.tag);
			expect(result).toContain(ANOTHER_USER.tag);
			// 3 members: REGULAR_USER, ANOTHER_USER, BOT_MEMBER_FIXTURE
			expect(result).toContain("Members (3)");
		});

		it("shows nickname in listing when present", async () => {
			const result = await callTool("list_members", {
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain(MEMBER_ONE_FIXTURE.nickname as string);
		});

		it("does not show nickname parenthetical when nickname is null", async () => {
			const result = await callTool("list_members", {
				guildId: GUILD_FIXTURE.id,
			});
			// MEMBER_TWO has no nickname; its entry should not have extra parens
			expect(result).toContain(`${ANOTHER_USER.tag} (ID:`);
		});

		it("filters by role — returns only members with that role", async () => {
			const result = await callTool("list_members", {
				guildId: GUILD_FIXTURE.id,
				roleId: ROLE_ADMIN.id,
			});
			expect(result).not.toContain(REGULAR_USER.tag);
			expect(result).toContain(ANOTHER_USER.tag);
		});

		it("returns all members when role filter matches all", async () => {
			const result = await callTool("list_members", {
				guildId: GUILD_FIXTURE.id,
				roleId: ROLE_MEMBER.id,
			});
			expect(result).toContain(REGULAR_USER.tag);
			expect(result).toContain(ANOTHER_USER.tag);
		});

		it("returns no-members message when role filter matches none", async () => {
			const result = await callTool("list_members", {
				guildId: GUILD_FIXTURE.id,
				roleId: "nonexistent-role-id",
			});
			expect(result).toContain("No members found");
		});

		it("respects limit — returns at most N members", async () => {
			const result = await callTool("list_members", {
				guildId: GUILD_FIXTURE.id,
				limit: 1,
			});
			expect(result).toContain("Members (1)");
		});
	});

	describe("edit_member", () => {
		it("updates nickname and reports success", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const member = guild.members.cache.get(REGULAR_USER.id);
			const editSpy = mock(() => Promise.resolve());
			member.edit = editSpy;

			const result = await callTool("edit_member", {
				userId: REGULAR_USER.id,
				nickname: "NewNick",
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("✅");
			expect(result).toContain(REGULAR_USER.tag);
			expect(editSpy).toHaveBeenCalledWith({ nick: "NewNick" });
		});

		it("clears nickname by mapping empty string to null", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const member = guild.members.cache.get(REGULAR_USER.id);
			const editSpy = mock(() => Promise.resolve());
			member.edit = editSpy;

			await callTool("edit_member", {
				userId: REGULAR_USER.id,
				nickname: "",
				guildId: GUILD_FIXTURE.id,
			});
			// discord.js requires null (not "") to clear a nickname
			expect(editSpy).toHaveBeenCalledWith({ nick: null });
		});

		it("applies mute and deaf together", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const member = guild.members.cache.get(REGULAR_USER.id);
			const editSpy = mock(() => Promise.resolve());
			member.edit = editSpy;

			await callTool("edit_member", {
				userId: REGULAR_USER.id,
				mute: true,
				deaf: true,
				guildId: GUILD_FIXTURE.id,
			});
			expect(editSpy).toHaveBeenCalledWith({ mute: true, deaf: true });
		});

		it("returns no-changes when no fields provided", async () => {
			const result = await callTool("edit_member", {
				userId: REGULAR_USER.id,
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("No changes specified");
		});

		it("includes member ID in success response", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const member = guild.members.cache.get(REGULAR_USER.id);
			member.edit = mock(() => Promise.resolve());

			const result = await callTool("edit_member", {
				userId: REGULAR_USER.id,
				nickname: "Test",
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain(REGULAR_USER.id);
		});

		it("throws UserError for unknown userId", async () => {
			try {
				await callTool("edit_member", {
					userId: "0000000000000000000",
					nickname: "Attempt",
					guildId: GUILD_FIXTURE.id,
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});

		it("uses editMe() when bot edits its own nickname as the only field", async () => {
			// When the bot edits only its own nickname, discord.js v14 triggers a
			// DeprecationWarning via process.emitWarning (which can throw in Bun).
			// The fix routes this specific case through guild.members.editMe().
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const editMeSpy = mock(() => Promise.resolve());
			guild.members.editMe = editMeSpy;
			// Also ensure the bot member's edit() is NOT called
			const botMember = guild.members.cache.get(BOT_USER.id);
			const editSpy = mock(() => Promise.resolve());
			botMember.edit = editSpy;

			const result = await callTool("edit_member", {
				userId: BOT_USER.id,
				nickname: "BotNick",
				guildId: GUILD_FIXTURE.id,
			});

			expect(result).toContain("✅");
			expect(result).toContain(BOT_USER.id);
			expect(editMeSpy).toHaveBeenCalledWith({ nick: "BotNick" });
			expect(editSpy).not.toHaveBeenCalled();
		});

		it("uses editMe() with null when bot clears its own nickname via empty string", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const editMeSpy = mock(() => Promise.resolve());
			guild.members.editMe = editMeSpy;
			const botMember = guild.members.cache.get(BOT_USER.id);
			botMember.edit = mock(() => Promise.resolve());

			await callTool("edit_member", {
				userId: BOT_USER.id,
				nickname: "",
				guildId: GUILD_FIXTURE.id,
			});

			expect(editMeSpy).toHaveBeenCalledWith({ nick: null });
		});

		it("uses member.edit() when bot sets mute along with nickname (not nick-only)", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const editMeSpy = mock(() => Promise.resolve());
			guild.members.editMe = editMeSpy;
			const botMember = guild.members.cache.get(BOT_USER.id);
			const editSpy = mock(() => Promise.resolve());
			botMember.edit = editSpy;

			await callTool("edit_member", {
				userId: BOT_USER.id,
				nickname: "BotNick",
				mute: true,
				guildId: GUILD_FIXTURE.id,
			});

			expect(editSpy).toHaveBeenCalledWith({ nick: "BotNick", mute: true });
			expect(editMeSpy).not.toHaveBeenCalled();
		});
	});

	describe("MEMBER_TWO_FIXTURE sanity", () => {
		it("has no nickname — confirms null-nickname path", () => {
			expect(MEMBER_TWO_FIXTURE.nickname).toBeNull();
		});

		it("is a booster — confirms premiumSince path", () => {
			expect(MEMBER_TWO_FIXTURE.premiumSince).toBeInstanceOf(Date);
		});
	});

	describe("get_member_presence", () => {
		// This suite needs its own beforeEach to inject a presence cache.
		// The outer beforeEach registers tools without a cache (valid state).
		let presenceClient: ReturnType<typeof createMockDiscordClient>;
		let presenceCallTool: ReturnType<typeof createTestServer>["callTool"];

		beforeEach(() => {
			presenceClient = createMockDiscordClient();
			const harness = createTestServer();
			const presenceCache = new Map([
				[
					REGULAR_USER.id,
					{
						status: "online" as const,
						activity: "VS Code",
						lastSeen: "2024-02-01T12:00:00.000Z",
					},
				],
				[
					ANOTHER_USER.id,
					{
						status: "dnd" as const,
						activity: null,
						lastSeen: "2024-03-15T08:30:00.000Z",
					},
				],
			]);
			registerMemberTools(harness.server, presenceClient, GUILD_FIXTURE.id, presenceCache);
			presenceCallTool = harness.callTool;
		});

		it("returns status, activity, and lastSeen for cached member", async () => {
			const guild = presenceClient.guilds.cache.get(GUILD_FIXTURE.id);
			const member = guild.members.cache.get(REGULAR_USER.id);
			const fetchSpy = mock(() => Promise.resolve(member));
			guild.members.fetch = fetchSpy;

			const result = await presenceCallTool("get_member_presence", {
				userId: REGULAR_USER.id,
				guildId: GUILD_FIXTURE.id,
			});

			expect(result).toContain(REGULAR_USER.tag);
			expect(result).toContain("Status: online");
			expect(result).toContain("Activity: VS Code");
			expect(result).toContain("Last seen: 2024-02-01T12:00:00.000Z");
			expect(fetchSpy).toHaveBeenCalledWith(REGULAR_USER.id);
		});

		it("returns 'Activity: None' when cached activity is null", async () => {
			const result = await presenceCallTool("get_member_presence", {
				userId: ANOTHER_USER.id,
				guildId: GUILD_FIXTURE.id,
			});

			expect(result).toContain("Status: dnd");
			expect(result).toContain("Activity: None");
		});

		it("returns 'not yet cached' message when member is absent from cache", async () => {
			// BOT_USER is in the guild but not in the presence cache
			const result = await presenceCallTool("get_member_presence", {
				userId: BOT_USER.id,
				guildId: GUILD_FIXTURE.id,
			});

			expect(result).toContain("not yet cached");
			expect(result).toContain("Activity: None");
		});

		it("returns 'not yet cached' when presenceCache is undefined (tool registered without cache)", async () => {
			// Register a fresh tool set without a presence cache (simulates createSandboxServer path)
			const noCacheClient = createMockDiscordClient();
			const noCacheHarness = createTestServer();
			registerMemberTools(noCacheHarness.server, noCacheClient, GUILD_FIXTURE.id);

			const result = await noCacheHarness.callTool("get_member_presence", {
				userId: REGULAR_USER.id,
				guildId: GUILD_FIXTURE.id,
			});

			expect(result).toContain("not yet cached");
		});

		it("throws UserError for unknown userId", async () => {
			try {
				await presenceCallTool("get_member_presence", {
					userId: "0000000000000000000",
					guildId: GUILD_FIXTURE.id,
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});
	});

	describe("kick_member", () => {
		it("returns ✅ with tag and ID on success", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const member = guild.members.cache.get(REGULAR_USER.id);
			member.kick = mock(() => Promise.resolve());

			const result = await callTool("kick_member", {
				userId: REGULAR_USER.id,
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("✅");
			expect(result).toContain(REGULAR_USER.tag);
			expect(result).toContain(REGULAR_USER.id);
		});

		it("calls member.kick() with the provided reason", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const member = guild.members.cache.get(REGULAR_USER.id);
			const kickSpy = mock(() => Promise.resolve());
			member.kick = kickSpy;

			await callTool("kick_member", {
				userId: REGULAR_USER.id,
				reason: "Spamming",
				guildId: GUILD_FIXTURE.id,
			});
			expect(kickSpy).toHaveBeenCalledWith("Spamming");
		});

		it("calls member.kick() with undefined when no reason provided", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const member = guild.members.cache.get(REGULAR_USER.id);
			const kickSpy = mock(() => Promise.resolve());
			member.kick = kickSpy;

			await callTool("kick_member", {
				userId: REGULAR_USER.id,
				guildId: GUILD_FIXTURE.id,
			});
			expect(kickSpy).toHaveBeenCalledWith(undefined);
		});

		it("includes reason in output when provided", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const member = guild.members.cache.get(REGULAR_USER.id);
			member.kick = mock(() => Promise.resolve());

			const result = await callTool("kick_member", {
				userId: REGULAR_USER.id,
				reason: "Off-topic posts",
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("Off-topic posts");
		});

		it("omits reason suffix when reason is not provided", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const member = guild.members.cache.get(REGULAR_USER.id);
			member.kick = mock(() => Promise.resolve());

			const result = await callTool("kick_member", {
				userId: REGULAR_USER.id,
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).not.toContain("Reason:");
		});

		it("throws UserError for unknown userId", async () => {
			try {
				await callTool("kick_member", {
					userId: "0000000000000000000",
					guildId: GUILD_FIXTURE.id,
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});
	});

	describe("ban_member", () => {
		it("calls guild.bans.create() with userId and no message deletion by default", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const banSpy = mock(() => Promise.resolve());
			guild.bans.create = banSpy;

			const result = await callTool("ban_member", {
				userId: REGULAR_USER.id,
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("✅");
			expect(result).toContain(REGULAR_USER.id);
			expect(banSpy).toHaveBeenCalledWith(REGULAR_USER.id, {
				deleteMessageSeconds: 0,
				reason: undefined,
			});
		});

		it("passes deleteMessageSeconds for the requested number of days", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const banSpy = mock(() => Promise.resolve());
			guild.bans.create = banSpy;

			await callTool("ban_member", {
				userId: REGULAR_USER.id,
				deleteMessageDays: 7,
				guildId: GUILD_FIXTURE.id,
			});
			expect(banSpy).toHaveBeenCalledWith(REGULAR_USER.id, {
				deleteMessageSeconds: 7 * 86400,
				reason: undefined,
			});
		});

		it("clamps deleteMessageDays above 7 to 7", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const banSpy = mock(() => Promise.resolve());
			guild.bans.create = banSpy;

			await callTool("ban_member", {
				userId: REGULAR_USER.id,
				deleteMessageDays: 10,
				guildId: GUILD_FIXTURE.id,
			});
			expect(banSpy).toHaveBeenCalledWith(REGULAR_USER.id, {
				deleteMessageSeconds: 7 * 86400,
				reason: undefined,
			});
		});

		it("includes reason in output and passes it to bans.create()", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const banSpy = mock(() => Promise.resolve());
			guild.bans.create = banSpy;

			const result = await callTool("ban_member", {
				userId: REGULAR_USER.id,
				reason: "Hate speech",
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("Hate speech");
			expect(banSpy).toHaveBeenCalledWith(REGULAR_USER.id, {
				deleteMessageSeconds: 0,
				reason: "Hate speech",
			});
		});

		it("mentions deleted days in output when deleteMessageDays > 0", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			guild.bans.create = mock(() => Promise.resolve());

			const result = await callTool("ban_member", {
				userId: REGULAR_USER.id,
				deleteMessageDays: 3,
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("deleted 3d of messages");
		});

		it("does not mention deleted days when deleteMessageDays is 0", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			guild.bans.create = mock(() => Promise.resolve());

			const result = await callTool("ban_member", {
				userId: REGULAR_USER.id,
				deleteMessageDays: 0,
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).not.toContain("deleted");
		});
	});

	describe("unban_member", () => {
		it("calls guild.bans.remove() with the userId", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const unbanSpy = mock(() => Promise.resolve());
			guild.bans.remove = unbanSpy;

			const result = await callTool("unban_member", {
				userId: BANNED_USER.id,
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("✅");
			expect(result).toContain(BANNED_USER.id);
			expect(unbanSpy).toHaveBeenCalledWith(BANNED_USER.id, undefined);
		});

		it("passes reason to bans.remove() and includes it in output", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const unbanSpy = mock(() => Promise.resolve());
			guild.bans.remove = unbanSpy;

			const result = await callTool("unban_member", {
				userId: BANNED_USER.id,
				reason: "Appeal accepted",
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("Appeal accepted");
			expect(unbanSpy).toHaveBeenCalledWith(BANNED_USER.id, "Appeal accepted");
		});

		it("omits reason suffix when no reason provided", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			guild.bans.remove = mock(() => Promise.resolve());

			const result = await callTool("unban_member", {
				userId: BANNED_USER.id,
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).not.toContain("Reason:");
		});
	});

	describe("list_bans", () => {
		it("returns a formatted ban list with tag, ID, and reason", async () => {
			const result = await callTool("list_bans", {
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("Bans (1):");
			expect(result).toContain(BAN_FIXTURE.user.tag);
			expect(result).toContain(BAN_FIXTURE.userId);
			expect(result).toContain(BAN_FIXTURE.reason);
		});

		it("returns 'No active bans.' when the ban list is empty", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			guild.bans.fetch = mock(
				async () =>
					// biome-ignore lint/suspicious/noExplicitAny: test helper
					({ size: 0, map: () => [] }) as any,
			);

			const result = await callTool("list_bans", {
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toBe("No active bans.");
		});

		it("shows ban entry without reason suffix when reason is null", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			guild.bans.fetch = mock(
				async () =>
					({
						size: 1,
						map: (
							fn: (ban: { user: { tag: string; id: string }; reason: string | null }) => string,
						) => [fn({ user: { tag: "NoReason#0000", id: "111" }, reason: null })],
						// biome-ignore lint/suspicious/noExplicitAny: test helper
					}) as any,
			);

			const result = await callTool("list_bans", {
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("NoReason#0000");
			expect(result).not.toContain(" — ");
		});
	});

	describe("timeout_member", () => {
		it("applies timeout and returns ✅ with member tag and duration", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const member = guild.members.cache.get(REGULAR_USER.id);
			member.timeout = mock(() => Promise.resolve());

			const result = await callTool("timeout_member", {
				userId: REGULAR_USER.id,
				durationMinutes: 5,
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("✅");
			expect(result).toContain(REGULAR_USER.tag);
			expect(result).toContain("5 minute(s)");
		});

		it("calls member.timeout() with correct millisecond value", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const member = guild.members.cache.get(REGULAR_USER.id);
			const timeoutSpy = mock(() => Promise.resolve());
			member.timeout = timeoutSpy;

			await callTool("timeout_member", {
				userId: REGULAR_USER.id,
				durationMinutes: 5,
				guildId: GUILD_FIXTURE.id,
			});
			// 5 minutes × 60 seconds × 1000 ms = 300000
			expect(timeoutSpy).toHaveBeenCalledWith(300_000, undefined);
		});

		it("passes null to member.timeout() when durationMinutes is 0", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const member = guild.members.cache.get(REGULAR_USER.id);
			const timeoutSpy = mock(() => Promise.resolve());
			member.timeout = timeoutSpy;

			await callTool("timeout_member", {
				userId: REGULAR_USER.id,
				durationMinutes: 0,
				guildId: GUILD_FIXTURE.id,
			});
			expect(timeoutSpy).toHaveBeenCalledWith(null, undefined);
		});

		it("passes null when durationMinutes is omitted", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const member = guild.members.cache.get(REGULAR_USER.id);
			const timeoutSpy = mock(() => Promise.resolve());
			member.timeout = timeoutSpy;

			await callTool("timeout_member", {
				userId: REGULAR_USER.id,
				guildId: GUILD_FIXTURE.id,
			});
			expect(timeoutSpy).toHaveBeenCalledWith(null, undefined);
		});

		it("clamps durationMinutes to 40320 (28 days) when given a larger value", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const member = guild.members.cache.get(REGULAR_USER.id);
			const timeoutSpy = mock(() => Promise.resolve());
			member.timeout = timeoutSpy;

			await callTool("timeout_member", {
				userId: REGULAR_USER.id,
				durationMinutes: 99999,
				guildId: GUILD_FIXTURE.id,
			});
			// Clamped: 40320 min × 60 × 1000 = 2419200000 ms
			expect(timeoutSpy).toHaveBeenCalledWith(40320 * 60 * 1000, undefined);
		});

		it("returns 'Removed timeout' message when duration is null", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const member = guild.members.cache.get(REGULAR_USER.id);
			member.timeout = mock(() => Promise.resolve());

			const result = await callTool("timeout_member", {
				userId: REGULAR_USER.id,
				durationMinutes: 0,
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("Removed timeout");
			expect(result).toContain(REGULAR_USER.tag);
		});

		it("includes reason in output and passes it to member.timeout()", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const member = guild.members.cache.get(REGULAR_USER.id);
			const timeoutSpy = mock(() => Promise.resolve());
			member.timeout = timeoutSpy;

			const result = await callTool("timeout_member", {
				userId: REGULAR_USER.id,
				durationMinutes: 10,
				reason: "Flooding chat",
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("Flooding chat");
			expect(timeoutSpy).toHaveBeenCalledWith(600_000, "Flooding chat");
		});

		it("throws UserError for unknown userId", async () => {
			try {
				await callTool("timeout_member", {
					userId: "0000000000000000000",
					durationMinutes: 5,
					guildId: GUILD_FIXTURE.id,
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});
	});
});
