# --- Build Stage ---
FROM node:20-slim AS builder

WORKDIR /usr/src/app

# Install build tools for native dependencies (like better-sqlite3)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy root configurations
COPY package.json package-lock.json ./

# postinstall (ensure-rollup-native.mjs) needs to exist before npm ci
COPY scripts ./scripts

# Copy packages
COPY shared ./shared
COPY server ./server
COPY client ./client

# Install all dependencies (including devDependencies for build).
# Root postinstall (scripts/ensure-rollup-native.mjs) installs the matching @rollup/rollup-* NAPI
# for this image's OS/arch (amd64, arm64, armv7, etc.). Do not hardcode @rollup/rollup-linux-x64-gnu here.
# Multi-arch / QEMU: slow reads can hit ETIMEDOUT on large tarballs (e.g. typescript).
# Retry/timeouts + single socket help; plain `npm ci` (no BuildKit cache mount) so HA Supervisor
# and other non-BuildKit builders succeed.
# Outer retries: npm may not restart the whole install after a mid-stream read timeout.
ENV npm_config_cache=/root/.npm \
    npm_config_fetch_retries=20 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000 \
    npm_config_fetch_timeout=600000 \
    npm_config_maxsockets=1
# No $((...)): Docker RUN `$$` escaping can break arithmetic and confuse /bin/sh (dash).
RUN for n in 1 2 3 4 5; do \
      npm ci && exit 0; \
      echo "npm ci failed (attempt $$n/5), retrying in 30s..."; \
      [ "$$n" -eq 5 ] || sleep 30; \
    done; \
    exit 1

# Build workspaces in order
RUN npm run build -w shared
# Client: build identity for feedback prefill (override at image build time)
ARG VITE_APP_BUILD_VERSION=
ARG VITE_INSTALL_KIND=docker
ENV VITE_APP_BUILD_VERSION=$VITE_APP_BUILD_VERSION
ENV VITE_INSTALL_KIND=$VITE_INSTALL_KIND
RUN npm run build -w client
RUN npm run build -w server

# Prune dev dependencies before copying to production stage.
# shared has only devDependencies; prune can remove shared/node_modules entirely, which breaks COPY below.
RUN npm prune --omit=dev && mkdir -p shared/node_modules


# --- Production Stage ---
FROM node:20-slim

# Install system dependencies and Chromium
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    jq \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Environment variables for Puppeteer and Application
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    RUN_IN_DOCKER=1

WORKDIR /usr/src/app

# Copy root configurations
COPY --from=builder /usr/src/app/package*.json ./

# Copy pre-installed and pruned node_modules from builder
# This ensures all native modules are correctly compiled and present
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/shared/node_modules ./shared/node_modules
COPY --from=builder /usr/src/app/server/node_modules ./server/node_modules

# Copy build artifacts and package.json files
COPY --from=builder /usr/src/app/shared/package.json ./shared/
COPY --from=builder /usr/src/app/shared/dist ./shared/dist/

COPY --from=builder /usr/src/app/server/package.json ./server/
COPY --from=builder /usr/src/app/server/dist ./server/dist/

COPY --from=builder /usr/src/app/client/package.json ./client/
COPY --from=builder /usr/src/app/client/dist ./client/dist/

# Create data directory
RUN mkdir -p /data

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["server/dist/index.js"]
