FROM node:22.14.0-alpine3.21 AS build
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace @local-todo/web --include-workspace-root=false
COPY apps/web apps/web
RUN npm run build --workspace @local-todo/web

FROM nginx:1.27.4-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist/web/browser /usr/share/nginx/html
EXPOSE 8080
