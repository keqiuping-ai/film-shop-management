FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY server-config.json ./
COPY version.json ./
COPY public ./public
COPY updates ./updates
COPY migrations ./migrations
COPY imports ./imports

ENV NODE_ENV=production
ENV PORT=4318
ENV DATA_DIR=/app/data

RUN mkdir -p /app/data

EXPOSE 4318

CMD ["node", "server.js"]
