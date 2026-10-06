FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:selfhost && npm prune --omit=dev

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/app/data/quest.sqlite
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/package-lock.json ./package-lock.json
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/lib/config-schema.mjs ./lib/config-schema.mjs
COPY --from=build --chown=node:node /app/lib/world-data.mjs ./lib/world-data.mjs
COPY --from=build --chown=node:node /app/lib/default-world.json ./lib/default-world.json
COPY --from=build --chown=node:node /app/lib/theme-schema.mjs ./lib/theme-schema.mjs
COPY --from=build --chown=node:node /app/selfhost/dist ./selfhost/dist
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/content ./content
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
CMD ["node", "server/selfhost.mjs"]
