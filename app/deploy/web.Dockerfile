# Web-Image (TE-03): Vite-Build, ausgeliefert als statische Dateien. Build-Kontext ist `app/`.
FROM node:24-alpine AS build
WORKDIR /srv/app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/
RUN npm ci --workspace @pflanzendex/web --include-workspace-root=false
COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY packages/web packages/web
ARG APP_VERSION=unbekannt
ENV VITE_APP_VERSION=$APP_VERSION
RUN npm run build -w @pflanzendex/web

FROM caddy:2-alpine
COPY deploy/web.Caddyfile /etc/caddy/Caddyfile
COPY --from=build /srv/app/packages/web/dist /srv/web
EXPOSE 8080
