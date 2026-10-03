# Zitadel für Spike TE-15

Offizielles Compose-Setup (Apache-2.0) wird nicht kopiert, sondern geholt:

```bash
for f in docker-compose.yml .env.example; do
  gh api repos/zitadel/zitadel/contents/deploy/compose/$f --jq .content | base64 -d > upstream-$f
done
cp upstream-docker-compose.yml compose.yaml
sed -e 's/^ZITADEL_VERSION=.*/ZITADEL_VERSION=v4.19.4/' \
    -e 's/^PROXY_HTTP_PUBLISHED_PORT=.*/PROXY_HTTP_PUBLISHED_PORT=18082/' \
    -e 's/^ZITADEL_EXTERNALPORT=.*/ZITADEL_EXTERNALPORT=18082/' upstream-.env.example > .env
docker compose -p te15-zit --env-file .env -f compose.yaml -f compose.spike.yaml up -d
```

`compose.spike.yaml` legt beim ersten Start einen Maschinen-Admin mit Token an (`/zitadel/bootstrap/admin.pat`).
Danach DCR einschalten: `PUT /v2/settings/security` mit `{"dynamicClientRegistration":{"enabled":true,"allowUnauthenticated":true}}`.
Standard-Admin der Instanz: `zitadel-admin@zitadel.localhost` / `Password1!` (nur lokal).
