import { beforeEach, describe, expect, it, mock } from "bun:test";
import { UserError } from "fastmcp";
import { registerMemberTools } from "../../tools/members";
import { createMockDiscordClient } from "../helpers/discord-mock";
import {
	ANOTHER_USER,
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
			expect(result).toContain(MEMBER_ONE_FIXTURE.nickname);
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
			expect(result).toContain("Members (2)");
		});

		it("shows nickname in listing when present", async () => {
			const result = await callTool("list_members", {
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain(MEMBER_ONE_FIXTURE.nickname);
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
	});

	describe("MEMBER_TWO_FIXTURE sanity", () => {
		it("has no nickname — confirms null-nickname path", () => {
			expect(MEMBER_TWO_FIXTURE.nickname).toBeNull();
		});

		it("is a booster — confirms premiumSince path", () => {
			expect(MEMBER_TWO_FIXTURE.premiumSince).toBeInstanceOf(Date);
		});
	});
});
