# ============================================================================
# Multi-Stage Production Dockerfile for Amrutam Telemedicine Backend
# Security-hardened, non-root user, minimal attack surface
# ============================================================================

# --- Stage 1: Build Stage ---
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

# Install build dependencies
COPY package*.json tsconfig.json ./
RUN npm ci

# Copy source code and build TypeScript
COPY src/ ./src/
RUN npm run build

# Prune devDependencies for clean production bundle
RUN npm prune --production

# --- Stage 2: Production Distroless / Alpine Minimal Runtime ---
FROM node:22-alpine AS runner

WORKDIR /usr/src/app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Security: Run as unprivileged node user (UID 1000)
USER node

# Copy production artifacts and node_modules from builder
COPY --chown=node:node --from=builder /usr/src/app/package*.json ./
COPY --chown=node:node --from=builder /usr/src/app/node_modules ./node_modules
COPY --chown=node:node --from=builder /usr/src/app/dist ./dist
COPY --chown=node:node sql/ ./sql/

# Expose HTTP API and Prometheus Metrics port
EXPOSE 3000

# Healthcheck for container orchestration
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health/live || exit 1

# Start production server
CMD ["node", "dist/src/index.js"]
