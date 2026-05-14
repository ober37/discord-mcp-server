import { Client, GatewayIntentBits } from "discord.js";

/**
 * Creates and connects a Discord.js client with the required intents.
 * Returns a promise that resolves when the client is ready.
 */
export async function createDiscordClient(token: string): Promise<Client> {
	const client = new Client({
		intents: [
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.GuildMembers,
			GatewayIntentBits.MessageContent,
			GatewayIntentBits.GuildWebhooks,
			GatewayIntentBits.GuildPresences,
			GatewayIntentBits.GuildInvites,
			GatewayIntentBits.GuildBans,
		],
	});

	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject(new Error("Discord client failed to connect within 30 seconds"));
		}, 30_000);

		client.once("clientReady", () => {
			clearTimeout(timeout);
			console.error(`✅ Discord bot connected as ${client.user?.tag}`);
			resolve(client);
		});

		client.once("error", (error) => {
			clearTimeout(timeout);
			reject(error);
		});

		client.login(token).catch((error) => {
			clearTimeout(timeout);
			reject(error);
		});
	});
}
