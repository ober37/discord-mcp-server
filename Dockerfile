# ── Build Stage ──
FROM oven/bun:1-alpine AS build
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

COPY src/ src/
COPY tsconfig.json ./

RUN bun build src/index.ts --outdir dist --target bun --format esm --external @valibot/to-json-schema --external sury --external effect

# ── Runtime Stage ──
FROM oven/bun:1-alpine
WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

# Default to stdio transport
ENV MCP_TRANSPORT=stdio

ENTRYPOINT ["bun", "run", "dist/index.js"]
