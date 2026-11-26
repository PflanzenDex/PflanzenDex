---
topic: the app root of the monorepo: package.json, package-lock.json, eslint.config.js, packages, tools and config
why: one npm workspace; ESLint finds its config only in this folder
expect: 7
---

# app

The TypeScript monorepo: the workspace packages in `packages/`, the tools in `tools/` and the configuration in `config/`. It holds at most 6 units plus this README; the limit is in this manifest (d-139).
