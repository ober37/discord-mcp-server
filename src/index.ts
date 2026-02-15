#!/usr/bin/env node
import { FastMCP } from "fastmcp";
import { loadConfig } from "./config.ts";
import { createDiscordClient } from "./discord.ts";
import { registerChannelTools } from "./tools/channels.ts";
import { registerMessageTools } from "./tools/messages.ts";
import { registerRoleTools } from "./tools/roles.ts";
import { registerServerInfoTools } from "./tools/server-info.ts";
import { registerThreadTools } from "./tools/threads.ts";
import { registerWebhookTools } from "./tools/webhooks.ts";

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
