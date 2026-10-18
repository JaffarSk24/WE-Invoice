# Gateway image: Node 22 LTS, production dependencies only, non-root user.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY src ./src
COPY openapi.yaml ./
USER node
EXPOSE 8787
ENV HOST=0.0.0.0 PORT=8787
CMD ["node", "src/index.js"]
