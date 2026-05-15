/**
 * Discord.js mock factory — creates mock Client, Guild, Channel objects
 * that implement just enough of the discord.js interface for our MCP tools.
 *
 * Uses Map-backed collections that support filter/sort/map/values/size
 * so the real tool handler logic can run against these without special casing.
 */

import {
	ALL_AUDIT_LOG_ENTRIES,
	ALL_CHANNELS,
	ALL_EMOJIS,
	ALL_INVITES,
	ALL_MEMBER_FIXTURES,
	ALL_ROLES,
	BAN_FIXTURE,
	BOT_USER,
	DM_MESSAGE_ONE,
	DM_MESSAGE_TWO,
	DM_USER,
	GUILD_FIXTURE,
	MESSAGE_FROM_BOT,
	MESSAGE_SIMPLE,
	MESSAGE_WITH_ATTACHMENTS,
	OWNER_FIXTURE,
	REGULAR_USER,
	THREAD_ACTIVE,
	THREAD_ARCHIVED,
	THREAD_PRIVATE,
	WEBHOOK_GITHUB,
	WEBHOOK_MONITORING,
} from "./fixtures";

// ─── Collection Mock ────────────────────────────────────────────────────────
// discord.js Collection extends Map with extra methods like filter, sort, map.

export function createCollection<V>(entries: Array<[string, V]> = []): MockCollection<V> {
	const map = new Map(entries);
	return {
		get: (key: string) => map.get(key),
		has: (key: string) => map.has(key),
		set: (key: string, val: V) => {
			map.set(key, val);
			return map;
		},
		delete: (key: string) => map.delete(key),
		get size() {
			return map.size;
		},
		values: () => map.values(),
		entries: () => map.entries(),
		forEach: (fn: (value: V, key: string) => void) => map.forEach(fn),
		filter: (fn: (value: V, key: string) => boolean) => {
			const filtered = Array.from(map.entries()).filter(([k, v]) => fn(v, k));
			return createCollection(filtered);
		},
		sort: (fn: (a: V, b: V) => number) => {
			const sorted = Array.from(map.entries()).sort(([, a], [, b]) => fn(a, b));
			return createCollection(sorted);
		},
		map: <R>(fn: (value: V, key: string) => R): R[] => {
			return Array.from(map.entries()).map(([k, v]) => fn(v, k));
		},
		find: (fn: (value: V) => boolean) => {
			for (const v of map.values()) {
				if (fn(v)) return v;
			}
			return undefined;
		},
	};
}

interface MockCollection<V> {
	delete: (key: string) => boolean;
	entries: () => IterableIterator<[string, V]>;
	filter: (fn: (value: V, key: string) => boolean) => MockCollection<V>;
	find: (fn: (value: V) => boolean) => V | undefined;
	forEach: (fn: (value: V, key: string) => void) => void;
	get: (key: string) => V | undefined;
	has: (key: string) => boolean;
	map: <R>(fn: (value: V, key: string) => R) => R[];
	set: (key: string, val: V) => Map<string, V>;
	readonly size: number;
	sort: (fn: (a: V, b: V) => number) => MockCollection<V>;
	values: () => IterableIterator<V>;
}

