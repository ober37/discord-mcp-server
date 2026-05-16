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
    automod.ts      # registerAutomodTools()
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

### `create_thread` (public) triggers a Discord system notification message

When a **public thread** is created in a text channel, Discord automatically posts a system message in the parent channel: "Bot started a thread: thread-name". This message has its own ID and persists even after the thread itself is deleted.

**Impact on smoke tests:** After creating a public thread for testing, always call `read_messages` on the parent channel to capture the system notification's ID, then delete it explicitly during cleanup. The notification is the last message in the channel after creation and shows the thread name as content in `read_messages` output.

**Private threads** do not generate a visible system notification in the parent channel — only public thread creation does this.

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

---

### Three-review gate before every PR

**All three reviews are required before opening any PR. Present findings from all three to the user together — do not open the PR until the user has seen and approved the full review output.**

The sequence is:
1. Run `/review` (automated code review)
2. Run `/security-review` (automated security review)
3. Perform a **deep manual review** of the diff (see checklist below)
4. Present all findings together to the user
5. Fix every finding, re-run the pre-commit gate, repeat reviews until clean
6. Only then open the PR — never before

**Code review checklist** (verify for every new or changed tool):
- All tools wrap their execute body in `withDiscordErrorHandling`
- `resolveGuild` is called and its result used — never called just for side-effect validation while the resource is fetched independently
- No dead code (unreachable null guards, unused return values, stale variables)
- New Discord API error codes added to `DISCORD_ERROR_MAP` in `utils.ts`
- Every parameter has `.describe()`; all success strings have a `✅` prefix
- README tool count matches the actual sum of the features table
- No unsafe type casts without a `biome-ignore` comment that explains why
- CLAUDE.md Gateway Intents table updated if any intents changed
- Edge cases documented in tool descriptions (e.g. permission requirements, ordering constraints)

**Security review checklist** (verify for every new or changed tool):
- No user-supplied strings passed directly to `eval`, shell commands, or template literals in API calls without validation
- All resource lookups go through `withDiscordErrorHandling` — no raw try/catch that swallows errors silently
- No credentials, tokens, or secrets logged or returned in success/error strings
- `UserError` used for all client-facing errors — never expose raw Discord API error details beyond what `DISCORD_ERROR_MAP` provides
- Write operations (POST/PATCH/DELETE) require appropriate Discord permissions — permission requirement documented in the tool description
- No SSRF risk from user-supplied URLs — attachment URLs go through `fetchAttachments`; never bypass this for new attachment-handling tools
- Parameters accepting IDs are typed as strings — no coercion that could allow unexpected inputs
- No unbounded operations (fetching all members/messages without a limit) that could DoS the Discord API or exhaust memory
- Bot token and guild ID come only from config (`src/config.ts`) — never from tool parameters

**Deep manual review checklist** (for every new tool, look up the discord.js docs / API behavior):
- Verify each discord.js API call used actually exists and behaves as expected (don't assume — check)
- For `edit()`-style calls: confirm which fields can be combined in a single call vs. which require separate calls; confirm Discord API accepts the exact payload shape being sent
- For member/user operations: confirm what happens when the target user doesn't exist in the guild, isn't in the thread, or is already in the thread — does Discord return a clear error or silently succeed?
- For state-changing tools: document any ordering constraints in the tool description (e.g. must be unarchived before locking)
- For tools that do NOT call `resolveGuild`: confirm this is intentional and the tool cannot be misdirected to operate on a resource in a different guild
- For every tool: confirm the success string accurately reflects what actually happened (e.g. if an op is idempotent, the message should not imply it changed state when it may not have)
- For every tool: confirm permission requirements are complete — check discord.js source or API docs, not just assumptions

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
| `GuildScheduledEvents` | ✅ enabled | `list_events`, `create_event`, `edit_event`, `delete_event` |
| `GuildPresence` | ✅ enabled | `get_member_presence` (privileged — requires Developer Portal toggle; data cached from `presenceUpdate` Gateway events) |
| `DirectMessages` | ✅ enabled | `send_dm`, `read_dm` |
| `AutoModerationConfiguration` | ✅ enabled | automod tools (`list_automod_rules`, `create_automod_rule`, `edit_automod_rule`, `delete_automod_rule`) |
| `GuildMessageReactions` | ✅ enabled | reaction tools (`add_reaction`, `remove_reaction`, `get_reactions`, `clear_reactions`) |
| `GuildVoiceStates` | ✅ enabled | voice tools (`move_member_to_voice`, `disconnect_member_from_voice`) |

When adding a new intent, update both `src/discord.ts` and this table.
