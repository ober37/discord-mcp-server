import {
	AutoModerationActionType,
	AutoModerationRuleEventType,
	AutoModerationRuleKeywordPresetType,
	AutoModerationRuleTriggerType,
	type Client,
} from "discord.js";
import type { FastMCP } from "fastmcp";
import { z } from "zod/v4";
import { resolveGuild, withDiscordErrorHandling } from "../utils.ts";

const TRIGGER_TYPE_MAP = {
	keyword: AutoModerationRuleTriggerType.Keyword,
	spam: AutoModerationRuleTriggerType.Spam,
	keyword_preset: AutoModerationRuleTriggerType.KeywordPreset,
	mention_spam: AutoModerationRuleTriggerType.MentionSpam,
	member_profile: AutoModerationRuleTriggerType.MemberProfile,
} as const;

const ACTION_TYPE_MAP = {
	block_message: AutoModerationActionType.BlockMessage,
	send_alert_message: AutoModerationActionType.SendAlertMessage,
	timeout: AutoModerationActionType.Timeout,
	block_member_interaction: AutoModerationActionType.BlockMemberInteraction,
} as const;

const PRESET_MAP = {
	profanity: AutoModerationRuleKeywordPresetType.Profanity,
	sexual_content: AutoModerationRuleKeywordPresetType.SexualContent,
	slurs: AutoModerationRuleKeywordPresetType.Slurs,
} as const;

const EVENT_TYPE_MAP = {
	message_send: AutoModerationRuleEventType.MessageSend,
	member_update: AutoModerationRuleEventType.MemberUpdate,
} as const;

const TRIGGER_TYPE_LABEL: Record<number, string> = {
	[AutoModerationRuleTriggerType.Keyword]: "keyword",
	[AutoModerationRuleTriggerType.Spam]: "spam",
	[AutoModerationRuleTriggerType.KeywordPreset]: "keyword_preset",
	[AutoModerationRuleTriggerType.MentionSpam]: "mention_spam",
	[AutoModerationRuleTriggerType.MemberProfile]: "member_profile",
};

const ACTION_TYPE_LABEL: Record<number, string> = {
	[AutoModerationActionType.BlockMessage]: "block_message",
	[AutoModerationActionType.SendAlertMessage]: "send_alert_message",
	[AutoModerationActionType.Timeout]: "timeout",
	[AutoModerationActionType.BlockMemberInteraction]: "block_member_interaction",
};

const PRESET_LABEL: Record<number, string> = {
	[AutoModerationRuleKeywordPresetType.Profanity]: "profanity",
	[AutoModerationRuleKeywordPresetType.SexualContent]: "sexual_content",
	[AutoModerationRuleKeywordPresetType.Slurs]: "slurs",
};

const actionSchema = z.object({
	type: z
		.enum(["block_message", "send_alert_message", "timeout", "block_member_interaction"])
		.describe(
			"'block_message': prevent the message from posting (optional: customMessage). " +
				"'send_alert_message': log content to a channel (requires alertChannelId). " +
				"'timeout': mute the user for a duration (requires timeoutSeconds; only valid with keyword trigger; bot needs MODERATE_MEMBERS). " +
				"'block_member_interaction': block all text/voice/interactions.",
		),
	alertChannelId: z
		.string()
		.optional()
		.describe("Channel ID to log flagged content. Required for send_alert_message."),
	timeoutSeconds: z
		.number()
		.int()
		.min(1)
		.max(2419200)
		.optional()
		.describe(
			"Timeout duration in seconds (max 2419200 = 4 weeks). Required for timeout action. Only valid with keyword trigger.",
		),
	customMessage: z
		.string()
		.optional()
		.describe(
			"Message shown to user when their message is blocked (max 150 chars). Used with block_message.",
		),
});

function buildTriggerMetadata(args: {
	keywords?: string[];
	regexPatterns?: string[];
	presets?: Array<"profanity" | "sexual_content" | "slurs">;
	allowList?: string[];
	mentionTotalLimit?: number;
	mentionRaidProtection?: boolean;
}) {
	const hasMeta =
		args.keywords !== undefined ||
		args.regexPatterns !== undefined ||
		args.presets !== undefined ||
		args.allowList !== undefined ||
		args.mentionTotalLimit !== undefined ||
		args.mentionRaidProtection !== undefined;

	if (!hasMeta) return undefined;

	return {
		keywordFilter: args.keywords,
		regexPatterns: args.regexPatterns,
		presets: args.presets?.map((p) => PRESET_MAP[p]),
		allowList: args.allowList,
		mentionTotalLimit: args.mentionTotalLimit,
		mentionRaidProtectionEnabled: args.mentionRaidProtection,
	};
}

function buildActions(
	actions: Array<{
		type: "block_message" | "send_alert_message" | "timeout" | "block_member_interaction";
		alertChannelId?: string;
		timeoutSeconds?: number;
		customMessage?: string;
	}>,
) {
	return actions.map((action) => ({
		type: ACTION_TYPE_MAP[action.type],
		metadata:
			action.alertChannelId !== undefined ||
			action.timeoutSeconds !== undefined ||
			action.customMessage !== undefined
				? {
						channel: action.alertChannelId,
						durationSeconds: action.timeoutSeconds,
						customMessage: action.customMessage,
					}
				: undefined,
	}));
}

