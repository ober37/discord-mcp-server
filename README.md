<p align="center">
  <h1 align="center">discord-mcp-server</h1>
  <p align="center">
    A Model Context Protocol (MCP) server that exposes Discord operations as tools for AI assistants.
  </p>
  <p align="center">
    <a href="https://www.npmjs.com/package/@ncodelife/discord-mcp-server"><img src="https://img.shields.io/npm/v/@ncodelife/discord-mcp-server.svg" alt="npm version"></a>
    <a href="https://github.com/ngoctranfire/discord-mcp-server/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@ncodelife/discord-mcp-server.svg" alt="license"></a>
    <a href="https://smithery.ai/server/discord-mcp-server"><img src="https://smithery.ai/badge/discord-mcp-server" alt="Smithery"></a>
  </p>
</p>

---

## What is this?

**discord-mcp-server** lets any MCP-compatible AI client (Claude Desktop, Cursor, Windsurf, etc.) interact with Discord — send messages with rich embeds and native file attachments, manage channels, create webhooks, assign roles, and more.

> Built with [Bun](https://bun.sh), [FastMCP](https://github.com/punkpeye/fastmcp), and [discord.js](https://discord.js.org).

## Features

| Category           | Tools                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 🏠 **Server Info** | `list_servers`, `get_server_info`                                                                                                                      |
| 📢 **Channels**    | `list_channels`, `find_channel`, `create_text_channel`, `create_voice_channel`, `delete_channel`, `create_category`, `list_categories`, `move_channel` |
| 💬 **Messages**    | `send_message`, `read_messages`, `edit_message`, `delete_message`, `add_reaction`, `remove_reaction`, `bulk_delete_messages`, `pin_message`, `unpin_message`, `get_pinned_messages`, `get_reactions`, `clear_reactions` |
| 🔗 **Webhooks**    | `list_webhooks`, `create_webhook`, `delete_webhook`, `send_webhook_message`, `edit_webhook`                                                            |
| 🎭 **Roles**       | `list_roles`, `create_role`, `edit_role`, `delete_role`, `assign_role`, `remove_role`                                                                  |
| 🧵 **Threads**     | `list_threads`, `create_thread`, `reply_to_thread`, `get_thread`                                                                                       |
| 👤 **Members**     | `get_member`, `list_members`, `edit_member`, `get_member_presence`                                                                                     |
| 📨 **Invites**     | `create_invite`, `list_invites`, `delete_invite`                                                                                                       |

**44 tools** covering the most common Discord operations. Forum posts are supported via `create_thread`.

> ✦ `get_member_presence` requires the **Presence Intent** to be enabled in the Discord Developer Portal (see setup steps below). Presence is Gateway-only and cannot be fetched via REST — the tool returns live status after the bot observes the first `presenceUpdate` event for a member.

> ✦ `send_message`, `send_webhook_message`, and `reply_to_thread` support **rich embeds** and **native file attachments**. Embeds carry images, titles, descriptions, and fields inline. Attachments are fetched server-side from URLs and uploaded to Discord's CDN. File size limits are tier-aware: 8 MB (Tier 0/1), 50 MB (Tier 2), 100 MB (Tier 3). At least one of `message`, `embeds`, or `attachmentUrls` must be provided.

## Prerequisites

1. **Bun** (v1.0.0+) — [Install Bun](https://bun.sh)
2. **Discord Bot Token** — [Create one here](https://discord.com/developers/applications)

### Creating a Discord Bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application** → give it a name
3. Go to **Bot** → click **Reset Token** → copy the token
4. Under **Privileged Gateway Intents**, enable:
   - ✅ Message Content Intent
   - ✅ Server Members Intent
   - ✅ Presence Intent _(required for `get_member_presence`)_
5. Go to **OAuth2** → **URL Generator**
   - Scopes: `bot`
   - Bot Permissions: `Administrator` (or cherry-pick permissions)
6. Copy the generated URL and open it to invite the bot to your server

## Quick Start

### Option 1: npx (recommended)

```bash
npx @ncodelife/discord-mcp-server --token YOUR_BOT_TOKEN
```

### Option 2: Install globally

```bash
npm install -g @ncodelife/discord-mcp-server
discord-mcp-server --token YOUR_BOT_TOKEN
```

### Option 3: Docker

```bash
docker build -t discord-mcp-server .
docker run -e DISCORD_TOKEN=YOUR_BOT_TOKEN discord-mcp-server
```

## MCP Client Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "discord": {
      "command": "npx",
      "args": ["@ncodelife/discord-mcp-server", "--token", "YOUR_BOT_TOKEN"]
    }
  }
}
```

### Cursor / Windsurf

Add to your MCP settings:

```json
{
  "discord": {
    "command": "npx",
    "args": ["@ncodelife/discord-mcp-server", "--token", "YOUR_BOT_TOKEN"]
  }
}
```

### Smithery

[![Smithery Badge](https://smithery.ai/badge/discord-mcp-server)](https://smithery.ai/server/discord-mcp-server)

Install via Smithery for automatic configuration.

## Configuration

| Option           | CLI Flag      | Env Variable       | Default    |
| ---------------- | ------------- | ------------------ | ---------- |
| Bot Token        | `--token`     | `DISCORD_TOKEN`    | _required_ |
| Default Guild ID | `--guild-id`  | `DISCORD_GUILD_ID` | —          |
| Transport        | `--transport` | `MCP_TRANSPORT`    | `stdio`    |
| HTTP Port        | `--port`      | `MCP_PORT`         | `8080`     |

### Using a `.env` file

```env
DISCORD_TOKEN=your-bot-token-here
DISCORD_GUILD_ID=your-server-id
```

## Transport Modes

### stdio (default)

Standard I/O transport — used by Claude Desktop, Cursor, and most MCP clients.

```bash
discord-mcp-server --token YOUR_TOKEN
```

### HTTP Stream

For web-based integrations and remote access:

```bash
discord-mcp-server --token YOUR_TOKEN --transport http --port 8080
```

> **Note on build targets:** The npm package is built with `--target node` so `npx` works everywhere. The Docker image uses `--target bun` for native Bun performance. Both are fully functional.

## Development

```bash
# Clone the repo
git clone https://github.com/ngoctranfire/discord-mcp-server.git
cd discord-mcp-server

# Install dependencies
bun install

# Run in development
bun run dev

# Type-check
bun run typecheck

# Lint
bun run lint

# Test with MCP Inspector
bun run inspect
```

## Architecture

```
src/
├── index.ts          # Entry point — FastMCP server setup
├── config.ts         # CLI args + env var merging
├── discord.ts        # Discord.js client factory
├── attachments.ts    # File fetching with tier-aware size limits
├── schemas.ts        # Shared Zod schemas (embed + attachment parameters)
├── utils.ts          # Shared utilities (error handling, formatting)
└── tools/
    ├── server-info.ts  # Server listing & details
    ├── channels.ts     # Channel CRUD operations
    ├── messages.ts     # Message send/read/edit/delete + reactions
    ├── webhooks.ts     # Webhook management
    ├── roles.ts        # Role CRUD + assignment
    ├── threads.ts      # Thread & forum operations
    ├── members.ts      # Member profile, listing, editing, and presence
    └── invites.ts      # Invite CRUD (create, list, delete)
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on setup, development, and submitting pull requests.

## License

[MIT](LICENSE)
