# Web image (TE-03): Vite build, served as static files. Build context is `app/`.
FROM node:26-alpine AS build
WORKDIR /srv/app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/
# The root devDependencies stay: vite.config.ts imports `vitest/config`, which lives there.
RUN npm ci --workspace @pflanzendex/web --include-workspace-root
COPY config/project/tsconfig.base.json config/project/
# vite.config.ts imports the coverage settings of the test setup; the build fails without them.
COPY tools/check/quality/coverage/coverage-config.mjs tools/check/quality/coverage/
COPY config/gates/coverage-thresholds.json config/gates/
COPY packages/core packages/core
COPY packages/web packages/web
ARG APP_VERSION=unknown
# Sign-in and API addresses are compiled into the bundle (Vite); without them the local development defaults apply.
ARG VITE_OIDC_AUTHORITY
ARG VITE_OIDC_CLIENT_ID
ARG VITE_API_URL
ENV VITE_APP_VERSION=$APP_VERSION
# An empty build argument must not override the default of the app (`??` does not treat "" as missing).
RUN for v in VITE_OIDC_AUTHORITY VITE_OIDC_CLIENT_ID VITE_API_URL; do eval "[ -n \"\$$v\" ] || unset $v"; done; npm run build -w @pflanzendex/web

FROM caddy:2-alpine
COPY config/deploy/docker/web.Caddyfile /etc/caddy/Caddyfile
COPY --from=build /srv/app/packages/web/dist /srv/web
EXPOSE 8080