// biome-ignore lint/suspicious/noExplicitAny: AutoModerationRule shape varies across discord.js versions
function formatRule(rule: any): string {
	const trigger = TRIGGER_TYPE_LABEL[rule.triggerType] ?? String(rule.triggerType);
	const enabled = rule.enabled ? "enabled" : "disabled";
	const actionLabels = rule.actions
		.map((a: { type: number }) => ACTION_TYPE_LABEL[a.type] ?? String(a.type))
		.join(", ");

	const meta: string[] = [];
	if (rule.triggerMetadata?.keywordFilter?.length) {
		meta.push(`keywords: ${rule.triggerMetadata.keywordFilter.length}`);
	}
	if (rule.triggerMetadata?.regexPatterns?.length) {
		meta.push(`regex: ${rule.triggerMetadata.regexPatterns.length}`);
	}
	if (rule.triggerMetadata?.presets?.length) {
		meta.push(
			`presets: ${rule.triggerMetadata.presets.map((p: number) => PRESET_LABEL[p] ?? p).join(", ")}`,
		);
	}
	if (
		rule.triggerMetadata?.mentionTotalLimit !== null &&
		rule.triggerMetadata?.mentionTotalLimit !== undefined
	) {
		meta.push(`mention limit: ${rule.triggerMetadata.mentionTotalLimit}`);
	}
	if (rule.triggerMetadata?.allowList?.length) {
		meta.push(`allow list: ${rule.triggerMetadata.allowList.length}`);
	}

	const metaStr = meta.length > 0 ? ` | ${meta.join(" | ")}` : "";
	return `• [${rule.id}] ${rule.name} — trigger: ${trigger} | actions: ${actionLabels} | ${enabled}${metaStr}`;
}

