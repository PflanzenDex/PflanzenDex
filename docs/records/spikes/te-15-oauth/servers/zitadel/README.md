# Zitadel for spike TE-15

The official Compose setup (Apache-2.0) is not copied but fetched:

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

`compose.spike.yaml` creates a machine admin with token on first start (`/zitadel/bootstrap/admin.pat`).
Then switch DCR on: `PUT /v2/settings/security` mit `{"dynamicClientRegistration":{"enabled":true,"allowUnauthenticated":true}}`.
Default admin of the instance: `zitadel-admin@zitadel.localhost` / `Password1!` (local only).
