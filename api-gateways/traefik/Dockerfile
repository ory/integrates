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
EXPOSE 4181
ENV NODE_ENV=production
# IMPORTANT: Set ORY_SDK_URL to your Ory Network project URL.
# Example: https://your-project.projects.oryapis.com
CMD ["node", "dist/handler.js"]