// ─── Channel Mock ───────────────────────────────────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: mock factory needs flexible types
function createMockChannel(fixture: (typeof ALL_CHANNELS)[number]): any {
	const isText = fixture.type === 0 || fixture.type === 5; // GuildText or GuildAnnouncement
	const isVoice = fixture.type === 2;
	const isCategory = fixture.type === 4;
	const isForum = fixture.type === 15;

	const messages = createCollection([
		[MESSAGE_SIMPLE.id, createMockMessage(MESSAGE_SIMPLE)],
		[MESSAGE_WITH_ATTACHMENTS.id, createMockMessage(MESSAGE_WITH_ATTACHMENTS)],
		[MESSAGE_FROM_BOT.id, createMockMessage(MESSAGE_FROM_BOT)],
	]);

	const activeThreads = createCollection([[THREAD_ACTIVE.id, createMockThread(THREAD_ACTIVE)]]);
	const archivedThreads = createCollection([
		[THREAD_ARCHIVED.id, createMockThread(THREAD_ARCHIVED)],
	]);

	const webhooks = createCollection([
		[WEBHOOK_GITHUB.id, createMockWebhook(WEBHOOK_GITHUB)],
		[WEBHOOK_MONITORING.id, createMockWebhook(WEBHOOK_MONITORING)],
	]);

	return {
		id: fixture.id,
		name: fixture.name,
		type: fixture.type,
		position: fixture.position,
		parentId: fixture.parentId,
		guildId: fixture.guildId,

		isTextBased: () => isText || isForum,
		isVoiceBased: () => isVoice,
		isThread: () => false,

		// Text channel features
		...(isText
			? {
					// guild stub gives tool handlers access to premiumTier for size-limit calculation
					guild: { premiumTier: 0 },
					send: async (
						content: string | { content?: string; embeds?: unknown[]; files?: unknown[] },
					) => ({
						id: `new-msg-${Date.now()}`,
						content: typeof content === "string" ? content : (content.content ?? ""),
					}),
					messages: {
						fetch: async (opts?: { limit?: number } | string) => {
							if (typeof opts === "string") {
								const msg = messages.get(opts);
								if (!msg) throw new Error("Unknown Message");
								return msg;
							}
							return messages;
						},
						fetchPinned: async () =>
							createCollection([[MESSAGE_FROM_BOT.id, createMockMessage(MESSAGE_FROM_BOT)]]),
					},
					bulkDelete: async (ids: string[]) => createCollection(ids.map((id) => [id, undefined])),
					threads: {
						fetchActive: async () => ({ threads: activeThreads }),
						fetchArchived: async () => ({ threads: archivedThreads }),
						create: async (opts: { name: string; type?: number }) => ({
							id: `new-thread-${Date.now()}`,
							name: opts.name,
							send: async () => ({}),
						}),
					},
					fetchWebhooks: async () => webhooks,
					createWebhook: async (opts: { name: string }) => ({
						id: `new-webhook-${Date.now()}`,
						name: opts.name,
						url: `https://discord.com/api/webhooks/new-webhook-${Date.now()}/token`,
					}),
					createInvite: async (opts: {
						maxAge?: number;
						maxUses?: number;
						temporary?: boolean;
					}) => ({
						code: `test-invite-${Date.now()}`,
						maxAge: opts.maxAge ?? 86400,
						maxUses: opts.maxUses ?? 0,
						uses: 0,
						temporary: opts.temporary ?? false,
					}),
					edit: async (_opts: Record<string, unknown>) => {},
					permissionOverwrites: {
						create: async (_targetId: string, _options: Record<string, boolean>) => {},
						delete: async (_targetId: string) => {},
					},
					delete: async () => {},
					setParent: async () => {},
				}
			: {}),

		// Voice channel features
		...(isVoice
			? {
					edit: async (_opts: Record<string, unknown>) => {},
					permissionOverwrites: {
						create: async (_targetId: string, _options: Record<string, boolean>) => {},
						delete: async (_targetId: string) => {},
					},
					delete: async () => {},
					setParent: async () => {},
				}
			: {}),

		// Category features
		...(isCategory
			? {
					delete: async () => {},
				}
			: {}),

		// Forum channel features
		...(isForum
			? {
					threads: {
						create: async (opts: { name: string; message: { content: string } }) => ({
							id: `new-forum-post-${Date.now()}`,
							name: opts.name,
						}),
					},
					edit: async (_opts: Record<string, unknown>) => {},
					permissionOverwrites: {
						create: async (_targetId: string, _options: Record<string, boolean>) => {},
						delete: async (_targetId: string) => {},
					},
					delete: async () => {},
					setParent: async () => {},
				}
			: {}),
	};
}

// ─── Message Mock ───────────────────────────────────────────────────────────

function createMockMessage(
	fixture: {
		id: string;
		content: string;
		// biome-ignore lint/suspicious/noExplicitAny: fixture author shape varies across guild and DM messages
		author: any;
		createdAt: Date;
		createdTimestamp: number;
		// biome-ignore lint/suspicious/noExplicitAny: collection type is structurally compatible
		attachments: any;
		embeds: unknown[];
	},
	// biome-ignore lint/suspicious/noExplicitAny: mock factory returns untyped discord.js shape
): any {
	return {
		id: fixture.id,
		content: fixture.content,
		author: fixture.author,
		createdAt: fixture.createdAt,
		createdTimestamp: fixture.createdTimestamp,
		attachments: fixture.attachments,
		embeds: fixture.embeds,
		edit: async (content: string) => ({ ...fixture, content }),
		delete: async () => {},
		react: async () => {},
		pin: async () => {},
		unpin: async () => {},
		startThread: async (opts: { name: string }) => ({
			id: `new-thread-from-msg-${Date.now()}`,
			name: opts.name,
			send: async () => ({}),
		}),
		reactions: {
			cache: createCollection([
				[
					"👍",
					{
						users: {
							remove: async () => {},
						},
					},
				],
			]),
			resolve: (emoji: string) => {
				if (emoji === "👍") {
					return {
						users: {
							fetch: async () =>
								createCollection([
									[REGULAR_USER.id, { id: REGULAR_USER.id, tag: REGULAR_USER.tag }],
								]),
							remove: async () => {},
						},
					};
				}
				return null;
			},
			removeAll: async () => {},
		},
	};
}

