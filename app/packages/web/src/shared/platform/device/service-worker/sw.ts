// US-QS-27 · The service worker script (issue 1688). The Vite plugin in vite.config.ts bundles it into
// `/sw.js` and replaces the manifest placeholder with the list of the build's hashed `/assets/` files. The script exports
// nothing, so the browser runs it as a classic script.
import { installWorker, MANIFEST_TOKEN, parseManifest, type WorkerScope } from "./worker-logic";

installWorker(self as unknown as WorkerScope, parseManifest(MANIFEST_TOKEN), caches);
