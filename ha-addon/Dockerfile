ARG BUILD_FROM
FROM $BUILD_FROM

# Redefine NODE_ENV to development for the build phase
# to ensure devDependencies (like typescript) are installed
ENV NODE_ENV=development

WORKDIR /usr/src/app

# Copy root configurations
COPY package.json package-lock.json ./

# Copy packages
COPY shared ./shared
COPY server ./server
COPY client ./client
COPY ha-addon ./ha-addon

# Install all dependencies (including devDependencies)
RUN npm install

# Build workspaces in order
RUN npm run build -w shared
RUN npm run build -w client
RUN npm run build -w server

# Set back to production and prune devDependencies
ENV NODE_ENV=production
RUN npm prune --production

# Link to run.sh
COPY ha-addon/run.sh /
RUN chmod a+x /run.sh

# These are already set in the base image but kept here for clarity
ENV DATA_DIR=/data
ENV PORT=3000

CMD [ "/run.sh" ]
