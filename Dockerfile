# Backend-only image — deployed to Google Cloud Run.
# The Vite frontend is deployed separately to Cloudflare Pages.
FROM node:22-alpine

# Python is needed for the custom-parser endpoint (spawns a python subprocess)
RUN apk add --no-cache python3 && ln -sf python3 /usr/bin/python

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Install all deps first (separate layer — caches independently of source changes)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Copy server source and TypeScript config
COPY server/ ./server/
COPY tsconfig.json ./

EXPOSE 3001

ENV NODE_ENV=production

CMD ["node_modules/.bin/tsx", "server/index.ts"]
