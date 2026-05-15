/**
 * Realistic Discord API fixtures modeled after actual Discord response shapes.
 * Uses real snowflake ID formats and ISO timestamps.
 */

import { createCollection } from "./discord-mock";

// ─── Guild ──────────────────────────────────────────────────────────────────

export const GUILD_FIXTURE = {
	id: "1234567890123456789",
	name: "Test Server",
	ownerId: "9876543210987654321",
	memberCount: 42,
	premiumTier: 2,
	premiumSubscriptionCount: 7,
	description: "A test Discord server",
	vanityURLCode: null,
	createdAt: new Date("2024-01-15T10:00:00.000Z"),
} as const;

export const OWNER_FIXTURE = {
	id: "9876543210987654321",
	tag: "TestOwner#0001",
	username: "TestOwner",
	discriminator: "0001",
} as const;

// ─── Channels ───────────────────────────────────────────────────────────────

export const CATEGORY_GENERAL = {
	id: "1100000000000000001",
	name: "General",
	type: 4, // GuildCategory
	position: 0,
	parentId: null,
	guildId: GUILD_FIXTURE.id,
} as const;

export const CATEGORY_DEV = {
	id: "1100000000000000002",
	name: "Development",
	type: 4, // GuildCategory
	position: 1,
	parentId: null,
	guildId: GUILD_FIXTURE.id,
} as const;

export const CHANNEL_GENERAL = {
	id: "1200000000000000001",
	name: "general",
	type: 0, // GuildText
	position: 0,
	parentId: CATEGORY_GENERAL.id,
	guildId: GUILD_FIXTURE.id,
	topic: "General discussion",
} as const;

export const CHANNEL_ANNOUNCEMENTS = {
	id: "1200000000000000002",
	name: "announcements",
	type: 5, // GuildAnnouncement
	position: 1,
	parentId: CATEGORY_GENERAL.id,
	guildId: GUILD_FIXTURE.id,
	topic: "Important announcements",
} as const;

export const CHANNEL_VOICE = {
	id: "1200000000000000003",
	name: "Voice Chat",
	type: 2, // GuildVoice
	position: 0,
	parentId: CATEGORY_DEV.id,
	guildId: GUILD_FIXTURE.id,
} as const;

export const CHANNEL_DEV_CHAT = {
	id: "1200000000000000004",
	name: "dev-chat",
	type: 0, // GuildText
	position: 1,
	parentId: CATEGORY_DEV.id,
	guildId: GUILD_FIXTURE.id,
	topic: "Development discussion",
} as const;

export const CHANNEL_UNCATEGORIZED = {
	id: "1200000000000000005",
	name: "welcome",
	type: 0, // GuildText
	position: 0,
	parentId: null,
	guildId: GUILD_FIXTURE.id,
	topic: "Welcome channel",
} as const;

export const CHANNEL_FORUM = {
	id: "1200000000000000006",
	name: "help-forum",
	type: 15, // GuildForum
	position: 2,
	parentId: CATEGORY_DEV.id,
	guildId: GUILD_FIXTURE.id,
} as const;

export const ALL_CHANNELS = [
	CATEGORY_GENERAL,
	CATEGORY_DEV,
	CHANNEL_GENERAL,
	CHANNEL_ANNOUNCEMENTS,
	CHANNEL_VOICE,
	CHANNEL_DEV_CHAT,
	CHANNEL_UNCATEGORIZED,
	CHANNEL_FORUM,
] as const;

// ─── Messages ───────────────────────────────────────────────────────────────

export const BOT_USER = {
	id: "5500000000000000001",
	tag: "TestBot#0000",
	username: "TestBot",
	discriminator: "0000",
	bot: true,
} as const;

export const REGULAR_USER = {
	id: "5500000000000000002",
	tag: "RegularUser#1234",
	username: "RegularUser",
	discriminator: "1234",
	bot: false,
} as const;

