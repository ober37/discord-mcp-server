import { beforeEach, describe, expect, it, mock } from "bun:test";
import { UserError } from "fastmcp";
import { registerRoleTools } from "../../tools/roles";
import { createMockDiscordClient } from "../helpers/discord-mock";
import {
	GUILD_FIXTURE,
	REGULAR_USER,
	ROLE_ADMIN,
	ROLE_EVERYONE,
	ROLE_MODERATOR,
} from "../helpers/fixtures";
import { createTestServer } from "../helpers/test-server";

describe("role tools", () => {
	let client: ReturnType<typeof createMockDiscordClient>;
	let callTool: ReturnType<typeof createTestServer>["callTool"];

	beforeEach(() => {
		client = createMockDiscordClient();
		const harness = createTestServer();
		registerRoleTools(harness.server, client, GUILD_FIXTURE.id);
		callTool = harness.callTool;
	});

	describe("list_roles", () => {
		it("returns all roles with details", async () => {
			const result = await callTool("list_roles", {
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain(ROLE_ADMIN.name);
			expect(result).toContain("Moderator");
			expect(result).toContain("Member");
			expect(result).toContain(`ID: ${ROLE_ADMIN.id}`);
			expect(result).toContain(`[${ROLE_ADMIN.hexColor}]`);
		});
	});

	describe("create_role", () => {
		it("creates a new role and returns details", async () => {
			const result = await callTool("create_role", {
				name: "New Role",
				color: "#FF0000",
				hoist: true,
				mentionable: false,
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("✅");
			expect(result).toContain("Created role");
			expect(result).toContain("New Role");
			expect(result).toContain("ID:");
		});
	});

	describe("edit_role", () => {
		it("edits an existing role", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const role = guild.roles.cache.get(ROLE_ADMIN.id);
			const editSpy = mock(() => Promise.resolve());
			role.edit = editSpy;

			const result = await callTool("edit_role", {
				roleId: ROLE_ADMIN.id,
				name: "Super Admin",
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("✅");
			expect(result).toContain("Updated role");
			expect(result).toContain(ROLE_ADMIN.id);
			expect(editSpy).toHaveBeenCalledTimes(1);
		});

		it("returns no-changes message when no updates specified", async () => {
			const result = await callTool("edit_role", {
				roleId: ROLE_ADMIN.id,
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("No changes specified");
		});

		it("refuses to edit @everyone role", async () => {
			try {
				await callTool("edit_role", {
					roleId: ROLE_EVERYONE.id,
					name: "Renamed",
					guildId: GUILD_FIXTURE.id,
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});
	});

	describe("delete_role", () => {
		it("deletes a role and confirms", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const role = guild.roles.cache.get(ROLE_MODERATOR.id);
			const deleteSpy = mock(() => Promise.resolve());
			role.delete = deleteSpy;

			const result = await callTool("delete_role", {
				roleId: ROLE_MODERATOR.id,
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("✅");
			expect(result).toContain("Deleted role");
			expect(result).toContain(ROLE_MODERATOR.id);
			expect(deleteSpy).toHaveBeenCalledTimes(1);
		});

		it("refuses to delete @everyone role", async () => {
			try {
				await callTool("delete_role", {
					roleId: ROLE_EVERYONE.id,
					guildId: GUILD_FIXTURE.id,
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});
	});

	describe("assign_role", () => {
		it("assigns a role to a user", async () => {
			const result = await callTool("assign_role", {
				userId: REGULAR_USER.id,
				roleId: ROLE_ADMIN.id,
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("✅");
			expect(result).toContain("Assigned role");
			expect(result).toContain(ROLE_ADMIN.name);
			expect(result).toContain(REGULAR_USER.tag);
		});
	});

	describe("remove_role", () => {
		it("removes a role from a user", async () => {
			const result = await callTool("remove_role", {
				userId: REGULAR_USER.id,
				roleId: ROLE_ADMIN.id,
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain("✅");
			expect(result).toContain("Removed role");
			expect(result).toContain(ROLE_ADMIN.name);
			expect(result).toContain(REGULAR_USER.tag);
		});
	});
});
