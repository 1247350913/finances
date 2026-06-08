# ── Stage 1: Build the Vite frontend ─────────────────────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy manifests first — these layers cache independently of source changes
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# VITE_ vars are baked into the JS bundle at build time, so they must be
# provided as build args here. Pass them via --build-arg in CI or locally.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY

COPY . .
RUN pnpm build


# ── Stage 2: Production runtime ───────────────────────────────────────────────
FROM node:22-alpine AS production

# Python is needed by the custom-parser endpoint (spawns a Python subprocess)
RUN apk add --no-cache python3 && ln -sf python3 /usr/bin/python

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Install all deps (includes tsx which is used as the server TypeScript runtime)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Copy server source and config
COPY server/ ./server/
COPY tsconfig.json ./

# Pull in the built frontend from Stage 1
COPY --from=builder /app/dist ./dist

EXPOSE 3001

ENV NODE_ENV=production

CMD ["node_modules/.bin/tsx", "server/index.ts"]
