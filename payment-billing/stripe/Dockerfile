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
EXPOSE 3000
ENV NODE_ENV=production
# IMPORTANT: Set STRIPE_SECRET_KEY and WEBHOOK_SECRET via your secret manager.
# Do NOT bake secrets into the Docker image.
CMD ["node", "dist/handler.js"]
