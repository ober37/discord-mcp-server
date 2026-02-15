# Contributing to discord-mcp-server

Thanks for your interest in contributing! Here's how to get started.

## Setup

```bash
# Clone the repo
git clone https://github.com/ngoctranfire/discord-mcp-server.git
cd discord-mcp-server

# Install dependencies (Bun required)
bun install

# Copy env and add your Discord bot token
cp .env.example .env
```

## Development

```bash
# Run in development (requires DISCORD_TOKEN in .env)
bun run dev

# Type-check
bun run typecheck

# Lint
bun run lint

# Test with MCP Inspector
bun run inspect
```

## Adding a New Tool

1. Create or edit a file in `src/tools/`
2. Export a `register(server, client)` function
3. Use Zod schemas for parameter validation
4. Wrap Discord API calls with `withDiscordErrorHandling()`
5. Register in `src/index.ts`

## Pull Requests

- Keep PRs focused on a single change
- Run `bun run typecheck && bun run lint` before submitting
- Add a clear description of what changed and why

## Code Style

- We use **Biome** for linting and formatting
- Run `bun run lint:fix` to auto-fix issues
- TypeScript strict mode is enforced
