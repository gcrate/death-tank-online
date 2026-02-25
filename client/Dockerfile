# Build context must be the repo root:
#   docker build -f client/Dockerfile -t death-tank-client .

FROM node:20-alpine AS builder

WORKDIR /build

# Copy shared protocol (Vite alias resolves @shared -> ../shared)
COPY shared/ ./shared/

# Install dependencies
COPY client/package*.json ./client/
RUN cd client && npm ci

# Copy client source files
COPY client/index.html      ./client/
COPY client/vite.config.ts  ./client/
COPY client/tsconfig.json   ./client/
COPY client/src/            ./client/src/
COPY client/public/         ./client/public/

# Build with Vite (skips the separate tsc type-check step that has
# rootDir issues with shared/ — Vite's bundler handles TS directly)
RUN cd client && npx vite build

# ---- Runtime image ----
FROM nginx:1.25-alpine

COPY --from=builder /build/client/dist /usr/share/nginx/html
COPY client/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
