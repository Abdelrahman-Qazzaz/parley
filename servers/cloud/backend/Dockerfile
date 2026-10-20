# syntax=docker/dockerfile:1

# One image, five entrypoints. api and transcribe-worker are the same artifact
# started differently (see ARCHITECTURE.md); migrate, baseline and push-storage
# are the operational one-shots.
#
# Build context is the repo root, not this directory: the repo is one npm
# workspace with one lockfile, the image carries the built client, which the
# API serves, and both read packages/. The repo root's .dockerignore applies.

# Every workspace's manifest, which npm checks the lockfile against even when
# installing only one of them. Installs skip lifecycle scripts: the root's
# prepare sets up git hooks, and no dependency needs one to work.
FROM node:22-alpine AS manifests
WORKDIR /repo
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY servers/cloud/backend/package.json servers/cloud/backend/
COPY servers/local/package.json servers/local/
COPY packages/shared/package.json packages/shared/

FROM manifests AS client
RUN npm ci --ignore-scripts --workspace @parley/client
COPY packages packages
COPY client client
RUN npm run build --workspace @parley/client

FROM manifests AS builder
RUN npm ci --ignore-scripts --workspace @parley/cloud
COPY packages packages
COPY servers/cloud/backend servers/cloud/backend
RUN npm run build --workspace @parley/cloud

FROM manifests AS runtime
ENV NODE_ENV=production
# Where the API finds the built client it serves.
ENV CLIENT_DIR=/repo/client-dist

# Production dependencies only. Every one is pure JS, so there is nothing to
# compile and no build toolchain in the final image.
RUN npm ci --ignore-scripts --omit=dev --workspace @parley/cloud && npm cache clean --force

WORKDIR /repo/servers/cloud/backend
COPY --from=builder /repo/servers/cloud/backend/dist ./dist
# Read by scripts/migrate.ts at runtime, relative to this working directory.
COPY servers/cloud/backend/drizzle ./drizzle
COPY --from=client /repo/client/dist /repo/client-dist

USER node

# Overridden per process:
#   transcribe-worker  node dist/transcribe-worker.js
#   migrate            node dist/migrate.js
#   baseline           node dist/baseline.js
#   push-storage       node dist/push-storage.js
CMD ["node", "dist/api.js"]
