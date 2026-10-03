# API-Image (TE-03). Build-Kontext ist `app/`. Reproduzierbar: Basis-Image nach Hauptversion, `npm ci` nach Lockfile.
# `core` wird als TypeScript-Quelle exportiert, daher läuft die API über tsx (kein eigener Build-Schritt vorhanden).
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
