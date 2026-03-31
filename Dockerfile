# ---- Stage 1: Build ----
FROM node:20-alpine AS build

LABEL maintainer="businesslog.ai"
LABEL description="Businesslog.ai — AI-powered business logging and analytics worker"
LABEL version="1.0.0"

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json package-lock.json* ./
RUN npm install --frozen-lockfile || npm install

# Copy source and build
COPY . .
RUN npm run build

# ---- Stage 2: Runtime ----
FROM node:20-alpine AS runtime

LABEL maintainer="businesslog.ai"
LABEL description="Businesslog.ai — AI-powered business logging and analytics worker"
LABEL version="1.0.0"

WORKDIR /app

# Copy package manifests and install production deps only
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --frozen-lockfile || npm install --omit=dev

# Copy built artifacts from build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Expose the application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the worker
CMD ["node", "dist/worker.js"]