// ─── Thread Mock ────────────────────────────────────────────────────────────

function createMockThread(
	fixture: typeof THREAD_ACTIVE | typeof THREAD_ARCHIVED | typeof THREAD_PRIVATE,
	// biome-ignore lint/suspicious/noExplicitAny: mock factory
): any {
	const threadMessages = createCollection([[MESSAGE_SIMPLE.id, createMockMessage(MESSAGE_SIMPLE)]]);

	return {
		id: fixture.id,
		name: fixture.name,
		archived: fixture.archived,
		locked: fixture.locked,
		messageCount: fixture.messageCount,
		memberCount: fixture.memberCount,
		parentId: fixture.parentId,
		createdAt: fixture.createdAt,
		type: fixture.type,
		parent: { name: "dev-chat" },

		isThread: () => true,
		isTextBased: () => true,

		// guild stub gives tool handlers access to premiumTier for size-limit calculation
		guild: { premiumTier: 0 },

		send: async (
			content: string | { content?: string; embeds?: unknown[]; files?: unknown[] },
		) => ({
			id: `new-thread-msg-${Date.now()}`,
			content: typeof content === "string" ? content : (content.content ?? ""),
		}),
		messages: {
			fetch: async () => threadMessages,
		},
		edit: async (_opts: { archived?: boolean; locked?: boolean }) => {},
		members: {
			add: async (_userId: string) => {},
			remove: async (_userId: string) => {},
		},
	};
}

// ─── Webhook Mock ───────────────────────────────────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: mock factory
function createMockWebhook(fixture: typeof WEBHOOK_GITHUB | typeof WEBHOOK_MONITORING): any {
	return {
		id: fixture.id,
		name: fixture.name,
		url: fixture.url,
		owner: fixture.owner,
		channelId: fixture.channelId,
		delete: async () => {},
		send: async (
			content?: string | { content?: string; embeds?: unknown[]; files?: unknown[] },
		) => ({
			id: `new-webhook-msg-${Date.now()}`,
			content: typeof content === "string" ? content : (content?.content ?? ""),
		}),
		edit: async () => ({}),
	};
}

// ─── Emoji Mock ─────────────────────────────────────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: mock factory
function createMockEmoji(fixture: (typeof ALL_EMOJIS)[number]): any {
	return {
		id: fixture.id,
		name: fixture.name,
		animated: fixture.animated,
		guildId: fixture.guildId,
		delete: async () => {},
	};
}

// ─── Role Mock ──────────────────────────────────────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: mock factory
function createMockRole(fixture: (typeof ALL_ROLES)[number]): any {
	return {
		id: fixture.id,
		name: fixture.name,
		hexColor: fixture.hexColor,
		position: fixture.position,
		hoist: fixture.hoist,
		mentionable: fixture.mentionable,
		members: createCollection(Array.from(fixture.members.entries())),
		edit: async () => {},
		delete: async () => {},
	};
}

// ─── Member Mock ────────────────────────────────────────────────────────────

const ROLE_MAP = new Map(ALL_ROLES.map((r) => [r.id, r]));

// biome-ignore lint/suspicious/noExplicitAny: mock factory
function createMockMember(fixture: (typeof ALL_MEMBER_FIXTURES)[number]): any {
	const memberRoleEntries = fixture.roleIds
		.map((id) => {
			const role = ROLE_MAP.get(id);
			return role
				? ([id, { id: role.id, name: role.name, position: role.position }] as [
						string,
						{ id: string; name: string; position: number },
					])
				: null;
		})
		.filter((e): e is [string, { id: string; name: string; position: number }] => e !== null);

	return {
		id: fixture.id,
		user: {
			...fixture.user,
			displayAvatarURL: () =>
				`https://cdn.discordapp.com/avatars/${fixture.user.id}/mock-avatar.png`,
		},
		nickname: fixture.nickname,
		joinedAt: fixture.joinedAt,
		premiumSince: fixture.premiumSince,
		displayAvatarURL: () => `https://cdn.discordapp.com/avatars/${fixture.user.id}/mock-avatar.png`,
		roles: {
			cache: createCollection(memberRoleEntries),
			add: async () => {},
			remove: async () => {},
		},
		edit: async () => {},
		kick: async (_reason?: string) => {},
		timeout: async (_duration: number | null, _reason?: string) => {},
		kickable: true,
		moderatable: true,
	};
}

