ARG BUILD_FROM=ghcr.io/home-assistant/base:3.23
FROM $BUILD_FROM

# Redefine NODE_ENV to development for the build phase
# to ensure devDependencies (like typescript) are installed
ENV NODE_ENV=development

WORKDIR /usr/src/app

# Copy root configurations
COPY package.json package-lock.json ./

# Root postinstall (ensure-rollup-native.mjs) must exist before npm install
COPY scripts ./scripts

# Copy packages
COPY shared ./shared
COPY server ./server
COPY client ./client
COPY ha-addon ./ha-addon

# Multi-arch / QEMU: retry/timeouts + single socket; plain install (no BuildKit cache mount).
ENV npm_config_cache=/root/.npm \
    npm_config_fetch_retries=20 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000 \
    npm_config_fetch_timeout=600000 \
    npm_config_maxsockets=1

# Install all dependencies (including devDependencies)
RUN npm install

# Build workspaces in order
RUN npm run build -w shared
ARG VITE_APP_BUILD_VERSION=
ARG VITE_INSTALL_KIND=docker
ENV VITE_APP_BUILD_VERSION=$VITE_APP_BUILD_VERSION
ENV VITE_INSTALL_KIND=$VITE_INSTALL_KIND
RUN npm run build -w client
RUN npm run build -w server

# Set back to production and prune devDependencies
ENV NODE_ENV=production
RUN npm prune --production

RUN case "$(uname -m)" in aarch64|arm64) cpu=arm64 ;; armv7l|armv6l|armhf) cpu=arm ;; *) cpu=x64 ;; esac \
    && npm install --no-save --os=linux --cpu="$cpu" sharp -w server

# Link to run.sh
COPY ha-addon/run.sh /
RUN chmod a+x /run.sh

# These are already set in the base image but kept here for clarity
ENV DATA_DIR=/data
ENV PORT=3000

CMD [ "/run.sh" ]
