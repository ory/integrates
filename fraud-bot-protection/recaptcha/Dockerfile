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
EXPOSE 3001
ENV NODE_ENV=production
# IMPORTANT: Set RECAPTCHA_SECRET_KEY and WEBHOOK_SECRET via your secret manager.
# Do NOT bake secrets into the Docker image.
#
# Optional env vars:
#   RECAPTCHA_VERSION=v3          (default: v3)
#   RECAPTCHA_SCORE_THRESHOLD=0.5 (default: 0.5)
#   RECAPTCHA_EXPECTED_ACTION=register
CMD ["node", "dist/handler.js"]
