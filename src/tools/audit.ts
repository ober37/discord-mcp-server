import { AuditLogEvent, type Client } from "discord.js";
import type { FastMCP } from "fastmcp";
import { UserError } from "fastmcp";
import { z } from "zod/v4";
import { resolveGuild, withDiscordErrorHandling } from "../utils.ts";

export function registerAuditTools(server: FastMCP, client: Client, defaultGuildId?: string): void {
	server.addTool({
		name: "get_audit_logs",
		description:
			"Fetch recent audit log entries for a guild, showing who did what and when. Requires VIEW_AUDIT_LOG permission.",
		parameters: z.object({
			limit: z
				.number()
				.int()
				.min(1)
				.max(100)
				.optional()
				.describe("Number of entries to return (1–100). Default: 20."),
			actionType: z
				.string()
				.optional()
				.describe(
					"Filter by action type name. Common values: MemberKick, MemberBanAdd, MemberBanRemove, MemberUpdate, MessageDelete, MessageBulkDelete, MessagePin, MessageUnpin, ChannelCreate, ChannelDelete, ChannelUpdate, RoleCreate, RoleDelete, InviteCreate, InviteDelete, WebhookCreate, ThreadCreate.",
				),
			userId: z
				.string()
				.optional()
				.describe("Filter by the ID of the user who performed the action (executor)."),
			guildId: z.string().optional().describe("Server ID. Falls back to DISCORD_GUILD_ID env var."),
		}),
		execute: async (args) => {
			return withDiscordErrorHandling(async () => {
				const guild = await resolveGuild(client, args.guildId, defaultGuildId);

				let actionTypeValue: AuditLogEvent | undefined;
				if (args.actionType !== undefined) {
					const parsed = (AuditLogEvent as Record<string, unknown>)[args.actionType];
					if (typeof parsed !== "number") {
						throw new UserError(
							`Unknown action type: "${args.actionType}". Common values: MemberKick, MemberBanAdd, MemberBanRemove, MessageDelete, ChannelCreate, ChannelDelete, RoleCreate, RoleDelete.`,
						);
					}
					actionTypeValue = parsed as AuditLogEvent;
				}

				const fetchOptions: {
					limit: number;
					type?: AuditLogEvent;
					user?: string;
				} = { limit: args.limit ?? 20 };

				if (actionTypeValue !== undefined) fetchOptions.type = actionTypeValue;
				if (args.userId) fetchOptions.user = args.userId;

				const auditLogs = await guild.fetchAuditLogs(fetchOptions);

				if (auditLogs.entries.size === 0) {
					return "No audit log entries found.";
				}

				const lines = auditLogs.entries.map((entry) => {
					const actionName = AuditLogEvent[entry.action] ?? String(entry.action);
					const executor = entry.executor?.tag ?? "Unknown";
					const target = resolveTargetName(entry.target);
					const reason = entry.reason ? ` | Reason: ${entry.reason}` : "";
					const timestamp = entry.createdAt.toISOString();
					return `• [${timestamp}] ${actionName} | Executor: ${executor} | Target: ${target}${reason}`;
				});

				return `**Audit log entries (${auditLogs.entries.size}):**\n${lines.join("\n")}`;
			});
		},
	});
}

function resolveTargetName(target: unknown): string {
	if (!target || typeof target !== "object") return "N/A";
	if ("tag" in target && typeof (target as { tag: unknown }).tag === "string") {
		return (target as { tag: string }).tag;
	}
	if ("name" in target && typeof (target as { name: unknown }).name === "string") {
		return (target as { name: string }).name;
	}
	return "N/A";
}
