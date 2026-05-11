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
EXPOSE 3006
ENV NODE_ENV=production
# IMPORTANT: Set CASTLE_API_SECRET and WEBHOOK_SECRET via your secret manager.
CMD ["node", "dist/handler.js"]
