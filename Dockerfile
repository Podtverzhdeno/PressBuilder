FROM node:24-bookworm-slim
ENV NODE_ENV=production
ENV PB_DATA_DIR=/data
ENV CHROMIUM_PATH=/usr/bin/chromium
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends chromium ffmpeg ca-certificates fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund
COPY . .
RUN npm run build && npm run test:cloud
RUN mkdir -p /data/decks /data/out
EXPOSE 3000
CMD ["node","server/cloud.mjs"]
