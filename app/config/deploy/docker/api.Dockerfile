# API image (TE-03). Build context is `app/`. Reproducible: base image pinned to an exact version and a digest (#761,
# Renovate keeps it current), `npm ci` from the lock file. Runs as the image's user `node`, never as root.
# The same image runs the migrations (`migrate` service in docker-compose.yml, #201): `db` ships its SQL files.
# `core` is exported as TypeScript source, so the API runs through tsx (there is no separate build step).
FROM node:24.22.2-alpine3.24@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85
WORKDIR /srv/app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/
RUN npm ci --workspace @pflanzendex/api --include-workspace-root=false
COPY config/project/tsconfig.base.json config/project/
COPY packages/core packages/core
COPY packages/db packages/db
COPY packages/api packages/api
ARG GIT_SHA=unknown
ARG APP_VERSION=unknown
ENV NODE_ENV=production GIT_SHA=$GIT_SHA APP_VERSION=$APP_VERSION PORT=3000
USER node
EXPOSE 3000
WORKDIR /srv/app/packages/api
CMD ["npx", "tsx", "src/main.ts"]
