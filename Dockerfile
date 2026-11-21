FROM docker.io/library/node:24 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN sed -i "s|this.app = (0, express_1.default)();|this.app = (0, express_1.default)(); this.app.get('/', (_req, res) => res.status(200).json({ success: true }));|" dist/index.js

FROM docker.io/library/node:24 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM docker.io/library/node:24-slim AS runtime
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/data \
    && : > /app/data/msgstore.db \
    && chmod 644 /app/data/msgstore.db
ENV NODE_ENV=production PORT=8080
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 8080
CMD ["sh", "-c", "exec node dist/index.js \"${MSGSTORE_DB:-/app/data/msgstore.db}\" \"${PORT:-8080}\""]
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 CMD ["sh", "-c", "case \"$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${PORT}/health)\" in 2*|3*) exit 0;; *) exit 1;; esac"]
