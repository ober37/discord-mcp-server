#!/usr/bin/env node
import type { Client } from "discord.js";
import { FastMCP } from "fastmcp";
import { loadConfig } from "./config.ts";
import { createDiscordClient } from "./discord.ts";
import { registerChannelTools } from "./tools/channels.ts";
import { registerMemberTools } from "./tools/members.ts";
import { registerMessageTools } from "./tools/messages.ts";
import { registerRoleTools } from "./tools/roles.ts";
import { registerServerInfoTools } from "./tools/server-info.ts";
import { registerThreadTools } from "./tools/threads.ts";
import { registerWebhookTools } from "./tools/webhooks.ts";

// ─── Bun / discord.js compatibility ─────────────────────────────────────────
// discord.js v14 calls process.emitWarning() internally for rate-limit notices
// and deprecation hints. Bun's implementation of that Node.js API has a gap:
// it throws instead of silently emitting the warning event, which bubbles up
// through withDiscordErrorHandling as an opaque "process.emitWarning" error.
// Wrapping it in a try-catch shim makes the warnings safe in all runtimes.
if (typeof process.emitWarning === "function") {
	const _orig = process.emitWarning.bind(process);
	// biome-ignore lint/suspicious/noExplicitAny: overriding a Node.js built-in with complex overloads
	(process as any).emitWarning = (...args: any[]) => {
		try {
			_orig(...args);
		} catch {
			const msg = args[0];
			console.error(
				"[Warning]",
				typeof msg === "string" ? msg : ((msg as Error)?.message ?? String(msg)),
			);
		}
	};
}
process.on("warning", (w) => console.error(`[Warning] ${w.name}: ${w.message}`));
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
	const config = loadConfig();

	// Initialize Discord client
	const discordClient = await createDiscordClient(config.discordToken);

	// Create FastMCP server
	const server = new FastMCP({
		name: "discord-mcp-server",
		version: "0.1.0",
	});

	// Register all tool groups
	const guildId = config.defaultGuildId;
	registerServerInfoTools(server, discordClient, guildId);
	registerChannelTools(server, discordClient, guildId);
	registerMessageTools(server, discordClient, guildId);
	registerWebhookTools(server, discordClient, guildId);
	registerRoleTools(server, discordClient, guildId);
	registerThreadTools(server, discordClient, guildId);
	registerMemberTools(server, discordClient, guildId);

	// Start the server with the configured transport
	if (config.transport === "stdio") {
		server.start({ transportType: "stdio" });
	} else {
		server.start({
			transportType: "httpStream",
			httpStream: { port: config.port },
		});
	}

	console.error(`🚀 Discord MCP server started (transport: ${config.transport})`);
}

main().catch((error) => {
	console.error("Fatal error starting Discord MCP server:", error);
	process.exit(1);
});

/**
 * Smithery sandbox server for tool scanning.
 * Returns a FastMCP instance with all tools registered but no real Discord connection.
 * This allows Smithery to scan tool schemas without requiring credentials.
 */
export function createSandboxServer() {
	const server = new FastMCP({
		name: "discord-mcp-server",
		version: "0.1.0",
	});

	// Register all tools with a null client — Smithery only reads schemas, never invokes tools
	const mockClient = null as unknown as Client;
	registerServerInfoTools(server, mockClient, undefined);
	registerChannelTools(server, mockClient, undefined);
	registerMessageTools(server, mockClient, undefined);
	registerWebhookTools(server, mockClient, undefined);
	registerRoleTools(server, mockClient, undefined);
	registerThreadTools(server, mockClient, undefined);
	registerMemberTools(server, mockClient, undefined);

	return server;
}
