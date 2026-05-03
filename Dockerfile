ARG BUILD_FROM=ghcr.io/home-assistant/base:3.23
FROM $BUILD_FROM

# Redefine NODE_ENV to development for the build phase
# to ensure devDependencies (like typescript) are installed
ENV NODE_ENV=development

WORKDIR /usr/src/app

# Alpine (HA Supervisor): install Node toolchain. Debian (CI BUILD_FROM=*-app:*): Dockerfile.app base already includes Node/npm/jq; only add native-build deps if missing.
RUN if command -v apk >/dev/null 2>&1; then \
      apk add --no-cache nodejs npm python3 make g++ jq; \
    elif command -v apt-get >/dev/null 2>&1; then \
      apt-get update \
      && apt-get install -y --no-install-recommends python3 make g++ \
      && rm -rf /var/lib/apt/lists/*; \
    fi

# Copy root configurations
COPY package.json package-lock.json ./

# Root postinstall (ensure-rollup-native.mjs) must exist before npm install
COPY scripts ./scripts

# Copy packages
COPY shared ./shared
COPY server ./server
COPY client ./client

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
# Supervisor / CI passes BUILD_VERSION from ha-addon/config.yaml version; CI may pass VITE_APP_BUILD_VERSION (tag@sha) instead.
ARG BUILD_VERSION=1.3.9
ARG VITE_APP_BUILD_VERSION=
ARG VITE_INSTALL_KIND=docker
ENV VITE_INSTALL_KIND=docker
# Relative Vite base so JS/CSS load under Home Assistant Ingress (/hassio/ingress/<slug>/), not from site root.
ENV VITE_BASE=./
RUN export VITE_APP_BUILD_VERSION="${VITE_APP_BUILD_VERSION:-$BUILD_VERSION}" \
    && npm run build -w client
RUN npm run build -w server

# Set back to production and prune devDependencies
ENV NODE_ENV=production
RUN npm prune --production

RUN case "$(uname -m)" in aarch64|arm64) cpu=arm64 ;; armv7l|armv6l|armhf) cpu=arm ;; *) cpu=x64 ;; esac \
    && npm install --no-save --os=linux --cpu="$cpu" sharp -w server

COPY run.sh /
# Strip Windows CRLF if present (broken shebang → kernel falls through to Node and tries to interpret shell as JS).
RUN sed -i 's/\r$//' /run.sh
RUN chmod a+x /run.sh

ENV DATA_DIR=/data
ENV PORT=9203
EXPOSE 9203

# Inherited ENTRYPOINT from the app image (Dockerfile.app: docker-entrypoint.sh) would run
# `node /run.sh` and crash with "SyntaxError: Invalid regular expression flags". Reset it
# so Supervisor / s6 invokes /run.sh directly as a shell script.
ENTRYPOINT []
CMD [ "/run.sh" ]
