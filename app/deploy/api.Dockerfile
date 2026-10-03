# API image (TE-03). Build context is `app/`. Reproducible: base image pinned to a major version, `npm ci` from the lock file.
# `core` is exported as TypeScript source, so the API runs through tsx (there is no separate build step).
FROM node:24-alpine
WORKDIR /srv/app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/
RUN npm ci --workspace @pflanzendex/api --include-workspace-root=false
COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY packages/api packages/api
ARG GIT_SHA=unbekannt
ARG APP_VERSION=unbekannt
ENV NODE_ENV=production GIT_SHA=$GIT_SHA APP_VERSION=$APP_VERSION PORT=3000
USER node
EXPOSE 3000
WORKDIR /srv/app/packages/api
CMD ["npx", "tsx", "src/main.ts"]