export const MESSAGE_SIMPLE = {
	id: "6600000000000000001",
	content: "Hello, world!",
	author: REGULAR_USER,
	createdAt: new Date("2024-06-15T14:30:00.000Z"),
	createdTimestamp: new Date("2024-06-15T14:30:00.000Z").getTime(),
	attachments: createCollection<{ url: string }>(),
	embeds: [],
	channelId: CHANNEL_GENERAL.id,
};

export const MESSAGE_WITH_ATTACHMENTS = {
	id: "6600000000000000002",
	content: "Check this out!",
	author: REGULAR_USER,
	createdAt: new Date("2024-06-15T14:31:00.000Z"),
	createdTimestamp: new Date("2024-06-15T14:31:00.000Z").getTime(),
	attachments: createCollection([
		["att1", { url: "https://cdn.discordapp.com/attachments/123/456/image.png" }],
	]),
	embeds: [{ title: "Embed Title" }],
	channelId: CHANNEL_GENERAL.id,
};

export const MESSAGE_FROM_BOT = {
	id: "6600000000000000003",
	content: "I am a bot message",
	author: BOT_USER,
	createdAt: new Date("2024-06-15T14:32:00.000Z"),
	createdTimestamp: new Date("2024-06-15T14:32:00.000Z").getTime(),
	attachments: createCollection<{ url: string }>(),
	embeds: [],
	channelId: CHANNEL_GENERAL.id,
};

// ─── Roles ──────────────────────────────────────────────────────────────────

export const ROLE_EVERYONE = {
	id: GUILD_FIXTURE.id, // @everyone role ID === guild ID
	name: "@everyone",
	hexColor: "#000000",
	position: 0,
	hoist: false,
	mentionable: false,
	members: new Map(),
} as const;

export const ROLE_ADMIN = {
	id: "7700000000000000001",
	name: "Admin",
	hexColor: "#FF5733",
	position: 3,
	hoist: true,
	mentionable: false,
	members: new Map([["user1", { id: "user1" }]]),
} as const;

export const ROLE_MODERATOR = {
	id: "7700000000000000002",
	name: "Moderator",
	hexColor: "#33FF57",
	position: 2,
	hoist: true,
	mentionable: true,
	members: new Map([
		["user1", { id: "user1" }],
		["user2", { id: "user2" }],
	]),
} as const;

export const ROLE_MEMBER = {
	id: "7700000000000000003",
	name: "Member",
	hexColor: "#000000",
	position: 1,
	hoist: false,
	mentionable: false,
	members: new Map([
		["user1", { id: "user1" }],
		["user2", { id: "user2" }],
		["user3", { id: "user3" }],
	]),
} as const;

export const ALL_ROLES = [ROLE_EVERYONE, ROLE_ADMIN, ROLE_MODERATOR, ROLE_MEMBER] as const;

// ─── Threads ────────────────────────────────────────────────────────────────

export const THREAD_ACTIVE = {
	id: "8800000000000000001",
	name: "Help with TypeScript",
	archived: false,
	locked: false,
	messageCount: 15,
	memberCount: 3,
	parentId: CHANNEL_DEV_CHAT.id,
	createdAt: new Date("2024-06-10T09:00:00.000Z"),
	type: 11, // PublicThread
} as const;

export const THREAD_ARCHIVED = {
	id: "8800000000000000002",
	name: "Old Discussion",
	archived: true,
	locked: false,
	messageCount: 42,
	memberCount: 7,
	parentId: CHANNEL_DEV_CHAT.id,
	createdAt: new Date("2024-05-01T12:00:00.000Z"),
	type: 11, // PublicThread
} as const;

export const THREAD_PRIVATE = {
	id: "8800000000000000003",
	name: "Private Discussion",
	archived: false,
	locked: false,
	messageCount: 5,
	memberCount: 2,
	parentId: CHANNEL_DEV_CHAT.id,
	createdAt: new Date("2024-07-01T10:00:00.000Z"),
	type: 12, // PrivateThread
} as const;

// ─── Webhooks ───────────────────────────────────────────────────────────────

