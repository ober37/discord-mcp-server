import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Load .env file into process.env (zero-dependency, works under Bun and Node/tsx).
 * Only sets vars that aren't already defined in the environment.
 */
function loadEnvFile(): void {
	const envPath = resolve(process.cwd(), ".env");
	if (!existsSync(envPath)) return;

	const content = readFileSync(envPath, "utf-8");
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eqIndex = trimmed.indexOf("=");
		if (eqIndex === -1) continue;
		const key = trimmed.slice(0, eqIndex).trim();
		const value = trimmed.slice(eqIndex + 1).trim();
		// Don't override existing env vars
		if (!process.env[key]) {
			process.env[key] = value;
		}
	}
}

loadEnvFile();

/**
 * Configuration for the Discord MCP server.
 * Merges CLI args → environment variables → defaults.
 */
export interface Config {
	discordToken: string;
	defaultGuildId?: string;
	transport: "stdio" | "sse" | "http";
	port: number;
}

function parseArgs(): Partial<Config> {
	const args = process.argv.slice(2);
	const parsed: Partial<Config> = {};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		const next = args[i + 1];

		switch (arg) {
			case "--token":
				if (next) {
					parsed.discordToken = next;
					i++;
				}
				break;
			case "--guild-id":
				if (next) {
					parsed.defaultGuildId = next;
					i++;
				}
				break;
			case "--transport":
				if (next && ["stdio", "sse", "http"].includes(next)) {
					parsed.transport = next as Config["transport"];
					i++;
				}
				break;
			case "--port":
				if (next) {
					parsed.port = Number.parseInt(next, 10);
					i++;
				}
				break;
		}
	}

	return parsed;
}

export function loadConfig(): Config {
	const args = parseArgs();

	const discordToken = args.discordToken || process.env.DISCORD_TOKEN;

	if (!discordToken) {
		console.error(`
╔══════════════════════════════════════════════════════════════╗
║  ❌  DISCORD_TOKEN is required                              ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Set it via CLI:                                             ║
║    discord-mcp-server --token YOUR_BOT_TOKEN                  ║
║                                                              ║
║  Or via environment variable:                                ║
║    export DISCORD_TOKEN=YOUR_BOT_TOKEN                       ║
║                                                              ║
║  Or create a .env file:                                      ║
║    DISCORD_TOKEN=YOUR_BOT_TOKEN                              ║
║                                                              ║
║  Get a token at:                                             ║
║    https://discord.com/developers/applications               ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);
		process.exit(1);
	}

	return {
		discordToken,
		defaultGuildId: args.defaultGuildId || process.env.DISCORD_GUILD_ID,
		transport: args.transport || (process.env.MCP_TRANSPORT as Config["transport"]) || "stdio",
		port: args.port || Number.parseInt(process.env.MCP_PORT || "8080", 10),
	};
}
