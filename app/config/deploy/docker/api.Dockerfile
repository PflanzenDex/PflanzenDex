# syntax=docker/dockerfile:1.29@sha256:572cebbc2b15e6f84c077742952674889cb63cd5e9b80abdffcbe587b6f19183
# API image (TE-03). Build context is `app/`. Reproducible: base image pinned to an exact version and a digest (#761,
# Renovate keeps it current), `npm ci` from the lock file. Runs as the image's user `node`, never as root.
# The same image runs the migrations (`migrate` service in docker-compose.yml, #201): `db` ships its SQL files.
# `core` is exported as TypeScript source, so the API runs through tsx (there is no separate build step).
# Two stages (issue 2520): `deps` installs the packages, the runtime stage copies them. The npm cache stays in `deps`,
# so the runtime image does not carry it.
FROM node:26.13.0-alpine3.24@sha256:c6ad9e9c1d80f6eb607c26b4b0a132ff7a2344fad1c78ea3baa2a7d4c8de6d94 AS deps
WORKDIR /srv/app
COPY --link package.json package-lock.json ./
COPY --link packages/core/package.json packages/core/
COPY --link packages/db/package.json packages/db/
COPY --link packages/api/package.json packages/api/
COPY --link packages/web/package.json packages/web/
RUN npm ci --workspace @pflanzendex/api --include-workspace-root=false

FROM node:26.13.0-alpine3.24@sha256:c6ad9e9c1d80f6eb607c26b4b0a132ff7a2344fad1c78ea3baa2a7d4c8de6d94
WORKDIR /srv/app
# The packages with their node_modules from `deps`, then the sources of the context (the context excludes node_modules).
COPY --link --from=deps /srv/app /srv/app
COPY --link config/project/tsconfig.base.json config/project/
COPY --link packages/core packages/core
COPY --link packages/db packages/db
COPY --link packages/api packages/api
ARG GIT_SHA=unknown
ARG APP_VERSION=unknown
# OCI image labels (issue 2520). The licence is not an SPDX identifier, so none is set.
LABEL org.opencontainers.image.title="PflanzenDex API" \
      org.opencontainers.image.description="PflanzenDex API: Hono HTTP API, MCP endpoint and background jobs (tsx)" \
      org.opencontainers.image.source="https://github.com/PflanzenDex/PflanzenDex" \
      org.opencontainers.image.version="$APP_VERSION" \
      org.opencontainers.image.revision="$GIT_SHA"
ENV NODE_ENV=production GIT_SHA=$GIT_SHA APP_VERSION=$APP_VERSION PORT=3000
USER node
EXPOSE 3000
WORKDIR /srv/app/packages/api
CMD ["npx", "tsx", "src/main.ts"]
