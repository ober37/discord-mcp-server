# CLAUDE.md — discord-mcp-server

Project-specific guidance for Claude Code sessions. Read this before touching any code.

---

## Project overview

A Model Context Protocol (MCP) server exposing Discord operations as tools for AI clients. Built with **Bun**, **FastMCP**, and **discord.js v14**.

- **Upstream repo:** `ngoctranfire/discord-mcp-server`
- **Working fork:** `ober37/discord-mcp-server`
- Feature branches live on the fork; PRs target upstream `main`.

---

## Essential commands

```bash
bun test          # run test suite (must pass before any commit)
bun run lint      # Biome check — must be clean before commit
bun run lint:fix  # auto-fix safe formatting issues
bun run dev       # start server locally (requires .env with DISCORD_TOKEN)
bun run typecheck # TypeScript type check without emitting
```

Lint has two classes of fixes: safe (auto-fixed by `lint:fix`) and unsafe (must be fixed manually). Check the diff after `lint:fix` — unsafe suggestions appear as `info` items still listed.

---

## Architecture

```
src/
  index.ts          # entry point — registers all tool groups, starts FastMCP
  discord.ts        # Discord.js client factory + intent config
  config.ts         # env var loading/validation
  utils.ts          # resolveGuild(), withDiscordErrorHandling(), formatMessage()
  schemas.ts        # shared Zod schemas
  tools/
    channels.ts     # registerChannelTools()
    members.ts      # registerMemberTools()  ← added in feat/member-management
    messages.ts     # registerMessageTools()
    roles.ts        # registerRoleTools()
    server-info.ts  # registerServerInfoTools()
    threads.ts      # registerThreadTools()
    webhooks.ts     # registerWebhookTools()
  __tests__/
    helpers/
      discord-mock.ts   # createMockDiscordClient() — Map-backed mock guild/channel/member
      fixtures.ts       # typed test data (IDs, users, roles, members, channels…)
      test-server.ts    # createTestServer() — intercepts addTool(), runs Zod validation
    tools/
      *.test.ts         # one file per tool module
```

**Adding a new tool module** requires changes in four places:
1. `src/tools/<name>.ts` — implement `registerXxxTools(server, client, defaultGuildId)`
2. `src/index.ts` — call `registerXxxTools()` in both `main()` and `createSandboxServer()`
3. `src/__tests__/tools/<name>.test.ts` — new test file
4. `src/__tests__/helpers/discord-mock.ts` / `fixtures.ts` — extend mock as needed

---

## Tool implementation pattern

Every tool follows the same structure — copy this exactly:

```typescript
server.addTool({
  name: "verb_noun",
  description: "One sentence. Start with a verb.",
  parameters: z.object({
    guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
    // ... other params
  }),
  execute: async (args) => {
    return withDiscordErrorHandling(async () => {
      const guild = await resolveGuild(client, args.guildId, defaultGuildId);
      // ... discord.js calls ...
      return `✅ Human-readable success string`;
    });
  },
});
```

Key rules:
- Always wrap execute body in `withDiscordErrorHandling()` — converts Discord API errors to `UserError`
- Always use `resolveGuild()` — handles the `guildId` / `defaultGuildId` fallback
- Return a plain string — emoji prefix + human-readable output
- All parameters optional except required IDs; use `.describe()` on every field

---

## Known runtime considerations (Bun + discord.js)

### ⚠️ `process.emitWarning` shim — already in place

discord.js v14 calls `process.emitWarning()` internally for rate-limit tracking and deprecation notices. Bun's implementation of this Node.js API has a compatibility gap: it throws instead of silently emitting, which crashes active tool calls with an opaque "process.emitWarning" error surfaced to the MCP client.

**The fix is already applied** in `src/index.ts` — a try-catch shim wraps `process.emitWarning` at startup. **Do not remove it.** If you see `process.emitWarning` errors in new tools, the shim is already there; check whether the shim block is still at the top of `index.ts` after any refactor.