export const WEBHOOK_GITHUB = {
	id: "9900000000000000001",
	name: "GitHub Notifications",
	url: "https://discord.com/api/webhooks/9900000000000000001/abc123token",
	owner: { tag: "TestOwner#0001" },
	channelId: CHANNEL_DEV_CHAT.id,
} as const;

export const WEBHOOK_MONITORING = {
	id: "9900000000000000002",
	name: "Monitoring Alerts",
	url: "https://discord.com/api/webhooks/9900000000000000002/def456token",
	owner: { tag: "TestBot#0000" },
	channelId: CHANNEL_GENERAL.id,
} as const;

// ─── Members ────────────────────────────────────────────────────────────────

export const ANOTHER_USER = {
	id: "5500000000000000003",
	tag: "AnotherUser#5678",
	username: "AnotherUser",
	discriminator: "5678",
	bot: false,
} as const;

export const MEMBER_ONE_FIXTURE = {
	id: REGULAR_USER.id,
	user: REGULAR_USER,
	nickname: "RegularNick" as string | null,
	joinedAt: new Date("2024-02-01T00:00:00.000Z"),
	premiumSince: null as Date | null,
	// Every Discord member has @everyone; include it so the exclusion filter is exercised
	roleIds: [ROLE_EVERYONE.id, ROLE_MEMBER.id],
};

export const MEMBER_TWO_FIXTURE = {
	id: ANOTHER_USER.id,
	user: ANOTHER_USER,
	nickname: null as string | null,
	joinedAt: new Date("2024-03-15T00:00:00.000Z"),
	premiumSince: new Date("2024-04-01T00:00:00.000Z") as Date | null,
	roleIds: [ROLE_EVERYONE.id, ROLE_ADMIN.id, ROLE_MEMBER.id],
};

export const BOT_MEMBER_FIXTURE = {
	id: BOT_USER.id,
	user: BOT_USER,
	nickname: null as string | null,
	joinedAt: new Date("2024-01-01T00:00:00.000Z"),
	premiumSince: null as Date | null,
	roleIds: [ROLE_EVERYONE.id],
};

export const ALL_MEMBER_FIXTURES = [MEMBER_ONE_FIXTURE, MEMBER_TWO_FIXTURE, BOT_MEMBER_FIXTURE];

// ─── Invites ─────────────────────────────────────────────────────────────────

export const INVITE_GENERAL = {
	code: "abc123",
	maxAge: 86400,
	maxUses: 10,
	uses: 3,
	temporary: false,
	channelId: CHANNEL_GENERAL.id,
	channelName: CHANNEL_GENERAL.name,
	inviterTag: REGULAR_USER.tag,
} as const;

export const INVITE_NO_EXPIRY = {
	code: "xyz789",
	maxAge: 0,
	maxUses: 0,
	uses: 7,
	temporary: false,
	channelId: CHANNEL_DEV_CHAT.id,
	channelName: CHANNEL_DEV_CHAT.name,
	inviterTag: BOT_USER.tag,
} as const;

export const ALL_INVITES = [INVITE_GENERAL, INVITE_NO_EXPIRY] as const;

// ─── Bans ────────────────────────────────────────────────────────────────────

export const BANNED_USER = {
	id: "5500000000000000099",
	tag: "BannedUser#9999",
	username: "BannedUser",
	discriminator: "9999",
	bot: false,
} as const;

export const BAN_FIXTURE = {
	userId: BANNED_USER.id,
	user: BANNED_USER,
	reason: "Spamming",
} as const;

// ─── Emojis ──────────────────────────────────────────────────────────────────

export const EMOJI_WAVE = {
	id: "9980000000000000001",
	name: "wave",
	animated: false,
	guildId: GUILD_FIXTURE.id,
} as const;

export const EMOJI_DANCE = {
	id: "9980000000000000002",
	name: "dance",
	animated: true,
	guildId: GUILD_FIXTURE.id,
} as const;

export const ALL_EMOJIS = [EMOJI_WAVE, EMOJI_DANCE] as const;

