import { beforeEach, describe, expect, it, mock } from "bun:test";
import { UserError } from "fastmcp";
import { registerAuditTools } from "../../tools/audit";
import { createMockDiscordClient } from "../helpers/discord-mock";
import {
	AUDIT_LOG_ENTRY_BAN,
	AUDIT_LOG_ENTRY_KICK,
	BOT_USER,
	GUILD_FIXTURE,
	REGULAR_USER,
} from "../helpers/fixtures";
import { createTestServer } from "../helpers/test-server";

describe("audit tools", () => {
	let client: ReturnType<typeof createMockDiscordClient>;
	let callTool: ReturnType<typeof createTestServer>["callTool"];

	beforeEach(() => {
		client = createMockDiscordClient();
		const harness = createTestServer();
		registerAuditTools(harness.server, client, GUILD_FIXTURE.id);
		callTool = harness.callTool;
	});

	describe("get_audit_logs", () => {
		it("returns audit log entries", async () => {
			const result = await callTool("get_audit_logs", { guildId: GUILD_FIXTURE.id });
			expect(result).toContain("Audit log entries");
			expect(result).toContain(AUDIT_LOG_ENTRY_KICK.actionName);
			expect(result).toContain(AUDIT_LOG_ENTRY_BAN.actionName);
		});

		it("includes executor, target, reason, and timestamp in each entry", async () => {
			const result = await callTool("get_audit_logs", { guildId: GUILD_FIXTURE.id });
			expect(result).toContain(`Executor: ${AUDIT_LOG_ENTRY_KICK.executorTag}`);
			expect(result).toContain(`Target: ${AUDIT_LOG_ENTRY_KICK.targetTag}`);
			expect(result).toContain(`Reason: ${AUDIT_LOG_ENTRY_KICK.reason}`);
			expect(result).toContain(AUDIT_LOG_ENTRY_KICK.createdAt.toISOString());
		});

		it("returns 'No audit log entries found' when empty", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			guild.fetchAuditLogs = async () => ({ entries: { size: 0, map: () => [] } });

			const result = await callTool("get_audit_logs", { guildId: GUILD_FIXTURE.id });
			expect(result).toBe("No audit log entries found.");
		});

		it("passes limit to fetchAuditLogs", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const spy = mock(guild.fetchAuditLogs);
			guild.fetchAuditLogs = spy;

			await callTool("get_audit_logs", { limit: 5, guildId: GUILD_FIXTURE.id });

			expect(spy).toHaveBeenCalledTimes(1);
			expect(spy).toHaveBeenCalledWith(expect.objectContaining({ limit: 5 }));
		});

		it("defaults to limit 20 when not specified", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const spy = mock(guild.fetchAuditLogs);
			guild.fetchAuditLogs = spy;

			await callTool("get_audit_logs", { guildId: GUILD_FIXTURE.id });

			expect(spy).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));
		});

		it("filters by actionType", async () => {
			const result = await callTool("get_audit_logs", {
				actionType: AUDIT_LOG_ENTRY_KICK.actionName,
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain(AUDIT_LOG_ENTRY_KICK.actionName);
			expect(result).not.toContain(AUDIT_LOG_ENTRY_BAN.actionName);
		});

		it("passes the numeric AuditLogEvent value for actionType to fetchAuditLogs", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const spy = mock(guild.fetchAuditLogs);
			guild.fetchAuditLogs = spy;

			await callTool("get_audit_logs", {
				actionType: AUDIT_LOG_ENTRY_KICK.actionName,
				guildId: GUILD_FIXTURE.id,
			});

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({ type: AUDIT_LOG_ENTRY_KICK.action }),
			);
		});

		it("filters by userId (executor)", async () => {
			const result = await callTool("get_audit_logs", {
				userId: REGULAR_USER.id,
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain(AUDIT_LOG_ENTRY_KICK.actionName);
			expect(result).not.toContain(AUDIT_LOG_ENTRY_BAN.actionName);
		});

		it("passes userId to fetchAuditLogs", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const spy = mock(guild.fetchAuditLogs);
			guild.fetchAuditLogs = spy;

			await callTool("get_audit_logs", {
				userId: BOT_USER.id,
				guildId: GUILD_FIXTURE.id,
			});

			expect(spy).toHaveBeenCalledWith(expect.objectContaining({ user: BOT_USER.id }));
		});

		it("omits reason segment when entry has no reason", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			guild.fetchAuditLogs = async () => ({
				entries: {
					size: 1,
					map: (fn: (entry: unknown) => unknown) => [
						fn({
							action: 20,
							executor: { tag: "SomeUser#0001" },
							target: { tag: "TargetUser#0002" },
							reason: null,
							createdAt: new Date("2024-06-15T15:00:00.000Z"),
						}),
					],
				},
			});

			const result = await callTool("get_audit_logs", { guildId: GUILD_FIXTURE.id });
			expect(result).not.toContain("Reason:");
		});

		it("throws UserError for an unknown actionType", async () => {
			try {
				await callTool("get_audit_logs", {
					actionType: "NonExistentAction",
					guildId: GUILD_FIXTURE.id,
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
				expect((e as UserError).message).toContain("Unknown action type");
			}
		});

		it("throws UserError for an unknown guildId", async () => {
			try {
				await callTool("get_audit_logs", { guildId: "0000000000000000000" });
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});
	});
});
