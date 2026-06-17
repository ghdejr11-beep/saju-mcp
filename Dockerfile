# Saju MCP Server — Apify Actor image.
# Based on Apify's official TypeScript MCP template (apify/actor-templates →
# ts-mcp-empty/Dockerfile). Two-stage build: compile TS in a builder stage,
# then ship a slim runtime image that runs the Apify HTTP entrypoint.
# Base image docs: https://docs.apify.com/sdk/js/docs/guides/docker-images

FROM apify/actor-node:24 AS builder

# Copy package manifests first to leverage Docker layer caching.
COPY --chown=myuser:myuser package*.json ./

# Install all deps (including dev) needed to build. Skip audit for speed.
RUN npm install --include=dev --audit=false

# Copy the source and build (tsc -> dist/).
COPY --chown=myuser:myuser . ./
RUN npm run build

# ----- Final runtime image -----
FROM apify/actor-node:24

COPY --chown=myuser:myuser package*.json ./

# Production deps only, keep the image small.
RUN npm --quiet set progress=false \
    && npm install --omit=dev --omit=optional \
    && echo "Installed NPM packages:" \
    && (npm list --omit=dev --all || true) \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version \
    && rm -r ~/.npm

# Bring in the compiled JS from the builder stage.
COPY --from=builder --chown=myuser:myuser /usr/src/app/dist ./dist

# Copy the remaining source (README, .actor, etc.).
COPY --chown=myuser:myuser . ./

# Run the Apify HTTP entrypoint (Streamable HTTP MCP server).
CMD ["node", "dist/actor.js"]
