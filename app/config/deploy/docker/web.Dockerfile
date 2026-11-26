# syntax=docker/dockerfile:1.29@sha256:572cebbc2b15e6f84c077742952674889cb63cd5e9b80abdffcbe587b6f19183
# Web image (TE-03): Vite build, served as static files. Build context is `app/`.
# Base images are pinned to an exact version and a digest (#761); Dependabot keeps them current (FR-QG-15).
FROM node:26.13.0-alpine3.24@sha256:c6ad9e9c1d80f6eb607c26b4b0a132ff7a2344fad1c78ea3baa2a7d4c8de6d94 AS build
WORKDIR /srv/app
COPY --link package.json package-lock.json ./
COPY --link packages/core/package.json packages/core/
COPY --link packages/api/package.json packages/api/
COPY --link packages/web/package.json packages/web/
# The root devDependencies stay: vite.config.ts imports `vitest/config`, which lives there.
RUN npm ci --workspace @pflanzendex/web --include-workspace-root
COPY --link config/project/tsconfig.base.json config/project/
# vite.config.ts imports the coverage settings of the test setup; the build fails without them.
COPY --link tools/check/quality/coverage/coverage-config.mjs tools/check/quality/coverage/
COPY --link config/gates/coverage-thresholds.json config/gates/
COPY --link packages/core packages/core
COPY --link packages/web packages/web
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
# OCI image labels (issue 2520). The licence is not an SPDX identifier, so none is set.
ARG APP_VERSION=unknown
LABEL org.opencontainers.image.title="PflanzenDex web" \
      org.opencontainers.image.description="PflanzenDex web app: the static build, served by unprivileged Caddy" \
      org.opencontainers.image.source="https://github.com/PflanzenDex/PflanzenDex" \
      org.opencontainers.image.version="$APP_VERSION"
COPY --link config/deploy/docker/web.Caddyfile /etc/caddy/Caddyfile
COPY --link --from=build /srv/app/packages/web/dist /srv/web
EXPOSE 8080
