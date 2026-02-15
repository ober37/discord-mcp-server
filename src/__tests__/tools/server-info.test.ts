import { beforeEach, describe, expect, it } from "bun:test";
import { registerServerInfoTools } from "../../tools/server-info";
import { createMockDiscordClient } from "../helpers/discord-mock";
import { GUILD_FIXTURE, OWNER_FIXTURE } from "../helpers/fixtures";
import { createTestServer } from "../helpers/test-server";

describe("server-info tools", () => {
	let client: ReturnType<typeof createMockDiscordClient>;
	let callTool: ReturnType<typeof createTestServer>["callTool"];

	beforeEach(() => {
		client = createMockDiscordClient();
		const harness = createTestServer();
		registerServerInfoTools(harness.server, client, GUILD_FIXTURE.id);
		callTool = harness.callTool;
	});

	describe("list_servers", () => {
		it("returns a formatted list of servers", async () => {
			const result = await callTool("list_servers");
			expect(result).toContain(GUILD_FIXTURE.name);
			expect(result).toContain(GUILD_FIXTURE.id);
			expect(result).toContain(`Members: ${GUILD_FIXTURE.memberCount}`);
		});

		it("returns empty message when bot has no servers", async () => {
			// Create a client with an empty guilds cache
			client.guilds.cache = { size: 0, map: () => [] };
			const harness = createTestServer();
			registerServerInfoTools(harness.server, client, GUILD_FIXTURE.id);
			const result = await harness.callTool("list_servers");
			expect(result).toContain("not a member of any servers");
		});
	});

	describe("get_server_info", () => {
		it("returns detailed server information", async () => {
			const result = await callTool("get_server_info", {
				guildId: GUILD_FIXTURE.id,
			});
			expect(result).toContain(GUILD_FIXTURE.name);
			expect(result).toContain(`Owner: ${OWNER_FIXTURE.tag}`);
			expect(result).toContain(`Members: ${GUILD_FIXTURE.memberCount}`);
			expect(result).toContain(`Boost Level: ${GUILD_FIXTURE.premiumTier}`);
			expect(result).toContain(`ID: ${GUILD_FIXTURE.id}`);
		});

		it("uses default guild ID when none provided", async () => {
			const result = await callTool("get_server_info");
			expect(result).toContain(GUILD_FIXTURE.name);
		});
	});
});
