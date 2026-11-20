// The profiling build of issue 2299: the web app's own Vite config plus the alias react-dom/client -> react-dom/profiling,
// so React's HostRoot fibers carry actualDuration. Not part of the repo build. WEB_DIR is app/packages/web of the
// measured checkout. Build: cd "$WEB_DIR" && VITE_API_URL=http://localhost:56008 npx vite build --configLoader native \
//   --config <this file> --outDir <scratch>/dist-profiling
const web = process.env.WEB_DIR;
if (!web) throw new Error("WEB_DIR must name app/packages/web");
const { mergeConfig } = await import(`${web}/../../node_modules/vite/dist/node/index.js`);
const base = (await import(`${web}/vite.config.ts`)).default;

export default mergeConfig(base, {
  root: web,
  resolve: { alias: [{ find: /^react-dom\/client$/, replacement: "react-dom/profiling" }] },
});
