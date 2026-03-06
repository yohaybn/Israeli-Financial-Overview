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

# Copy packages
COPY shared ./shared
COPY server ./server
COPY client ./client

# Install all dependencies (including devDependencies for build)
RUN npm install

# Build workspaces in order
RUN npm run build -w shared
RUN npm run build -w client
RUN npm run build -w server

# Prune dev dependencies before copying to production stage
RUN npm prune --omit=dev


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
    DATA_DIR=/data

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

EXPOSE 3000

# Default command
CMD ["node", "server/dist/index.js"]
