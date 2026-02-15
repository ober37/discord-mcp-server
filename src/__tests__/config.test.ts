import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { loadConfig } from "../config";

describe("loadConfig", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		// Reset env before each test
		process.env.DISCORD_TOKEN = "test-token-123";
		process.env.DISCORD_GUILD_ID = "test-guild-id";
		process.env.MCP_TRANSPORT = undefined;
		process.env.MCP_PORT = undefined;
	});

	afterEach(() => {
		// Restore original env
		Object.keys(process.env).forEach((key) => {
			if (originalEnv[key] === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = originalEnv[key];
			}
		});
	});

	it("returns config from environment variables", () => {
		const config = loadConfig();
		expect(config.discordToken).toBe("test-token-123");
		expect(config.defaultGuildId).toBe("test-guild-id");
	});

	it("defaults transport to stdio", () => {
		const config = loadConfig();
		expect(config.transport).toBe("stdio");
	});

	it("defaults port to 8080", () => {
		const config = loadConfig();
		expect(config.port).toBe(8080);
	});

	it("reads MCP_TRANSPORT from env", () => {
		process.env.MCP_TRANSPORT = "sse";
		const config = loadConfig();
		expect(config.transport).toBe("sse");
	});

	it("reads MCP_PORT from env", () => {
		process.env.MCP_PORT = "3000";
		const config = loadConfig();
		expect(config.port).toBe(3000);
	});

	it("exits when DISCORD_TOKEN is missing", () => {
		delete process.env.DISCORD_TOKEN;

		const exitSpy = spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit called");
		});

		try {
			loadConfig();
		} catch {
			// Expected — process.exit throws
		}

		expect(exitSpy).toHaveBeenCalledWith(1);
		exitSpy.mockRestore();
	});
});
