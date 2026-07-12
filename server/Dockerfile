# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder

WORKDIR /app

# Copy and build shared package first
COPY shared ./shared
WORKDIR /app/shared
RUN npm install && npm run build

# Install server dependencies
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --legacy-peer-deps
RUN rm -rf node_modules/@rybbit/shared \
    && mkdir -p node_modules/@rybbit/shared \
    && cp /app/shared/package.json node_modules/@rybbit/shared/package.json \
    && cp -R /app/shared/dist node_modules/@rybbit/shared/dist

# Copy server source code
COPY server/ .

# Build the application
RUN npm run build

# Runtime image
FROM node:20-alpine

WORKDIR /app

ARG WOTCV_GIT_SHA=unknown
ARG WOTCV_IMAGE_TAG=unknown
ARG WOTCV_BUILD_TIME=unknown

LABEL org.opencontainers.image.revision=${WOTCV_GIT_SHA}
LABEL org.opencontainers.image.version=${WOTCV_IMAGE_TAG}
LABEL org.opencontainers.image.created=${WOTCV_BUILD_TIME}
LABEL org.opencontainers.image.source="https://github.com/WoT-CV/rybbit-wotcv"
LABEL org.opencontainers.image.licenses="AGPL-3.0-only"
LABEL org.opencontainers.image.title="WoT-CV Rybbit backend"

ENV WOTCV_VERSION=wotcv
ENV WOTCV_GIT_SHA=${WOTCV_GIT_SHA}
ENV WOTCV_IMAGE_TAG=${WOTCV_IMAGE_TAG}
ENV WOTCV_BUILD_TIME=${WOTCV_BUILD_TIME}

# Install PostgreSQL client for migrations and Chromium for Puppeteer PDF generation
RUN apk add --no-cache \
    postgresql-client \
    chromium \
    ffmpeg \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Configure Puppeteer to use system Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Copy built application and dependencies
COPY --from=builder /app/server/package*.json ./
COPY --from=builder /app/server/GeoLite2-City.mmdb ./GeoLite2-City.mmdb
COPY --from=builder /app/server/GeoLite2-ASN.mmdb ./GeoLite2-ASN.mmdb
COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/server/node_modules ./node_modules
COPY --from=builder /app/server/docker-entrypoint.sh /docker-entrypoint.sh
COPY --from=builder /app/server/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/server/drizzle ./drizzle
COPY --from=builder /app/server/public ./public
COPY --from=builder /app/server/src ./src
COPY --from=builder /app/shared ./shared

# Make the entrypoint executable
RUN chmod +x /docker-entrypoint.sh

# Expose the API port
EXPOSE 3001

# Use our custom entrypoint script
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "dist/cluster.js"]
