# Discord MCP — Agent Conventions

## Runtime

- **Bun** is the primary runtime. Always use `bun run`, `bun add`, `bun test`.
- Node.js compatibility is maintained for `npx` distribution.

## Stack

- **FastMCP** (v3.x) for MCP server framework
- **discord.js** (v14.x) for Discord API
- **Zod** (v4.x) for schema validation
- **Biome** for linting and formatting

## Code Style

- TypeScript strict mode, ESNext target
- Use `tab` indentation (configured in biome.json)
- Max line width: 100 characters
- Use `type` imports for type-only imports

## Tool Pattern

Every tool file in `src/tools/` exports a `register(server, client)` function.
Tools must:

1. Use Zod schemas for parameters
2. Use `withDiscordErrorHandling()` for all Discord API calls
3. Support optional `guildId` with fallback to `DISCORD_GUILD_ID` env var
4. Return human-readable strings (not raw JSON)

## Error Handling

- Use `UserError` from FastMCP for user-facing errors
- Map Discord API error codes via `withDiscordErrorHandling()`
- Never expose raw Discord API errors to the MCP client

## File Naming

- Tool files: kebab-case (e.g., `server-info.ts`)
- Exports: camelCase functions (e.g., `registerServerInfoTools`)