// ─── Guild Mock ─────────────────────────────────────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: mock factory
function createMockGuild(): any {
	const channelEntries = ALL_CHANNELS.map(
		(ch) => [ch.id, createMockChannel(ch)] as [string, ReturnType<typeof createMockChannel>],
	);
	const channelsCache = createCollection(channelEntries);

	const roleEntries = ALL_ROLES.map(
		(r) => [r.id, createMockRole(r)] as [string, ReturnType<typeof createMockRole>],
	);

	const memberEntries = ALL_MEMBER_FIXTURES.map(
		(m) => [m.id, createMockMember(m)] as [string, ReturnType<typeof createMockMember>],
	);
	const membersCache = createCollection(memberEntries);

	const emojiEntries = ALL_EMOJIS.map(
		(e) => [e.id, createMockEmoji(e)] as [string, ReturnType<typeof createMockEmoji>],
	);
	const emojisCache = createCollection(emojiEntries);

	const guild = {
		...GUILD_FIXTURE,
		channels: {
			cache: channelsCache,
			fetch: async (id: string) => channelsCache.get(id) ?? null,
			create: async (opts: { name: string; type: number; parent?: string; topic?: string }) => {
				const newChannel = {
					id: `new-channel-${Date.now()}`,
					name: opts.name,
					type: opts.type,
				};
				return newChannel;
			},
			fetchActiveThreads: async () => ({
				threads: createCollection([[THREAD_ACTIVE.id, createMockThread(THREAD_ACTIVE)]]),
			}),
		},
		roles: {
			cache: createCollection(roleEntries),
			create: async (opts: {
				name: string;
				color?: string;
				hoist?: boolean;
				mentionable?: boolean;
			}) => ({
				id: `new-role-${Date.now()}`,
				name: opts.name,
				hexColor: opts.color || "#000000",
			}),
		},
		members: {
			cache: membersCache,
			fetch: async (userId?: string) => {
				if (typeof userId === "string") {
					const member = membersCache.get(userId);
					if (!member) throw new Error(`Unknown User: ${userId}`);
					return member;
				}
				return membersCache;
			},
			list: async (opts?: { limit?: number }) => {
				const limit = opts?.limit ?? 100;
				const entries = Array.from(membersCache.entries()).slice(0, limit);
				return createCollection(entries);
			},
			editMe: async (_opts: Record<string, unknown>) => {},
		},
		invites: {
			fetch: async (options?: string | { channelId?: string }) => {
				const inviteEntries = ALL_INVITES.map(
					(inv) =>
						[
							inv.code,
							{
								code: inv.code,
								maxAge: inv.maxAge,
								maxUses: inv.maxUses,
								uses: inv.uses,
								temporary: inv.temporary,
								channel: { name: inv.channelName },
								inviter: { tag: inv.inviterTag },
								delete: async () => {},
							},
						] as [string, unknown],
				);

				if (typeof options === "string") {
					const code = options;
					const found = ALL_INVITES.find((inv) => inv.code === code);
					if (!found) throw new Error(`Unknown Invite: ${code}`);
					return {
						code: found.code,
						maxAge: found.maxAge,
						maxUses: found.maxUses,
						uses: found.uses,
						temporary: found.temporary,
						channel: { name: found.channelName },
						inviter: { tag: found.inviterTag },
						delete: async () => {},
					};
				}

				if (options && "channelId" in options && options.channelId) {
					const filtered = ALL_INVITES.filter((inv) => inv.channelId === options.channelId);
					return createCollection(
						filtered.map((inv) => [
							inv.code,
							{
								code: inv.code,
								maxAge: inv.maxAge,
								maxUses: inv.maxUses,
								uses: inv.uses,
								temporary: inv.temporary,
								channel: { name: inv.channelName },
								inviter: { tag: inv.inviterTag },
								delete: async () => {},
							},
						]),
					);
				}

				return createCollection(inviteEntries);
			},
		},
		bans: {
			create: async (_userId: string, _opts?: unknown) => {},
			remove: async (_userId: string, _reason?: string) => {},
			fetch: async (_opts?: unknown) =>
				createCollection([
					[BAN_FIXTURE.userId, { user: BAN_FIXTURE.user, reason: BAN_FIXTURE.reason }],
				]),
		},
		emojis: {
			cache: emojisCache,
			fetch: async (id?: string) => {
				if (typeof id === "string") {
					const emoji = emojisCache.get(id);
					if (!emoji) throw new Error("Unknown Emoji");
					return emoji;
				}
				return emojisCache;
			},
			create: async (opts: { attachment: string; name: string }) => ({
				id: `new-emoji-${Date.now()}`,
				name: opts.name,
				animated: false,
			}),
		},
		fetchAuditLogs: async (opts?: { limit?: number; type?: number; user?: string }) => {
			let entries = Array.from(ALL_AUDIT_LOG_ENTRIES);
			if (opts?.type !== undefined) {
				entries = entries.filter((e) => e.action === opts.type);
			}
			if (opts?.user) {
				entries = entries.filter((e) => e.executorId === opts.user);
			}
			const limited = entries.slice(0, opts?.limit ?? 20);
			return {
				entries: createCollection(
					limited.map((e) => [
						e.id,
						{
							action: e.action,
							executor: { tag: e.executorTag, id: e.executorId },
							target: { tag: e.targetTag, id: e.targetId },
							reason: e.reason,
							createdAt: e.createdAt,
						},
					]),
				),
			};
		},
		fetch: async () => guild,
		fetchOwner: async () => ({
			user: OWNER_FIXTURE,
		}),
	};

	return guild;
}

