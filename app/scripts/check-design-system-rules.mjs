// Line rules of the design system gate (DESIGN-SYSTEM.md); used by check-design-system.mjs.
const TOKEN_FILES = new Set(["style.css", "styles/tokens.css"]);

const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/;
const PALETTE_HUES =
  "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone";
const PALETTE_CLASS = new RegExp(
  `\\b(?:bg|text|border|ring|fill|stroke|from|to|via)-(?:${PALETTE_HUES})-\\d{2,3}\\b|\\b(?:bg|text|border)-\\[#`,
);

export const RULES = [
  {
    id: "DS-07",
    languages: ["tsx"],
    test: (line) => /["']use (?:client|server)["']/.test(line),
  },
  {
    id: "DS-10",
    languages: ["tsx"],
    test: (line, file) =>
      !file.startsWith("platform/") &&
      /\bnavigator\.|\blocalStorage\b|\bsessionStorage\b|\bnew Notification\b|\bNotification\./.test(
        line,
      ),
  },
  {
    id: "DS-12",
    languages: ["css"],
    test: (line) => /@media[^{]*\(\s*max-(?:width|height)/.test(line),
  },
  {
    id: "DS-12",
    languages: ["tsx"],
    test: (line) => /(?:^|[\s"'`:])max-(?:sm|md|lg|xl|2xl):/.test(line),
  },
  {
    id: "DS-21",
    languages: ["css", "tsx"],
    test: (line) => /\b(?:min-|max-)?h-screen\b|\b100vh\b/.test(line),
  },
  {
    id: "DS-27",
    languages: ["css"],
    test: (line, file) => !TOKEN_FILES.has(file) && COLOR_LITERAL.test(line),
  },
  {
    id: "DS-27",
    languages: ["tsx"],
    test: (line) => COLOR_LITERAL.test(line) || PALETTE_CLASS.test(line),
  },
  {
    id: "DS-32",
    languages: ["tsx"],
    test: (line) => /style=\{\{/.test(line) && !/["']--[\w-]+["']\s*:/.test(line),
  },
  {
    id: "DS-37",
    languages: ["css"],
    test: (line) => /outline\s*:\s*(?:none|0)\b/.test(line),
  },
  {
    id: "DS-48",
    languages: ["tsx"],
    test: (line, file) =>
      !file.startsWith("components/ui/") && /<(?:button|input|select|textarea)\b/.test(line),
  },
];

const RESERVED_DIRS = new Set(["components", "lib", "platform", "styles"]);
const IMPORT = /(?:from|import)\s*\(?\s*["']@\/([^"']+)["']/;
// Layer rules for `@/` imports: ui < shared < modules, modules only through their index.
export function importViolations(file, line) {
  const match = line.match(IMPORT);
  if (match === null) return [];
  const [top, ...restParts] = match[1].split("/");
  const rest = restParts.length > 0 ? restParts.join("/") : undefined;
  const targetIsModule = !RESERVED_DIRS.has(top);
  const found = [];
  if (file.startsWith("components/ui/") && (targetIsModule || top === "components")) {
    if (targetIsModule || rest?.startsWith("shared")) found.push("DS-01");
  }
  if (file.startsWith("components/shared/") && targetIsModule) found.push("DS-02");
  if (targetIsModule && rest !== undefined) found.push("DS-42");
  return found;
}
