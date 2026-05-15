import { beforeEach, describe, expect, it, mock } from "bun:test";
import { UserError } from "fastmcp";
import { registerCommandTools } from "../../tools/commands";
import { createMockDiscordClient } from "../helpers/discord-mock";
import { ALL_COMMANDS, COMMAND_INFO, COMMAND_PING, GUILD_FIXTURE } from "../helpers/fixtures";
import { createTestServer } from "../helpers/test-server";

describe("command tools", () => {
	let client: ReturnType<typeof createMockDiscordClient>;
	let callTool: ReturnType<typeof createTestServer>["callTool"];

	beforeEach(() => {
		client = createMockDiscordClient();
		const harness = createTestServer();
		registerCommandTools(harness.server, client, GUILD_FIXTURE.id);
		callTool = harness.callTool;
	});

	describe("list_slash_commands", () => {
		describe("guild-scoped (guildId provided)", () => {
			it("returns all guild commands", async () => {
				const result = await callTool("list_slash_commands", { guildId: GUILD_FIXTURE.id });
				expect(result).toContain(`Guild slash commands (${ALL_COMMANDS.length})`);
				expect(result).toContain(COMMAND_PING.name);
				expect(result).toContain(COMMAND_INFO.name);
			});

			it("includes command ID, name, description, and guild scope", async () => {
				const result = await callTool("list_slash_commands", { guildId: GUILD_FIXTURE.id });
				expect(result).toContain(COMMAND_PING.id);
				expect(result).toContain(COMMAND_PING.description);
				expect(result).toContain("Scope: guild");
			});

			it("returns empty message when no guild commands exist", async () => {
				const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
				guild.commands.fetch = async () => ({ size: 0, map: () => [] });

				const result = await callTool("list_slash_commands", { guildId: GUILD_FIXTURE.id });
				expect(result).toBe("No guild-specific slash commands registered.");
			});

			it("calls guild.commands.fetch()", async () => {
				const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
				const fetchSpy = mock(guild.commands.fetch.bind(guild.commands));
				guild.commands.fetch = fetchSpy;

				await callTool("list_slash_commands", { guildId: GUILD_FIXTURE.id });
				expect(fetchSpy).toHaveBeenCalledTimes(1);
			});
		});

		describe("global (no guildId, no defaultGuildId)", () => {
			beforeEach(() => {
				// Re-register tools without a defaultGuildId so the global path is hit
				client = createMockDiscordClient();
				const harness = createTestServer();
				registerCommandTools(harness.server, client, undefined);
				callTool = harness.callTool;
			});

			it("returns all global commands", async () => {
				const result = await callTool("list_slash_commands", {});
				expect(result).toContain(`Global slash commands (${ALL_COMMANDS.length})`);
				expect(result).toContain(COMMAND_PING.name);
				expect(result).toContain(COMMAND_INFO.name);
			});

			it("includes command ID, name, description, and global scope", async () => {
				const result = await callTool("list_slash_commands", {});
				expect(result).toContain(COMMAND_PING.id);
				expect(result).toContain(COMMAND_PING.description);
				expect(result).toContain("Scope: global");
			});

			it("returns empty message when no global commands exist", async () => {
				// biome-ignore lint/suspicious/noExplicitAny: mock override
				(client as any).application.commands.fetch = async () => ({ size: 0, map: () => [] });

				const result = await callTool("list_slash_commands", {});
				expect(result).toBe("No global slash commands registered.");
			});

			it("throws UserError when client.application is null", async () => {
				// biome-ignore lint/suspicious/noExplicitAny: mock override
				(client as any).application = null;

				try {
					await callTool("list_slash_commands", {});
					expect.unreachable("Should have thrown");
				} catch (e) {
					expect(e).toBeInstanceOf(UserError);
					expect((e as UserError).message).toContain("not ready");
				}
			});

			it("calls client.application.commands.fetch()", async () => {
				const fetchSpy = mock(client.application.commands.fetch.bind(client.application.commands));
				client.application.commands.fetch = fetchSpy;

				await callTool("list_slash_commands", {});
				expect(fetchSpy).toHaveBeenCalledTimes(1);
			});
		});
	});

	describe("delete_slash_command", () => {
		describe("guild-scoped (guildId provided)", () => {
			it("deletes a known guild command", async () => {
				const result = await callTool("delete_slash_command", {
					commandId: COMMAND_PING.id,
					guildId: GUILD_FIXTURE.id,
				});
				expect(result).toContain("✅");
				expect(result).toContain(COMMAND_PING.id);
				expect(result).toContain(GUILD_FIXTURE.name);
			});

			it("calls guild.commands.delete() with the command ID", async () => {
				const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
				const deleteSpy = mock(guild.commands.delete.bind(guild.commands));
				guild.commands.delete = deleteSpy;

				await callTool("delete_slash_command", {
					commandId: COMMAND_PING.id,
					guildId: GUILD_FIXTURE.id,
				});

				expect(deleteSpy).toHaveBeenCalledTimes(1);
				// biome-ignore lint/suspicious/noExplicitAny: spy call args are untyped
				expect((deleteSpy.mock.calls as any[][])[0][0]).toBe(COMMAND_PING.id);
			});

			it("throws UserError for unknown commandId", async () => {
				const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
				guild.commands.delete = async () => {
					throw new Error("Unknown Application Command: bad-id");
				};

				try {
					await callTool("delete_slash_command", {
						commandId: "bad-id",
						guildId: GUILD_FIXTURE.id,
					});
					expect.unreachable("Should have thrown");
				} catch (e) {
					expect(e).toBeInstanceOf(UserError);
				}
			});
		});

		describe("global (no guildId, no defaultGuildId)", () => {
			beforeEach(() => {
				client = createMockDiscordClient();
				const harness = createTestServer();
				registerCommandTools(harness.server, client, undefined);
				callTool = harness.callTool;
			});

			it("deletes a known global command", async () => {
				const result = await callTool("delete_slash_command", {
					commandId: COMMAND_PING.id,
				});
				expect(result).toContain("✅");
				expect(result).toContain(COMMAND_PING.id);
			});

			it("calls client.application.commands.delete() with the command ID", async () => {
				const deleteSpy = mock(
					client.application.commands.delete.bind(client.application.commands),
				);
				client.application.commands.delete = deleteSpy;

				await callTool("delete_slash_command", { commandId: COMMAND_PING.id });

				expect(deleteSpy).toHaveBeenCalledTimes(1);
				// biome-ignore lint/suspicious/noExplicitAny: spy call args are untyped
				expect((deleteSpy.mock.calls as any[][])[0][0]).toBe(COMMAND_PING.id);
			});

			it("throws UserError for unknown commandId", async () => {
				// biome-ignore lint/suspicious/noExplicitAny: mock override
				(client as any).application.commands.delete = async () => {
					throw new Error("Unknown Application Command: bad-id");
				};

				try {
					await callTool("delete_slash_command", { commandId: "bad-id" });
					expect.unreachable("Should have thrown");
				} catch (e) {
					expect(e).toBeInstanceOf(UserError);
				}
			});

			it("throws UserError when client.application is null", async () => {
				// biome-ignore lint/suspicious/noExplicitAny: mock override
				(client as any).application = null;

				try {
					await callTool("delete_slash_command", { commandId: COMMAND_PING.id });
					expect.unreachable("Should have thrown");
				} catch (e) {
					expect(e).toBeInstanceOf(UserError);
					expect((e as UserError).message).toContain("not ready");
				}
			});
		});
	});
});
