FROM node:22.14.0-alpine3.21 AS build
RUN apk add --no-cache openssl
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace @local-todo/api --include-workspace-root=false
COPY apps/api apps/api
RUN npm run build --workspace @local-todo/api

FROM node:22.14.0-alpine3.21 AS runtime
RUN apk add --no-cache openssl
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /workspace/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /workspace/apps/api/prisma.config.ts ./apps/api/prisma.config.ts
COPY --from=build --chown=node:node /workspace/apps/api/prisma ./apps/api/prisma
COPY --from=build --chown=node:node /workspace/apps/api/src/database/config.ts ./apps/api/src/database/config.ts
COPY --from=build --chown=node:node /workspace/apps/api/dist ./apps/api/dist
USER node
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["sh", "-c", "../../node_modules/.bin/prisma migrate deploy && exec node dist/main.js"]
