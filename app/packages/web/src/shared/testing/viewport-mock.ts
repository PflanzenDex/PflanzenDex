// Test helper (jsdom has no layout): a controllable `matchMedia` for `(min-width: Npx)` queries; a `(max-height: Npx)` query
// never matches (the viewport counts as tall), so views take their normal page size; `(pointer: coarse)` never matches
// either (jsdom is a desktop with a fine pointer, US-QS-32: a date field is the typed one unless a test says otherwise).
type Listener = () => void;
const listeners = new Set<Listener>();
let width = 1024;

export function setViewportWidth(next: number): void {
  width = next;
  window.matchMedia = ((query: string) => {
    const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0);
    return {
      matches: /max-height|pointer:\s*coarse/.test(query) ? false : width >= min,
      media: query,
      addEventListener: (_: string, l: Listener) => listeners.add(l),
      removeEventListener: (_: string, l: Listener) => listeners.delete(l),
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
      onchange: null,
    };
  }) as unknown as typeof window.matchMedia;
  for (const l of [...listeners]) l();
}
