# --- Build Stage ---
FROM node:20-slim AS builder

WORKDIR /usr/src/app

# Copy root configurations
COPY package*.json ./
COPY tsconfig.json ./

# Copy packages
COPY shared ./shared
COPY server ./server
COPY client ./client

# Install dependencies (monorepo root)
RUN npm install

# Build Shared library first
RUN npm run build -w shared

# Build Client
RUN npm run build -w client

# Build Server
RUN npm run build -w server


# --- Production Stage ---
FROM node:20-slim

# Install system dependencies for Puppeteer/Chrome
RUN apt-get update && apt-get install -y \
    ca-certificates \
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
    # Helper tools
    jq \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Copy built packages from builder
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/shared ./shared
COPY --from=builder /usr/src/app/server ./server
COPY --from=builder /usr/src/app/client/dist ./client/dist

# Install production dependencies only
# We install in the root to support the workspace links
RUN npm install --omit=dev && npm cache clean --force

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

# Create data directory if it doesn't exist
RUN mkdir -p /data

EXPOSE 3000

# Default command (can be overridden by HA run.sh)
CMD ["node", "server/dist/index.js"]