export function registerAutomodTools(
	server: FastMCP,
	client: Client,
	defaultGuildId?: string,
): void {
	server.addTool({
		name: "list_automod_rules",
		description:
			"List all auto-moderation rules in a guild, including trigger type, actions, and enabled state. Requires MANAGE_GUILD permission.",
		parameters: z.object({
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				const rules = await guild.autoModerationRules.fetch();
				if (rules.size === 0) {
					return "No auto-moderation rules found.";
				}
				const lines = rules.map((rule) => formatRule(rule));
				return `**Auto-moderation rules (${rules.size}):**\n${lines.join("\n")}`;
			});
		},
	});

	server.addTool({
		name: "create_automod_rule",
		description:
			"Create an auto-moderation rule in a guild. Requires MANAGE_GUILD permission. " +
			"Trigger type limits: 'keyword' max 6 per guild; all others max 1 per guild. " +
			"'spam' requires no metadata. " +
			"'keyword' and 'member_profile' use keywords/regexPatterns/allowList. " +
			"'keyword_preset' uses presets/allowList. " +
			"'mention_spam' uses mentionTotalLimit/mentionRaidProtection. " +
			"The 'timeout' action is only valid with the 'keyword' trigger and requires MODERATE_MEMBERS.",
		parameters: z.object({
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
			name: z.string().describe("Rule name (1–100 characters)."),
			triggerType: z
				.enum(["keyword", "spam", "keyword_preset", "mention_spam", "member_profile"])
				.describe(
					"What triggers this rule. " +
						"'keyword': user-defined word list (max 6 per guild). " +
						"'spam': auto-detect spam (max 1 per guild, no metadata needed). " +
						"'keyword_preset': built-in profanity/sexual_content/slurs word sets (max 1 per guild). " +
						"'mention_spam': excessive @mentions (max 1 per guild). " +
						"'member_profile': keyword matching on member profile fields (max 1 per guild).",
				),
			eventType: z
				.enum(["message_send", "member_update"])
				.optional()
				.describe(
					"When to evaluate the rule. 'message_send' (default): on message create/edit. " +
						"'member_update': on profile edits — only valid with 'keyword' or 'member_profile' triggers.",
				),
			keywords: z
				.array(z.string())
				.optional()
				.describe(
					"Words/phrases to match (max 1000, 60 chars each). Supports wildcards (* prefix/suffix/infix). " +
						"Used with: keyword, member_profile.",
				),
			regexPatterns: z
				.array(z.string())
				.optional()
				.describe(
					"Rust-flavored regex patterns to match (max 10, 260 chars each). Used with: keyword, member_profile.",
				),
			presets: z
				.array(z.enum(["profanity", "sexual_content", "slurs"]))
				.optional()
				.describe("Discord's built-in word sets to block. Used with: keyword_preset."),
			allowList: z
				.array(z.string())
				.optional()
				.describe(
					"Phrases exempt from triggering the rule (max 1000). Used with: keyword, keyword_preset, member_profile.",
				),
			mentionTotalLimit: z
				.number()
				.int()
				.min(0)
				.max(50)
				.optional()
				.describe(
					"Max unique role + user mentions allowed per message (0–50). Used with: mention_spam.",
				),
			mentionRaidProtection: z
				.boolean()
				.optional()
				.describe("Automatically detect mention raids. Used with: mention_spam."),
			actions: z
				.array(actionSchema)
				.describe("One or more actions to execute when the rule triggers."),
			exemptRoleIds: z
				.array(z.string())
				.optional()
				.describe("Role IDs exempt from this rule (max 20)."),
			exemptChannelIds: z
				.array(z.string())
				.optional()
				.describe("Channel IDs exempt from this rule (max 50)."),
			enabled: z
				.boolean()
				.optional()
				.describe("Whether the rule is active immediately. Defaults to true."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				const rule = await guild.autoModerationRules.create({
					name: args.name,
					eventType: args.eventType
						? EVENT_TYPE_MAP[args.eventType]
						: AutoModerationRuleEventType.MessageSend,
					triggerType: TRIGGER_TYPE_MAP[args.triggerType],
					triggerMetadata: buildTriggerMetadata(args),
					actions: buildActions(args.actions),
					enabled: args.enabled,
					exemptRoles: args.exemptRoleIds,
					exemptChannels: args.exemptChannelIds,
				});
				return `✅ Auto-moderation rule "${rule.name}" created (ID: ${rule.id}).`;
			});
		},
	});

	server.addTool({
		name: "edit_automod_rule",
		description:
			"Update an existing auto-moderation rule. Requires MANAGE_GUILD permission. " +
			"Only provided fields are changed — omitted fields remain unchanged. " +
			"Trigger type cannot be changed after creation; delete and recreate the rule to change it.",
		parameters: z.object({
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
			ruleId: z.string().describe("ID of the auto-moderation rule to edit."),
			name: z.string().optional().describe("New rule name (1–100 characters)."),
			eventType: z
				.enum(["message_send", "member_update"])
				.optional()
				.describe(
					"When to evaluate the rule. 'message_send': on message create/edit. " +
						"'member_update': on profile edits — only valid with 'keyword' or 'member_profile' triggers.",
				),
			keywords: z
				.array(z.string())
				.optional()
				.describe("Replaces the full keyword list. Used with: keyword, member_profile."),
			regexPatterns: z
				.array(z.string())
				.optional()
				.describe("Replaces the full regex pattern list. Used with: keyword, member_profile."),
			presets: z
				.array(z.enum(["profanity", "sexual_content", "slurs"]))
				.optional()
				.describe("Replaces the preset list. Used with: keyword_preset."),
			allowList: z
				.array(z.string())
				.optional()
				.describe("Replaces the allow list. Used with: keyword, keyword_preset, member_profile."),
			mentionTotalLimit: z
				.number()
				.int()
				.min(0)
				.max(50)
				.optional()
				.describe("New max mentions per message. Used with: mention_spam."),
			mentionRaidProtection: z
				.boolean()
				.optional()
				.describe("Update mention raid protection toggle. Used with: mention_spam."),
			actions: z.array(actionSchema).optional().describe("Replaces the full actions list."),
			exemptRoleIds: z
				.array(z.string())
				.optional()
				.describe("Replaces the exempt role list (max 20)."),
			exemptChannelIds: z
				.array(z.string())
				.optional()
				.describe("Replaces the exempt channel list (max 50)."),
			enabled: z.boolean().optional().describe("Enable or disable the rule."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				const triggerMeta = buildTriggerMetadata(args);

				const hasChanges =
					args.name !== undefined ||
					args.eventType !== undefined ||
					triggerMeta !== undefined ||
					args.actions !== undefined ||
					args.enabled !== undefined ||
					args.exemptRoleIds !== undefined ||
					args.exemptChannelIds !== undefined;

				if (!hasChanges) {
					return "No changes specified.";
				}

				const rule = await guild.autoModerationRules.edit(args.ruleId, {
					name: args.name,
					eventType: args.eventType ? EVENT_TYPE_MAP[args.eventType] : undefined,
					triggerMetadata: triggerMeta,
					actions: args.actions ? buildActions(args.actions) : undefined,
					enabled: args.enabled,
					exemptRoles: args.exemptRoleIds,
					exemptChannels: args.exemptChannelIds,
				});
				return `✅ Auto-moderation rule "${rule.name}" (ID: ${rule.id}) updated.`;
			});
		},
	});

	server.addTool({
		name: "delete_automod_rule",
		description: "Delete an auto-moderation rule from a guild. Requires MANAGE_GUILD permission.",
		parameters: z.object({
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
			ruleId: z.string().describe("ID of the auto-moderation rule to delete."),
			reason: z.string().optional().describe("Audit log reason for deleting the rule."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);
				await guild.autoModerationRules.delete(args.ruleId, args.reason);
				return `✅ Auto-moderation rule "${args.ruleId}" deleted.`;
			});
		},
	});
}
