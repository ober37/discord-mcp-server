/**
 * Test harness for FastMCP tool testing.
 *
 * FastMCP doesn't expose registered tools publicly, so we intercept `addTool`
 * calls to capture them. This lets us call tool `execute` handlers directly
 * with our mock Discord client, without needing a transport layer.
 */

import { FastMCP } from "fastmcp";

// biome-ignore lint/suspicious/noExplicitAny: tool definitions have varied parameter shapes
type CapturedTool = { name: string; execute: (args: any) => Promise<any> };

export function createTestServer(): {
	server: FastMCP;
	/** All tools captured during registration */
	tools: CapturedTool[];
	/** Find a tool by name and call its execute handler */
	callTool: (name: string, args?: Record<string, unknown>) => Promise<string>;
} {
	const server = new FastMCP({ name: "test-server", version: "0.0.0" });
	const tools: CapturedTool[] = [];

	// Intercept addTool to capture tool definitions
	const originalAddTool = server.addTool.bind(server);
	// biome-ignore lint/suspicious/noExplicitAny: wrapping generic method
	server.addTool = (tool: any) => {
		tools.push({ name: tool.name, execute: tool.execute });
		return originalAddTool(tool);
	};

	return {
		server,
		tools,
		callTool: async (name: string, args: Record<string, unknown> = {}) => {
			const tool = tools.find((t) => t.name === name);
			if (!tool) {
				const available = tools.map((t) => t.name).join(", ");
				throw new Error(`Tool "${name}" not found. Available: ${available}`);
			}
			const result = await tool.execute(args);
			return typeof result === "string" ? result : JSON.stringify(result);
		},
	};
}
