# CLAUDE.md — discord-mcp-server

Project-specific guidance for Claude Code sessions. Read this before touching any code.

---

## Project overview

A Model Context Protocol (MCP) server exposing Discord operations as tools for AI clients. Built with **Bun**, **FastMCP**, and **discord.js v14**.

- **Upstream repo:** `ngoctranfire/discord-mcp-server`
- **Working fork:** your GitHub fork of the upstream repo
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
  schemas.ts        # shared Zod schemas (embed + attachment parameters)
  attachments.ts    # file fetching with tier-aware size limits
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

### Presence cache

`get_member_presence` is the only stateful tool. A `Map<userId, PresenceData>` is created in `main()` and populated by `presenceUpdate` Gateway events. It is cleared on bot restart — the tool returns "offline (not yet cached)" until the first `presenceUpdate` fires for a given member. The cache is **not** available in `createSandboxServer()` (null client; no event listeners attached there).

**Adding a new tool module** requires changes in five places:
1. `src/tools/<name>.ts` — implement `registerXxxTools(server, client, defaultGuildId)`
2. `src/index.ts` — call `registerXxxTools()` in both `main()` and `createSandboxServer()`
3. `src/__tests__/tools/<name>.test.ts` — new test file
4. `src/__tests__/helpers/discord-mock.ts` / `fixtures.ts` — extend mock as needed
5. `README.md` — add new tools to the features table; update the architecture tree if new `src/` files were added

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

### ⚠️ `process.emitWarning` shim — present but not the real fix for nickname edits

A try-catch shim wrapping `process.emitWarning` is present in `src/index.ts`. It was added as a precaution, but investigation confirmed Bun's `process.emitWarning` does **not** throw — it works correctly. The shim is harmless; do not remove it, but do not rely on it to fix future issues.

#### The real issue: bot editing its own nickname via `member.edit()`

discord.js v14 has a deprecated code path in `GuildMemberManager#edit()`: when the bot edits **its own nickname** and `nick` is the **only** field in the update options, it emits a `DeprecationWarning` and reroutes internally. This deprecated path can surface unexpected errors in the MCP runtime.

**The fix** (already applied in `src/tools/members.ts`) is to detect this case and call `guild.members.editMe()` instead, which bypasses the deprecated path entirely:

```typescript
const isSelfNickOnly =
    member.id === client.user?.id && Object.keys(updates).length === 1 && "nick" in updates;

if (isSelfNickOnly) {
    await guild.members.editMe({ nick: updates.nick as string | null });
} else {
    await member.edit(updates);
}
```

Apply this same pattern in any future tool that edits the bot's own fields. The key signals:
- `member.id === client.user?.id` — bot is editing itself
- Only `nick` in the update payload — triggers the deprecated path
- Fix: route through `editMe()` instead of `edit()`

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

### `pin_message` triggers a Discord system notification message

When `pin_message` is called, Discord automatically posts a **system message** in the channel ("Bot pinned a message to this channel"). This is a separate message with its own ID, no text content, and message type 6. It persists in channel history even after the original message is unpinned or deleted — the bot did not post it and cannot prevent it.

**Impact on smoke tests:** After calling `pin_message`, always call `read_messages` to capture the system notification's ID, then delete it explicitly during cleanup. The system message appears immediately after the pinned message in the channel history and shows as `(no text content)` in `read_messages` output.

**Impact on `get_pinned_messages`:** The system notification is not a pinned message — it will not appear in `fetchPinned()` results. No code change needed.

### `reactions.resolve()` vs `reactions.cache.get()` — use resolve for user lookups

Two different APIs exist for looking up a reaction on a message:

- `message.reactions.cache.get(emoji)` — direct cache lookup, returns the cached `MessageReaction` or `undefined`. Used by `remove_reaction` to find the bot's own reaction entry.
- `message.reactions.resolve(emoji)` — the proper discord.js manager API for resolving a reaction by identifier. **Use this** in any tool that needs to inspect or fetch a reaction's users (`reaction.users.fetch()`).

Do not copy `cache.get` from `remove_reaction` when building new reaction tools — `resolve` is correct.

### `[MCP unexpected error]` stderr in tests is expected for error-path cases

