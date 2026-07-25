# Build context must be the repo root:
#   docker build -f server/Dockerfile -t death-tank-server .
#
# Uses tsx to run TypeScript directly — no build step needed.

FROM node:20-alpine

WORKDIR /app

# Copy shared protocol first (changes rarely)
COPY shared/ ./shared/

# Install dependencies
COPY server/package*.json ./server/
RUN cd server && npm ci

# Copy server source
COPY server/src/ ./server/src/

EXPOSE 8080

WORKDIR /app/server
CMD ["npx", "tsx", "src/index.ts"]
