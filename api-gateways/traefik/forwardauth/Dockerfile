FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY tsconfig.json server.ts ./
USER node
ENV PORT=4181
EXPOSE 4181
CMD ["node_modules/.bin/tsx", "server.ts"]