This affects **write operations** (PATCH/POST/DELETE to Discord API) more than reads. GET-only tools may appear to work in testing even without the shim, but write tools will fail in Bun without it.

### Clearing nullable string fields: `""` → `null`

When a Discord API field is nullable (e.g. member nickname, ban reason), the correct way to clear it is `null` — **not an empty string**. Passing `""` is typically a no-op or rejected.

Pattern to follow in any tool that lets a user "clear" an optional field:

```typescript
if (args.nickname !== undefined) updates.nick = args.nickname === "" ? null : args.nickname;
```

Document this in the tool's parameter description: `"Pass an empty string to clear."`

### Always filter `@everyone` from role displays

Every Discord member has `@everyone` in `roles.cache`. Any tool that lists a member's roles must filter it:

```typescript
member.roles.cache.filter((r) => r.name !== "@everyone")
```

Failing to do this pollutes every role list output.

### Presence (online status) is NOT REST-accessible

Member online/offline/idle/dnd status requires `GatewayIntentBits.GuildPresence` — a **privileged intent** that must be enabled in the Discord Developer Portal — plus a persistent in-memory cache built from live `presenceUpdate` Gateway events. It cannot be added to `list_members` or any other REST tool as a simple parameter. Do not attempt to surface presence status via REST; it will always return nothing useful.

---

## Test conventions

### Mock guild members

Use `guild.members.cache.get(userId)` (synchronous, returns the same object instance) when you need to inject a spy before calling a tool:

```typescript
// ✅ correct — same object instance, spy sticks
const member = guild.members.cache.get(REGULAR_USER.id);
member.edit = mock(() => Promise.resolve());

// ❌ wrong — fetch() may return a new object; spy won't be seen by the tool
const member = await guild.members.fetch(REGULAR_USER.id);
member.edit = mock(() => Promise.resolve());
```

### Always test error cases

Every tool that looks up a resource by ID needs a test for the not-found path:

```typescript
it("throws UserError for unknown userId", async () => {
    try {
        await callTool("get_member", { userId: "0000000000000000000", guildId: GUILD_FIXTURE.id });
        expect.unreachable("Should have thrown");
    } catch (e) {
        expect(e).toBeInstanceOf(UserError);
    }
});
```

### Test live write operations before shipping

Unit tests mock the Discord API — they won't catch Bun runtime issues. Any tool that performs a write (PATCH / POST / DELETE) must be exercised against a real Discord guild before the PR is opened. Read-only tools (GET) are lower risk but still worth a quick live smoke test.

---

## Branching & PR workflow

```
origin  → ober37/discord-mcp-server       (your fork — feature branches live here)
upstream → ngoctranfire/discord-mcp-server (source repo — PRs target this)
```

**Before starting any feature branch:**
```bash
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
```

**Branch naming:** `feat/<short-name>` (e.g. `feat/member-moderation`, `feat/invites`)

**Before committing:**
1. `bun test` — all tests pass
2. `bun run lint` — clean (zero errors)
3. Live smoke test of any new write operations

**PRs to upstream are not automatic** — open each PR only when explicitly requested, after confirming prior upstream PRs have merged.

---

## Gateway intents

Current intents in `src/discord.ts`:

| Intent | Status | Used by |
|---|---|---|
| `Guilds` | ✅ enabled | all tools |
| `GuildMessages` | ✅ enabled | message tools |
| `GuildMembers` | ✅ enabled | member tools |
| `MessageContent` | ✅ enabled | read_messages |
| `GuildWebhooks` | ✅ enabled | webhook tools |
| `GuildBans` | 🔜 needed | ban/unban tools (WI2) |
| `GuildInvites` | 🔜 needed | invite tools (future) |
| `GuildScheduledEvents` | 🔜 needed | events tools (future) |
| `GuildPresence` | ⚠️ privileged | presence tools (WI1a — requires Developer Portal toggle + Gateway cache) |

When adding a new intent, update both `src/discord.ts` and this table.