// ─── DM Channel Mock ────────────────────────────────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: mock factory
function createMockDmChannel(): any {
	const dmMessages = createCollection([
		[DM_MESSAGE_ONE.id, createMockMessage(DM_MESSAGE_ONE)],
		[DM_MESSAGE_TWO.id, createMockMessage(DM_MESSAGE_TWO)],
	]);

	return {
		send: async (content: string) => ({
			id: `new-dm-msg-${Date.now()}`,
			content,
		}),
		messages: {
			fetch: async (_opts?: { limit?: number }) => dmMessages,
		},
	};
}

// ─── Client Mock ────────────────────────────────────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: mock factory
export function createMockDiscordClient(): any {
	const guild = createMockGuild();

	// Flat map of all channels (guild channels + threads) for client.channels.fetch
	const allChannelEntries = ALL_CHANNELS.map(
		(ch) => [ch.id, createMockChannel(ch)] as [string, unknown],
	);
	// Add threads
	allChannelEntries.push(
		[THREAD_ACTIVE.id, createMockThread(THREAD_ACTIVE)],
		[THREAD_ARCHIVED.id, createMockThread(THREAD_ARCHIVED)],
		[THREAD_PRIVATE.id, createMockThread(THREAD_PRIVATE)],
	);

	const channelMap = new Map(allChannelEntries);

	const dmUserMap = new Map<
		string,
		{ createDM: () => Promise<ReturnType<typeof createMockDmChannel>> } & typeof DM_USER
	>([
		[
			DM_USER.id,
			{
				...DM_USER,
				createDM: async () => createMockDmChannel(),
			},
		],
	]);

	return {
		user: BOT_USER,
		guilds: {
			cache: createCollection([[GUILD_FIXTURE.id, guild]]),
		},
		channels: {
			fetch: async (id: string) => {
				const ch = channelMap.get(id);
				if (!ch) return null;
				return ch;
			},
		},
		users: {
			cache: {
				get: (id: string) => dmUserMap.get(id),
			},
			fetch: async (id: string) => {
				const user = dmUserMap.get(id);
				if (!user) throw new Error(`Unknown User: ${id}`);
				return user;
			},
		},
		fetchWebhook: async (id: string, _token?: string) => {
			if (id === WEBHOOK_GITHUB.id) return createMockWebhook(WEBHOOK_GITHUB);
			if (id === WEBHOOK_MONITORING.id) return createMockWebhook(WEBHOOK_MONITORING);
			// For send_webhook_message with token
			return {
				id,
				name: "Dynamic Webhook",
				send: async () => ({}),
				edit: async () => ({}),
				delete: async () => {},
			};
		},
	};
}
