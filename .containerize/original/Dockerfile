FROM docker.io/library/node:24 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM docker.io/library/node:24 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM docker.io/library/node:24-slim AS runtime
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=8080
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 8080
CMD ["node","dist/index.js"]
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 CMD ["sh", "-c", "test \"$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${PORT}/)\" -lt 500"]
