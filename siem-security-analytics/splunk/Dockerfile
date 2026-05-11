FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY --from=builder /app/dist/ ./dist/
EXPOSE 3004
ENV NODE_ENV=production
# IMPORTANT: Set SPLUNK_HEC_URL, SPLUNK_HEC_TOKEN, and WEBHOOK_SECRET
# via your secret manager. Do NOT bake secrets into the Docker image.
#
# Optional env vars:
#   SPLUNK_INDEX=ory
#   SPLUNK_SOURCE=ory:actions
#   SPLUNK_SOURCETYPE=ory:auth
#   SPLUNK_HOST=ory-network
CMD ["node", "dist/handler.js"]
