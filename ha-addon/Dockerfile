ARG BUILD_FROM
FROM $BUILD_FROM

# Install Node.js and system dependencies
RUN apt-get update && apt-get install -y \
    nodejs \
    npm \
    jq \
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
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Copy the entire monorepo (assuming build context is the root)
# If HA builds within the ha-addon folder, this might need adjustment
# But usually HA repos are structured so the addon is in a folder
COPY .. .

# Build the app
RUN npm install
RUN npm run build -w shared
RUN npm run build -w client
RUN npm run build -w server

# Install production dependencies only
RUN npm prune --production

# Link to run.sh
COPY ha-addon/run.sh /
RUN chmod a+x /run.sh

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

CMD [ "/run.sh" ]