// ─── DM Users ─────────────────────────────────────────────────────────────────

export const DM_USER = {
	id: "5500000000000001000",
	tag: "DMUser#4321",
	username: "DMUser",
	discriminator: "4321",
	bot: false,
} as const;

export const DM_CHANNEL_ID = "dm-channel-5500000000001000000";

export const DM_MESSAGE_ONE = {
	id: "6600000000001000001",
	content: "Hey, can you help me?",
	author: DM_USER,
	createdAt: new Date("2024-07-01T10:00:00.000Z"),
	createdTimestamp: new Date("2024-07-01T10:00:00.000Z").getTime(),
	attachments: createCollection<{ url: string }>(),
	embeds: [],
	channelId: DM_CHANNEL_ID,
};

export const DM_MESSAGE_TWO = {
	id: "6600000000001000002",
	content: "Sure, what do you need?",
	author: BOT_USER,
	createdAt: new Date("2024-07-01T10:01:00.000Z"),
	createdTimestamp: new Date("2024-07-01T10:01:00.000Z").getTime(),
	attachments: createCollection<{ url: string }>(),
	embeds: [],
	channelId: DM_CHANNEL_ID,
};

// ─── Audit Logs ────────────────────────────────────────────────────────────────

export const AUDIT_LOG_ENTRY_KICK = {
	id: "audit-log-000000001",
	action: 20, // AuditLogEvent.MemberKick
	actionName: "MemberKick",
	executorTag: REGULAR_USER.tag,
	executorId: REGULAR_USER.id,
	targetTag: ANOTHER_USER.tag,
	targetId: ANOTHER_USER.id,
	reason: "Spam",
	createdAt: new Date("2024-06-15T15:00:00.000Z"),
} as const;

export const AUDIT_LOG_ENTRY_BAN = {
	id: "audit-log-000000002",
	action: 22, // AuditLogEvent.MemberBanAdd
	actionName: "MemberBanAdd",
	executorTag: BOT_USER.tag,
	executorId: BOT_USER.id,
	targetTag: BANNED_USER.tag,
	targetId: BANNED_USER.id,
	reason: "Spamming",
	createdAt: new Date("2024-06-16T10:00:00.000Z"),
} as const;

export const ALL_AUDIT_LOG_ENTRIES = [AUDIT_LOG_ENTRY_KICK, AUDIT_LOG_ENTRY_BAN] as const;

// ─── Scheduled Events ──────────────────────────────────────────────────────────

export const EVENT_EXTERNAL = {
	id: "event-0000000000000001",
	name: "Community Meetup",
	description: "Monthly community gathering",
	// GuildScheduledEventEntityType.External = 3
	entityType: 3,
	// GuildScheduledEventStatus.Scheduled = 1
	status: 1,
	scheduledStartAt: new Date("2026-06-01T18:00:00.000Z"),
	scheduledEndAt: new Date("2026-06-01T20:00:00.000Z"),
	entityMetadata: { location: "Central Park, NYC" },
	channel: null,
	userCount: 12,
} as const;

export const EVENT_VOICE = {
	id: "event-0000000000000002",
	name: "Game Night",
	description: null,
	// GuildScheduledEventEntityType.Voice = 2
	entityType: 2,
	// GuildScheduledEventStatus.Active = 2
	status: 2,
	scheduledStartAt: new Date("2026-06-15T20:00:00.000Z"),
	scheduledEndAt: null,
	entityMetadata: null,
	channel: { name: "Voice Chat" },
	userCount: 5,
} as const;

export const ALL_EVENTS = [EVENT_EXTERNAL, EVENT_VOICE] as const;

// ─── Application Commands ──────────────────────────────────────────────────────

export const COMMAND_PING = {
	id: "cmd-0000000000000001",
	name: "ping",
	description: "Reply with pong",
} as const;

export const COMMAND_INFO = {
	id: "cmd-0000000000000002",
	name: "info",
	description: "Get server info",
} as const;

export const ALL_COMMANDS = [COMMAND_PING, COMMAND_INFO] as const;
