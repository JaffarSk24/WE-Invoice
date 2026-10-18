# Gateway image: Node 22 LTS, production dependencies only, non-root user.
# Build from the repository root so the proxy allow-list comes from the
# contract file packages/core/peppol/providers.json:
#   docker build -f gateway/Dockerfile -t we-invoice-gateway .
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache sqlite
COPY gateway/package.json gateway/package-lock.json* ./
RUN npm ci --omit=dev
COPY gateway/src ./src
COPY gateway/scripts ./scripts
COPY gateway/openapi.yaml ./
COPY packages/core/peppol/providers.json ./src/providers/providers.json
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8787
ENV HOST=0.0.0.0 PORT=8787 DATABASE_PATH=/data/gateway.sqlite
CMD ["node", "src/index.js"]
