// Line rules of the design system gate (DESIGN-SYSTEM.md); used by check-design-system.mjs.
import { rawControlLines } from "./check-design-system-ast.mjs";

// DS-33: tokens.css is the only stylesheet under src/.
export const TOKEN_FILE = "styles/tokens.css";

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
    test: (line, file) => file !== TOKEN_FILE && COLOR_LITERAL.test(line),
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
    id: "DS-33",
    languages: ["css", "tsx"],
    test: (line, file) => file !== TOKEN_FILE && /@apply\b|<style[\s>]/.test(line),
  },
  {
    id: "DS-37",
    languages: ["css"],
    test: (line) => /outline\s*:\s*(?:none|0)\b/.test(line),
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

// Blank out comments and string/template contents (keeps length and newlines) so structure can be matched.
const LITERALS =
  /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
const blank = (text) => text.replace(LITERALS, (m) => m.replace(/[^\n]/g, " "));
const lineAt = (text, index) => text.slice(0, index).split("\n").length;
// Text between the opening bracket at `open` and its match (exclusive), or "" when unbalanced.
function balanced(text, open) {
  const pairs = { "(": ")", "{": "}" };
  const close = pairs[text[open]];
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === text[open]) depth += 1;
    else if (text[i] === close && (depth -= 1) === 0) return text.slice(open + 1, i);
  }
  return "";
}

const notStory = (file) => !/\.stories\.tsx$/.test(file);
const isUi = (file) => file.startsWith("components/ui/") && notStory(file);
const CVA_CALL = /\bcva\(/;
const TERNARY_OR_AND = /(?<!\?)\?(?![?.])|&&/;

// File rules see the whole file; each returns the 1-based lines of its violations.
export const FILE_RULES = [
  {
    id: "DS-48",
    applies: (file) => file.endsWith(".tsx") && !file.startsWith("components/ui/"),
    lines: (content, file) => rawControlLines(content, file),
  },
  {
    // DS-31: class names flow through cn(), never template literals or concatenation.
    id: "DS-31",
    applies: (file) => file.startsWith("components/") && notStory(file),
    lines: (content) => {
      const found = [];
      content.split("\n").forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, "");
        if (/className=\{\s*(?:`|["'][^"']*["']\s*\+|[\w.]+\s*\+\s*["'`])/.test(code))
          found.push(i + 1);
      });
      return found;
    },
  },
  {
    // DS-34: ui components vary classes through cva(), not by ternary or && in className.
    id: "DS-34",
    applies: isUi,
    lines: (content) => {
      const code = blank(content);
      if (CVA_CALL.test(code)) return [];
      const found = [];
      for (const m of code.matchAll(/\bclassName=\{/g)) {
        const open = m.index + m[0].length - 1;
        const op = TERNARY_OR_AND.exec(balanced(code, open));
        if (op) found.push(lineAt(code, open + 1 + op.index));
      }
      return found;
    },
  },
  {
    // DS-34: a ui component declaring variant/size props needs cva().
    id: "DS-34",
    applies: isUi,
    lines: (content) => {
      const code = blank(content);
      if (CVA_CALL.test(code)) return [];
      const m = /^\s*(?:variant|size)\??\s*:/m.exec(code);
      return m ? [lineAt(code, m.index + m[0].search(/\S/))] : [];
    },
  },
  {
    // DS-36 (static part): ui components accepting className must call cn().
    id: "DS-36",
    applies: isUi,
    lines: (content) => {
      const code = blank(content);
      if (/\bcn\(/.test(code)) return [];
      const m = /[{,]\s*className\b(?!\s*=)|\bclassName\??\s*:/.exec(code);
      return m ? [lineAt(code, m.index + 1)] : [];
    },
  },
  {
    // DS-35: every cva() call sets defaultVariants.
    id: "DS-35",
    applies: (file) => file.startsWith("components/") && notStory(file),
    lines: (content) => {
      const code = blank(content);
      const found = [];
      for (const m of code.matchAll(/\bcva\(/g)) {
        const body = balanced(code, m.index + m[0].length - 1);
        if (!/\bdefaultVariants\b/.test(body)) found.push(lineAt(code, m.index));
      }
      return found;
    },
  },
];
