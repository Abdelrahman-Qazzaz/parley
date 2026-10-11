# syntax=docker/dockerfile:1

# One image, four entrypoints. api and transcribe-worker are the same artifact
# started differently (see ARCHITECTURE.md); migrate and baseline are the
# operational one-shots.
#
# Build context is the repo root, not this directory: the image carries the
# built client, which the API serves, and the client's type check reads
# packages/contract. The repo root's .dockerignore applies.

FROM node:22-alpine AS client
WORKDIR /repo
COPY client/package.json client/package-lock.json client/
RUN npm ci --prefix client
COPY packages packages
COPY client client
RUN npm run build --prefix client

FROM node:22-alpine AS builder
WORKDIR /app
COPY servers/cloud/backend/package.json servers/cloud/backend/package-lock.json ./
RUN npm ci
COPY servers/cloud/backend ./
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
# Where the API finds the built client it serves.
ENV CLIENT_DIR=/app/client
WORKDIR /app

# Production dependencies only. Every one is pure JS, so there is nothing to
# compile and no build toolchain in the final image.
COPY servers/cloud/backend/package.json servers/cloud/backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
# Read by scripts/migrate.ts at runtime, relative to this working directory.
COPY servers/cloud/backend/drizzle ./drizzle
COPY --from=client /repo/client/dist ./client

USER node

# Overridden per process:
#   transcribe-worker  node dist/transcribe-worker.js
#   migrate            node dist/migrate.js
#   baseline           node dist/baseline.js
CMD ["node", "dist/api.js"]
