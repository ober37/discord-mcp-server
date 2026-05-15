import { beforeEach, describe, expect, it, mock } from "bun:test";
import { UserError } from "fastmcp";
import { registerEmojiTools } from "../../tools/emojis";
import { createMockDiscordClient } from "../helpers/discord-mock";
import { EMOJI_DANCE, EMOJI_WAVE, GUILD_FIXTURE } from "../helpers/fixtures";
import { createTestServer } from "../helpers/test-server";

describe("emoji tools", () => {
	let client: ReturnType<typeof createMockDiscordClient>;
	let callTool: ReturnType<typeof createTestServer>["callTool"];

	beforeEach(() => {
		client = createMockDiscordClient();
		const harness = createTestServer();
		registerEmojiTools(harness.server, client, GUILD_FIXTURE.id);
		callTool = harness.callTool;
	});

	describe("list_emojis", () => {
		it("returns all custom emojis with names and IDs", async () => {
			const result = await callTool("list_emojis", { guildId: GUILD_FIXTURE.id });
			expect(result).toContain(EMOJI_WAVE.name);
			expect(result).toContain(EMOJI_WAVE.id);
			expect(result).toContain(EMOJI_DANCE.name);
			expect(result).toContain(EMOJI_DANCE.id);
		});

		it("marks animated emojis with [animated]", async () => {
			const result = await callTool("list_emojis", { guildId: GUILD_FIXTURE.id });
			expect(result).toContain("[animated]");
		});

		it("does not mark static emojis as animated", async () => {
			const result = await callTool("list_emojis", { guildId: GUILD_FIXTURE.id });
			// wave is static — its line should not contain [animated]
			const lines = result.split("\n");
			const waveLine = lines.find((l) => l.includes(EMOJI_WAVE.name));
			expect(waveLine).toBeDefined();
			expect(waveLine).not.toContain("[animated]");
		});

		it("returns empty message when no emojis exist", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			guild.emojis.fetch = mock(async () => ({ size: 0, map: () => [] }));
			const result = await callTool("list_emojis", { guildId: GUILD_FIXTURE.id });
			expect(result).toContain("No custom emojis");
		});
	});

	describe("create_emoji", () => {
		it("creates an emoji and returns success with name and ID", async () => {
			const result = await callTool("create_emoji", {
				guildId: GUILD_FIXTURE.id,
				name: "testwave",
				imageUrl: "https://example.com/emoji.png",
			});
			expect(result).toContain("✅");
			expect(result).toContain("Created emoji");
			expect(result).toContain("testwave");
		});

		it("calls guild.emojis.create with correct attachment and name", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const createSpy = mock(async () => ({
				id: "new-emoji-1",
				name: "spyemoji",
				animated: false,
			}));
			guild.emojis.create = createSpy;

			await callTool("create_emoji", {
				guildId: GUILD_FIXTURE.id,
				name: "spyemoji",
				imageUrl: "https://example.com/spy.png",
			});

			expect(createSpy).toHaveBeenCalledTimes(1);
			expect(createSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					attachment: "https://example.com/spy.png",
					name: "spyemoji",
				}),
			);
		});

		it("rejects invalid imageUrl (not a URL)", async () => {
			await expect(
				callTool("create_emoji", {
					guildId: GUILD_FIXTURE.id,
					name: "testwave",
					imageUrl: "not-a-url",
				}),
			).rejects.toThrow();
		});
	});

	describe("delete_emoji", () => {
		it("deletes an emoji and returns success with name and ID", async () => {
			const result = await callTool("delete_emoji", {
				guildId: GUILD_FIXTURE.id,
				emojiId: EMOJI_WAVE.id,
			});
			expect(result).toContain("✅");
			expect(result).toContain("Deleted emoji");
			expect(result).toContain(EMOJI_WAVE.name);
			expect(result).toContain(EMOJI_WAVE.id);
		});

		it("calls emoji.delete() exactly once", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const deleteSpy = mock(async () => {});
			const originalFetch = guild.emojis.fetch;
			guild.emojis.fetch = mock(async (id: string) => {
				if (id === EMOJI_WAVE.id) {
					return { id: EMOJI_WAVE.id, name: EMOJI_WAVE.name, delete: deleteSpy };
				}
				return originalFetch(id);
			});

			await callTool("delete_emoji", {
				guildId: GUILD_FIXTURE.id,
				emojiId: EMOJI_WAVE.id,
			});

			expect(deleteSpy).toHaveBeenCalledTimes(1);
		});

		it("throws UserError for unknown emoji ID", async () => {
			try {
				await callTool("delete_emoji", {
					guildId: GUILD_FIXTURE.id,
					emojiId: "0000000000000000000",
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});
	});
});
