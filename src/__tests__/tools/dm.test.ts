import { beforeEach, describe, expect, it, mock } from "bun:test";
import { UserError } from "fastmcp";
import { registerDmTools } from "../../tools/dm";
import { createMockDiscordClient } from "../helpers/discord-mock";
import { BOT_USER, DM_MESSAGE_ONE, DM_MESSAGE_TWO, DM_USER } from "../helpers/fixtures";
import { createTestServer } from "../helpers/test-server";

describe("DM tools", () => {
	let client: ReturnType<typeof createMockDiscordClient>;
	let callTool: ReturnType<typeof createTestServer>["callTool"];

	beforeEach(() => {
		client = createMockDiscordClient();
		const harness = createTestServer();
		registerDmTools(harness.server, client);
		callTool = harness.callTool;
	});

	describe("send_dm", () => {
		it("sends a DM and returns success string with user tag", async () => {
			const result = await callTool("send_dm", {
				userId: DM_USER.id,
				content: "Hello there!",
			});
			expect(result).toContain("✅");
			expect(result).toContain(DM_USER.tag);
			expect(result).toContain("Hello there!");
		});

		it("truncates long content in the success string at 100 chars", async () => {
			const longContent = "A".repeat(150);
			const result = await callTool("send_dm", {
				userId: DM_USER.id,
				content: longContent,
			});
			expect(result).toContain("✅");
			expect(result).toContain("…");
			expect(result).not.toContain("A".repeat(101));
		});

		it("does not truncate content exactly 100 chars", async () => {
			const exactContent = "B".repeat(100);
			const result = await callTool("send_dm", {
				userId: DM_USER.id,
				content: exactContent,
			});
			expect(result).not.toContain("…");
		});

		it("calls dmChannel.send with the provided content", async () => {
			const mockDmChannel = {
				send: mock(() => Promise.resolve({ id: "new-msg-1", content: "test" })),
				messages: { fetch: async () => ({ size: 0 }) },
			};
			const originalFetch = client.users.fetch.bind(client.users);
			client.users.fetch = async (id: string) => {
				const user = await originalFetch(id);
				user.createDM = async () => mockDmChannel;
				return user;
			};

			await callTool("send_dm", {
				userId: DM_USER.id,
				content: "Test message",
			});

			expect(mockDmChannel.send).toHaveBeenCalledTimes(1);
			expect(mockDmChannel.send).toHaveBeenCalledWith("Test message");
		});

		it("throws UserError for unknown userId", async () => {
			try {
				await callTool("send_dm", {
					userId: "0000000000000000000",
					content: "Hello",
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});
	});

	describe("read_dm", () => {
		it("returns DM conversation history with user tag and message count", async () => {
			const result = await callTool("read_dm", {
				userId: DM_USER.id,
			});
			expect(result).toContain(DM_USER.tag);
			expect(result).toContain("2 messages");
		});

		it("includes message content from both sides", async () => {
			const result = await callTool("read_dm", {
				userId: DM_USER.id,
			});
			expect(result).toContain(DM_MESSAGE_ONE.content);
			expect(result).toContain(DM_MESSAGE_TWO.content);
		});

		it("includes author tags in formatted output", async () => {
			const result = await callTool("read_dm", {
				userId: DM_USER.id,
			});
			expect(result).toContain(DM_USER.tag);
			expect(result).toContain(BOT_USER.tag);
		});

		it("uses the provided limit when fetching messages", async () => {
			const mockDmChannel = {
				send: async () => ({}),
				messages: {
					fetch: mock(async (_opts: { limit?: number }) => ({
						size: 0,
						sort: () => ({ map: () => [] }),
					})),
				},
			};
			const originalFetch = client.users.fetch.bind(client.users);
			client.users.fetch = async (id: string) => {
				const user = await originalFetch(id);
				user.createDM = async () => mockDmChannel;
				return user;
			};

			await callTool("read_dm", {
				userId: DM_USER.id,
				limit: 10,
			});

			expect(mockDmChannel.messages.fetch).toHaveBeenCalledWith({ limit: 10 });
		});

		it("defaults to limit 25 when not provided", async () => {
			const mockDmChannel = {
				send: async () => ({}),
				messages: {
					fetch: mock(async (_opts: { limit?: number }) => ({
						size: 0,
						sort: () => ({ map: () => [] }),
					})),
				},
			};
			const originalFetch = client.users.fetch.bind(client.users);
			client.users.fetch = async (id: string) => {
				const user = await originalFetch(id);
				user.createDM = async () => mockDmChannel;
				return user;
			};

			await callTool("read_dm", { userId: DM_USER.id });

			expect(mockDmChannel.messages.fetch).toHaveBeenCalledWith({ limit: 25 });
		});

		it("returns empty message when no DM history exists", async () => {
			const mockDmChannel = {
				send: async () => ({}),
				messages: {
					fetch: async () => ({ size: 0, sort: () => ({ map: () => [] }) }),
				},
			};
			const originalFetch = client.users.fetch.bind(client.users);
			client.users.fetch = async (id: string) => {
				const user = await originalFetch(id);
				user.createDM = async () => mockDmChannel;
				return user;
			};

			const result = await callTool("read_dm", { userId: DM_USER.id });
			expect(result).toBe("No messages found in this DM channel.");
		});

		it("throws UserError for unknown userId", async () => {
			try {
				await callTool("read_dm", {
					userId: "0000000000000000000",
				});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(UserError);
			}
		});
	});
});
