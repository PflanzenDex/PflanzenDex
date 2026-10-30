# Web image (TE-03): Vite build, served as static files. Build context is `app/`.
# Base images are pinned to an exact version and a digest (#761); Renovate keeps them current (FR-QG-15).
FROM node:24.22.2-alpine3.24@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 AS build
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

# Unprivileged Caddy (#761), also the image of the `proxy` service (docker-compose.yml, `target: caddy`).
# The image's binary carries the file capability cap_net_bind_service; under no-new-privileges with every capability
# dropped, a non-root user cannot execute it ("operation not permitted"). A plain copy drops the capability, and Docker
# lets unprivileged users bind ports below 1024 inside a container. /data (certificates) and /config belong to `caddy`,
# so a new volume on /data does too.
FROM caddy:2.11.7-alpine@sha256:eb4d35b7452d1ab6171fbdbe8d9275b2301dad6dad92115d91e19fb9b24d510f AS caddy
RUN cp /usr/bin/caddy /tmp/caddy && mv /tmp/caddy /usr/bin/caddy \
	&& addgroup -S -g 10001 caddy && adduser -S -D -H -u 10001 -G caddy caddy \
	&& chown -R caddy:caddy /data /config
USER caddy

FROM caddy
COPY config/deploy/docker/web.Caddyfile /etc/caddy/Caddyfile
COPY --from=build /srv/app/packages/web/dist /srv/web
EXPOSE 8080
