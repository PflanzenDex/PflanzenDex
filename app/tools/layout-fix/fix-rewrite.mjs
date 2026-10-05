// Rewrites the import specifiers of one file after a set of moves (US-QG-09). Pure: text in, text out.
// Only a specifier that resolves to a file is touched, and only when the importing file or its target moves, so
// strings that merely look like imports (fixtures, comments about missing files) and package imports stay as they are.
import { buildSpecifier, resolveSpecifier } from "./fix-resolve.mjs";

// `from "x"`, `import "x"`, `import("x")`, `require("x")`, `vi.mock("x")`, `vi.importActual("x")`
const SPECIFIER =
  /(\b(?:from|import|require|mock|importActual|importMock|doMock)\s*\(?\s*)(["'])([^"'\n]+)\2/g;

/**
 * @param {string} source file text
 * @param {{ old: string, now: string }} file repo-relative path before and after the move
 * @param {Map<string, string>} moves old path -> new path, for every moved file
 * @param {{ files: Set<string>, aliases: object[] }} ctx files as they exist before the move
 */
export function rewriteImports(source, file, moves, ctx) {
  let count = 0;
  const edits = [];
  const text = source.replace(SPECIFIER, (all, head, quote, spec) => {
    const res = resolveSpecifier(spec, file.old, ctx);
    if (!res) return all;
    const target = moves.get(res.target) ?? res.target;
    if (target === res.target && file.now === file.old) return all;
    const next = buildSpecifier(spec, res, { from: file.now, target }, ctx);
    if (next === spec) return all;
    count += 1;
    edits.push({ spec, next, target });
    return `${head}${quote}${next}${quote}`;
  });
  return { text, count, edits };
}
