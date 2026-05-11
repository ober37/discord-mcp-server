import { z } from "zod/v4";

const EmbedImageSchema = z.object({
	url: z.string().url().describe("URL of the image."),
});

const EmbedFieldSchema = z.object({
	name: z.string().describe("Field name."),
	value: z.string().describe("Field value."),
	inline: z.boolean().optional().describe("Display field inline."),
});

export const EmbedSchema = z.object({
	title: z.string().optional().describe("Embed title."),
	description: z.string().optional().describe("Embed description text."),
	url: z.string().url().optional().describe("URL the title links to."),
	color: z
		.number()
		.int()
		.optional()
		.describe("Embed color as an integer (e.g. 0xFF5733 = 16734003)."),
	image: EmbedImageSchema.optional().describe("Main embed image."),
	thumbnail: EmbedImageSchema.optional().describe("Thumbnail shown in the top-right corner."),
	fields: z.array(EmbedFieldSchema).max(25).optional().describe("Up to 25 embed fields."),
});

// Discord renders broken image URLs as placeholders rather than rejecting the message —
// URL syntax is validated here but HTTP reachability is Discord's responsibility.
export const embedsParam = z
	.array(EmbedSchema)
	.max(10)
	.optional()
	.describe(
		"Up to 10 Discord embed objects. Each can include image, thumbnail, title, description, color, and fields. " +
			"Image URLs must be syntactically valid; Discord renders unreachable URLs as broken-image placeholders.",
	);

// Per-file count limit (10) is not tier-dependent — enforced here at schema level.
// Per-file SIZE limit is tier-dependent and enforced at runtime in fetchAttachments().
export const attachmentUrlsParam = z
	.array(z.string().url())
	.max(10)
	.optional()
	.describe(
		"Up to 10 URLs to fetch and upload as native Discord file attachments. " +
			"The MCP server downloads each file server-side and uploads it to Discord's CDN. " +
			"Per-file size limit depends on server boost tier (8 MB standard, 50 MB Tier 2, 100 MB Tier 3). " +
			"Webhooks are always capped at 8 MB (no guild context available).",
	);
