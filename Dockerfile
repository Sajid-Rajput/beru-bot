# ---- Base ----
# Shared foundation: Node 20 LTS Alpine with pnpm enabled
FROM node:20-alpine AS base
WORKDIR /app
# Enable corepack so pnpm is available without a separate install step
RUN corepack enable

# ---- Deps ----
# Install ALL dependencies (including dev) needed for the TypeScript build
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---- Builder ----
# Compile TypeScript → build/
FROM deps AS builder
COPY . .
RUN pnpm run build

# ---- App ----
# Production image: Grammy.js bot + Hono webhook server
FROM base AS app
WORKDIR /app

# Install production deps only
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Copy compiled JS
COPY --from=builder /app/build ./build

# Copy runtime assets needed by i18n
COPY --from=builder /app/locales ./locales

# Copy Drizzle migration files
COPY --from=builder /app/drizzle ./drizzle

# Run as non-root for security
USER node

EXPOSE 3000
CMD ["node", "build/src/app.js"]

# ---- Worker ----
# Production image: BullMQ workers (sell execution, MCAP monitor, recovery, fee payout)
FROM base AS worker
WORKDIR /app

# Install production deps only
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Copy compiled JS
COPY --from=builder /app/build ./build

# Copy Drizzle migration files
COPY --from=builder /app/drizzle ./drizzle

# Run as non-root for security
USER node

CMD ["node", "build/src/worker.js"]