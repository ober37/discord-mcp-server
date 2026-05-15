import { beforeEach, describe, expect, it, mock } from "bun:test";
import { UserError } from "fastmcp";
import { registerAutomodTools } from "../../tools/automod";
import { createMockDiscordClient } from "../helpers/discord-mock";
import { AUTOMOD_RULE_KEYWORD, AUTOMOD_RULE_SPAM, GUILD_FIXTURE } from "../helpers/fixtures";
import { createTestServer } from "../helpers/test-server";

describe("automod tools", () => {
	let client: ReturnType<typeof createMockDiscordClient>;
	let callTool: ReturnType<typeof createTestServer>["callTool"];

	beforeEach(() => {
		client = createMockDiscordClient();
		const harness = createTestServer();
		registerAutomodTools(harness.server, client, GUILD_FIXTURE.id);
		callTool = harness.callTool;
	});

	// ─── list_automod_rules ────────────────────────────────────────────────────

	describe("list_automod_rules", () => {
		it("returns all automod rules", async () => {
			const result = await callTool("list_automod_rules", { guildId: GUILD_FIXTURE.id });
			expect(result).toContain("Auto-moderation rules (2)");
			expect(result).toContain(AUTOMOD_RULE_KEYWORD.name);
			expect(result).toContain(AUTOMOD_RULE_SPAM.name);
		});

		it("includes rule ID, trigger type, and actions", async () => {
			const result = await callTool("list_automod_rules", { guildId: GUILD_FIXTURE.id });
			expect(result).toContain(AUTOMOD_RULE_KEYWORD.id);
			expect(result).toContain("keyword");
			expect(result).toContain("block_message");
		});

		it("shows enabled state", async () => {
			const result = await callTool("list_automod_rules", { guildId: GUILD_FIXTURE.id });
			expect(result).toContain("enabled");
			expect(result).toContain("disabled");
		});

		it("shows keyword count when present", async () => {
			const result = await callTool("list_automod_rules", { guildId: GUILD_FIXTURE.id });
			expect(result).toContain("keywords: 2");
		});

		it("shows allow list count when present", async () => {
			const result = await callTool("list_automod_rules", { guildId: GUILD_FIXTURE.id });
			expect(result).toContain("allow list: 1");
		});

		it("returns empty message when no rules exist", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			guild.autoModerationRules.fetch = async () => ({ size: 0, map: () => [] });
			const result = await callTool("list_automod_rules", { guildId: GUILD_FIXTURE.id });
			expect(result).toBe("No auto-moderation rules found.");
		});
	});

	// ─── create_automod_rule ───────────────────────────────────────────────────

	describe("create_automod_rule", () => {
		it("creates a keyword rule", async () => {
			const result = await callTool("create_automod_rule", {
				guildId: GUILD_FIXTURE.id,
				name: "My Keyword Rule",
				triggerType: "keyword",
				keywords: ["badword"],
				actions: [{ type: "block_message" }],
			});
			expect(result).toContain("✅");
			expect(result).toContain("My Keyword Rule");
			expect(result).toContain("created");
		});

		it("calls guild.autoModerationRules.create with correct trigger type", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const createSpy = mock(guild.autoModerationRules.create);
			guild.autoModerationRules.create = createSpy;

			await callTool("create_automod_rule", {
				guildId: GUILD_FIXTURE.id,
				name: "Spy Rule",
				triggerType: "keyword",
				keywords: ["test"],
				actions: [{ type: "block_message" }],
			});

			expect(createSpy).toHaveBeenCalledTimes(1);
			// biome-ignore lint/suspicious/noExplicitAny: spy call args are untyped
			const callArgs = (createSpy.mock.calls as any[][])[0][0];
			expect(callArgs.triggerType).toBe(1); // AutoModerationRuleTriggerType.Keyword
		});

		it("creates a spam rule with no metadata", async () => {
			const result = await callTool("create_automod_rule", {
				guildId: GUILD_FIXTURE.id,
				name: "Spam Shield",
				triggerType: "spam",
				actions: [{ type: "block_message" }],
			});
			expect(result).toContain("✅");
			expect(result).toContain("Spam Shield");
		});

		it("creates a keyword_preset rule with multiple presets", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const createSpy = mock(guild.autoModerationRules.create);
			guild.autoModerationRules.create = createSpy;

			await callTool("create_automod_rule", {
				guildId: GUILD_FIXTURE.id,
				name: "Content Filter",
				triggerType: "keyword_preset",
				presets: ["profanity", "slurs"],
				actions: [{ type: "block_message" }],
			});

			// biome-ignore lint/suspicious/noExplicitAny: spy call args are untyped
			const callArgs = (createSpy.mock.calls as any[][])[0][0];
			expect(callArgs.triggerType).toBe(4); // AutoModerationRuleTriggerType.KeywordPreset
			// Profanity=1, Slurs=3
			expect(callArgs.triggerMetadata.presets).toEqual([1, 3]);
		});

		it("creates a mention_spam rule with limit", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const createSpy = mock(guild.autoModerationRules.create);
			guild.autoModerationRules.create = createSpy;

			await callTool("create_automod_rule", {
				guildId: GUILD_FIXTURE.id,
				name: "Mention Guard",
				triggerType: "mention_spam",
				mentionTotalLimit: 8,
				mentionRaidProtection: true,
				actions: [{ type: "block_message" }],
			});

			// biome-ignore lint/suspicious/noExplicitAny: spy call args are untyped
			const callArgs = (createSpy.mock.calls as any[][])[0][0];
			expect(callArgs.triggerType).toBe(5); // AutoModerationRuleTriggerType.MentionSpam
			expect(callArgs.triggerMetadata.mentionTotalLimit).toBe(8);
			expect(callArgs.triggerMetadata.mentionRaidProtectionEnabled).toBe(true);
		});

		it("creates a rule with send_alert_message action", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const createSpy = mock(guild.autoModerationRules.create);
			guild.autoModerationRules.create = createSpy;

			await callTool("create_automod_rule", {
				guildId: GUILD_FIXTURE.id,
				name: "Alert Rule",
				triggerType: "keyword",
				keywords: ["alert-word"],
				actions: [{ type: "send_alert_message", alertChannelId: "1234567890" }],
			});

			// biome-ignore lint/suspicious/noExplicitAny: spy call args are untyped
			const callArgs = (createSpy.mock.calls as any[][])[0][0];
			expect(callArgs.actions[0].type).toBe(2); // AutoModerationActionType.SendAlertMessage
			expect(callArgs.actions[0].metadata.channel).toBe("1234567890");
		});

		it("creates a rule with timeout action", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const createSpy = mock(guild.autoModerationRules.create);
			guild.autoModerationRules.create = createSpy;

			await callTool("create_automod_rule", {
				guildId: GUILD_FIXTURE.id,
				name: "Timeout Rule",
				triggerType: "keyword",
				keywords: ["bad"],
				actions: [{ type: "timeout", timeoutSeconds: 300 }],
			});

			// biome-ignore lint/suspicious/noExplicitAny: spy call args are untyped
			const callArgs = (createSpy.mock.calls as any[][])[0][0];
			expect(callArgs.actions[0].type).toBe(3); // AutoModerationActionType.Timeout
			expect(callArgs.actions[0].metadata.durationSeconds).toBe(300);
		});

		it("passes member_profile trigger type correctly", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const createSpy = mock(guild.autoModerationRules.create);
			guild.autoModerationRules.create = createSpy;

			await callTool("create_automod_rule", {
				guildId: GUILD_FIXTURE.id,
				name: "Profile Filter",
				triggerType: "member_profile",
				eventType: "member_update",
				keywords: ["prohibited"],
				actions: [{ type: "block_member_interaction" }],
			});

			// biome-ignore lint/suspicious/noExplicitAny: spy call args are untyped
			const callArgs = (createSpy.mock.calls as any[][])[0][0];
			expect(callArgs.triggerType).toBe(6); // AutoModerationRuleTriggerType.MemberProfile
			expect(callArgs.eventType).toBe(2); // AutoModerationRuleEventType.MemberUpdate
		});

		it("passes disabled enabled flag when false", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const createSpy = mock(guild.autoModerationRules.create);
			guild.autoModerationRules.create = createSpy;

			await callTool("create_automod_rule", {
				guildId: GUILD_FIXTURE.id,
				name: "Disabled Rule",
				triggerType: "spam",
				actions: [{ type: "block_message" }],
				enabled: false,
			});

			// biome-ignore lint/suspicious/noExplicitAny: spy call args are untyped
			expect((createSpy.mock.calls as any[][])[0][0].enabled).toBe(false);
		});

		it("passes exemptRoleIds and exemptChannelIds", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const createSpy = mock(guild.autoModerationRules.create);
			guild.autoModerationRules.create = createSpy;

			await callTool("create_automod_rule", {
				guildId: GUILD_FIXTURE.id,
				name: "Exempt Rule",
				triggerType: "keyword",
				keywords: ["word"],
				actions: [{ type: "block_message" }],
				exemptRoleIds: ["role-1", "role-2"],
				exemptChannelIds: ["chan-1"],
			});

			// biome-ignore lint/suspicious/noExplicitAny: spy call args are untyped
			const callArgs = (createSpy.mock.calls as any[][])[0][0];
			expect(callArgs.exemptRoles).toEqual(["role-1", "role-2"]);
			expect(callArgs.exemptChannels).toEqual(["chan-1"]);
		});

		it("omits triggerMetadata for spam trigger", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const createSpy = mock(guild.autoModerationRules.create);
			guild.autoModerationRules.create = createSpy;

			await callTool("create_automod_rule", {
				guildId: GUILD_FIXTURE.id,
				name: "Spam Rule",
				triggerType: "spam",
				actions: [{ type: "block_message" }],
			});

			// biome-ignore lint/suspicious/noExplicitAny: spy call args are untyped
			expect((createSpy.mock.calls as any[][])[0][0].triggerMetadata).toBeUndefined();
		});

		it("throws UserError when rule creation fails (e.g. guild limit reached)", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			guild.autoModerationRules.create = async () => {
				throw new Error("Maximum number of auto-moderation rules reached");
			};

			try {
				await callTool("create_automod_rule", {
					guildId: GUILD_FIXTURE.id,
					name: "Over Limit Rule",
					triggerType: "keyword",
					keywords: ["word"],
					actions: [{ type: "block_message" }],
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});
	});

	// ─── edit_automod_rule ─────────────────────────────────────────────────────

	describe("edit_automod_rule", () => {
		it("edits an existing rule", async () => {
			const result = await callTool("edit_automod_rule", {
				guildId: GUILD_FIXTURE.id,
				ruleId: AUTOMOD_RULE_KEYWORD.id,
				enabled: false,
			});
			expect(result).toContain("✅");
			expect(result).toContain("updated");
		});

		it("calls guild.autoModerationRules.edit with correct ruleId", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const editSpy = mock(guild.autoModerationRules.edit);
			guild.autoModerationRules.edit = editSpy;

			await callTool("edit_automod_rule", {
				guildId: GUILD_FIXTURE.id,
				ruleId: AUTOMOD_RULE_KEYWORD.id,
				name: "Updated Name",
			});

			expect(editSpy).toHaveBeenCalledTimes(1);
			// biome-ignore lint/suspicious/noExplicitAny: spy call args are untyped
			const calls = editSpy.mock.calls as any[][];
			expect(calls[0][0]).toBe(AUTOMOD_RULE_KEYWORD.id);
			expect(calls[0][1].name).toBe("Updated Name");
		});

		it("enables/disables a rule", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const editSpy = mock(guild.autoModerationRules.edit);
			guild.autoModerationRules.edit = editSpy;

			await callTool("edit_automod_rule", {
				guildId: GUILD_FIXTURE.id,
				ruleId: AUTOMOD_RULE_SPAM.id,
				enabled: true,
			});

			// biome-ignore lint/suspicious/noExplicitAny: spy call args are untyped
			expect((editSpy.mock.calls as any[][])[0][1].enabled).toBe(true);
		});

		it("passes updated keyword list in triggerMetadata", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const editSpy = mock(guild.autoModerationRules.edit);
			guild.autoModerationRules.edit = editSpy;

			await callTool("edit_automod_rule", {
				guildId: GUILD_FIXTURE.id,
				ruleId: AUTOMOD_RULE_KEYWORD.id,
				keywords: ["newword1", "newword2"],
			});

			// biome-ignore lint/suspicious/noExplicitAny: spy call args are untyped
			const triggerMeta = (editSpy.mock.calls as any[][])[0][1].triggerMetadata;
			expect(triggerMeta?.keywordFilter).toEqual(["newword1", "newword2"]);
		});

		it("omits triggerMetadata when no metadata fields provided", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const editSpy = mock(guild.autoModerationRules.edit);
			guild.autoModerationRules.edit = editSpy;

			await callTool("edit_automod_rule", {
				guildId: GUILD_FIXTURE.id,
				ruleId: AUTOMOD_RULE_KEYWORD.id,
				enabled: true,
			});

			// biome-ignore lint/suspicious/noExplicitAny: spy call args are untyped
			expect((editSpy.mock.calls as any[][])[0][1].triggerMetadata).toBeUndefined();
		});

		it("throws UserError for unknown ruleId", async () => {
			try {
				await callTool("edit_automod_rule", {
					guildId: GUILD_FIXTURE.id,
					ruleId: "0000000000000000000",
					enabled: false,
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});
	});

	// ─── delete_automod_rule ───────────────────────────────────────────────────

	describe("delete_automod_rule", () => {
		it("deletes a rule by ID", async () => {
			const result = await callTool("delete_automod_rule", {
				guildId: GUILD_FIXTURE.id,
				ruleId: AUTOMOD_RULE_KEYWORD.id,
			});
			expect(result).toContain("✅");
			expect(result).toContain(AUTOMOD_RULE_KEYWORD.id);
			expect(result).toContain("deleted");
		});

		it("calls guild.autoModerationRules.delete with correct args", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const deleteSpy = mock(guild.autoModerationRules.delete);
			guild.autoModerationRules.delete = deleteSpy;

			await callTool("delete_automod_rule", {
				guildId: GUILD_FIXTURE.id,
				ruleId: AUTOMOD_RULE_KEYWORD.id,
				reason: "No longer needed",
			});

			expect(deleteSpy).toHaveBeenCalledTimes(1);
			// biome-ignore lint/suspicious/noExplicitAny: spy call args are untyped
			const calls = deleteSpy.mock.calls as any[][];
			expect(calls[0][0]).toBe(AUTOMOD_RULE_KEYWORD.id);
			expect(calls[0][1]).toBe("No longer needed");
		});

		it("deletes without a reason", async () => {
			const guild = client.guilds.cache.get(GUILD_FIXTURE.id);
			const deleteSpy = mock(guild.autoModerationRules.delete);
			guild.autoModerationRules.delete = deleteSpy;

			await callTool("delete_automod_rule", {
				guildId: GUILD_FIXTURE.id,
				ruleId: AUTOMOD_RULE_SPAM.id,
			});

			// biome-ignore lint/suspicious/noExplicitAny: spy call args are untyped
			expect((deleteSpy.mock.calls as any[][])[0][1]).toBeUndefined();
		});

		it("throws UserError for unknown ruleId", async () => {
			try {
				await callTool("delete_automod_rule", {
					guildId: GUILD_FIXTURE.id,
					ruleId: "0000000000000000000",
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});
	});
});