`withDiscordErrorHandling` calls `console.error("[MCP unexpected error]", error)` before rethrowing unknown errors as `UserError`. Tests that exercise the not-found / error path (e.g. "throws UserError for unknown messageId") will always print this to stderr during `bun test`. This is **intentional** and does not indicate a test failure — the test output line count and pass/fail count are the only signal that matters.

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
origin   → <your-fork>/discord-mcp-server   (your fork — feature branches live here)
upstream → ngoctranfire/discord-mcp-server  (source repo — PRs target this)
```

### Starting a feature branch

Always sync the fork before cutting a new branch:

```bash
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
git checkout -b feat/<short-name>
```

> ⚠️ **After merging a PR into the fork** (not upstream), `git fetch upstream && git merge upstream/main` does nothing — the change came from `origin`, not `upstream`. In that case run `git pull origin main` first to bring the merge commit down locally, then `git push origin main`.

**Branch naming:** `feat/<short-name>` (e.g. `feat/member-moderation`, `feat/invites`)

---

### Pre-commit gate

All three must be clean before any commit:

| Check | Command | Requirement |
|---|---|---|
| Tests | `bun test` | 0 failures |
| Lint | `bun run lint` | 0 errors, 0 warnings |
| Types | `bun run typecheck` | 0 errors |

For any tool that performs a **write operation** (POST / PATCH / DELETE), also do a live smoke test against a real Discord guild before committing. Unit tests mock the API and will not catch Bun runtime issues.

**Also update `README.md` when any of the following change:**

- A new tool is added → update the features table (tool name + description)
- A tool gains a new capability (e.g. embed or attachment support) → update the `> ✦` callout below the features table
- A new source file is added to `src/` → update the architecture tree
- The server's overall feature set changes → update the "What is this?" description line

---

### Opening a PR

> ⚠️ **PRs are never opened automatically.** Always wait for the user to explicitly ask before running `gh pr create`. This applies even when all checks pass. Confirm that any prior upstream PR for this repo has already been merged before opening a new one.

When the user does ask, open the PR from the fork's feature branch targeting `upstream/main`:

> ⚠️ **`--head` is required** when opening a PR to a repo other than the one the local branch tracks. Without it, `gh pr create` fails with "you must first push the current branch to a remote". Always pass `--head <your-github-username>:<branch>` explicitly.

**Fork-to-fork PR** (feature branch → fork `main`):
```bash
gh pr create \
  --repo <your-github-username>/discord-mcp-server \
  --base main \
  --head <your-github-username>:feat/<branch> \
  --title "feat: <short description>" \
  --body "..."
```

**Fork-to-upstream PR** (fork branch → upstream `main`):
```bash
gh pr create \
  --repo ngoctranfire/discord-mcp-server \
  --base main \
  --head <your-github-username>:feat/<branch> \
  --title "feat: <short description>" \
  --body "$(cat <<'EOF'
## Summary

<!-- One sentence describing what this PR adds. -->

## Tools added

| Tool | Description |
|---|---|
| `tool_name` | What it does |

## Intent changes

<!-- List any GatewayIntentBits added or removed in src/discord.ts, or "None". -->

## How to test

1. Ensure the bot has `<PERMISSION>` in the test guild.
2. Call `tool_name` with `{ ... }`.
3. Expected result: ...

## Checklist

- [ ] `bun test` passes (0 failures)
- [ ] `bun run lint` passes (0 errors)
- [ ] `bun run typecheck` passes (0 errors)
- [ ] Live smoke test completed for all write operations
EOF
)"
```

**PR title format:** `feat: <what was added>` (conventional commit style, imperative, under 70 chars)

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
| `GuildBans` | ✅ enabled | `kick_member`, `ban_member`, `unban_member`, `list_bans`, `timeout_member` |
| `GuildInvites` | ✅ enabled | invite tools (`create_invite`, `list_invites`, `delete_invite`) |
| `GuildScheduledEvents` | 🔜 needed | events tools (future) |
| `GuildPresence` | ✅ enabled | `get_member_presence` (privileged — requires Developer Portal toggle; data cached from `presenceUpdate` Gateway events) |

When adding a new intent, update both `src/discord.ts` and this table.
