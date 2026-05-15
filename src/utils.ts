import { type Client, DiscordAPIError, type Guild, type Message } from "discord.js";
import { UserError } from "fastmcp";

/**
 * Resolves a guild ID from parameter or falls back to the configured default.
 */
export function resolveGuildId(guildId?: string, defaultGuildId?: string): string {
	const id = guildId || defaultGuildId;
	if (!id) {
		throw new UserError(
			"No guild ID provided. Pass a guildId parameter or set DISCORD_GUILD_ID environment variable.",
		);
	}
	return id;
}

/**
 * Resolves a Guild object from the client cache.
 */
export async function resolveGuild(
	client: Client,
	guildId?: string,
	defaultGuildId?: string,
): Promise<Guild> {
	const id = resolveGuildId(guildId, defaultGuildId);
	const guild = client.guilds.cache.get(id);
	if (!guild) {
		throw new UserError(`Guild "${id}" not found. Make sure the bot is a member of this server.`);
	}
	return guild;
}

/**
 * Formats a Discord message for human-readable display.
 */
export function formatMessage(msg: Message): string {
	const timestamp = msg.createdAt.toISOString();
	const author = msg.author.tag;
	const content = msg.content || "(no text content)";
	const attachments =
		msg.attachments.size > 0
			? `\n  Attachments: ${msg.attachments.map((a) => a.url).join(", ")}`
			: "";
	const embeds = msg.embeds.length > 0 ? `\n  Embeds: ${msg.embeds.length}` : "";

	return `[${timestamp}] ${author} (ID: ${msg.id}): ${content}${attachments}${embeds}`;
}

/**
 * Known Discord API error codes mapped to user-friendly messages.
 */
const DISCORD_ERROR_MAP: Record<number, string> = {
	10003: "Unknown channel. The channel may have been deleted.",
	10004: "Unknown guild. The server may not exist or the bot isn't a member.",
	10008: "Unknown message. The message may have been deleted.",
	10011: "Unknown role. The role may have been deleted.",
	10013: "Unknown user.",
	50001: "Missing access. The bot doesn't have permission to access this resource.",
	50007: "Cannot send messages to this user (DMs may be disabled).",
	50013: "Missing permissions. The bot lacks the required permissions for this action.",
	50034: "You can only bulk delete messages that are under 14 days old.",
	50035: "Invalid form body.",
	30003: "Maximum number of pins reached for this channel (limit: 50).",
	30005: "Maximum number of roles reached for the server.",
};

/**
 * Wraps a Discord API call with standardized error handling.
 * Converts known Discord API errors to user-friendly UserErrors.
 */
export async function withDiscordErrorHandling<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (error) {
		if (error instanceof UserError) {
			throw error;
		}

		if (error instanceof DiscordAPIError) {
			const friendlyMessage = DISCORD_ERROR_MAP[error.code as number];
			if (friendlyMessage) {
				throw new UserError(`Discord API Error: ${friendlyMessage}`);
			}
			throw new UserError(`Discord API Error (${error.code}): ${error.message}`);
		}

		if (error instanceof Error) {
			// Log full details to stderr so server-side logs capture the stack trace
			console.error("[MCP unexpected error]", error);
			throw new UserError(`Unexpected error: ${error.message}`);
		}

		console.error("[MCP unknown error]", error);
		throw new UserError("An unknown error occurred.");
	}
}
