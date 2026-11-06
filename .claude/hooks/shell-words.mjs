// Reads a shell command the way a shell splits its words (US-QG-07, issue #1519): quotes removed, operators and
// redirections apart, substitutions kept as text for the caller to judge. Pure; main-checkout.mjs judges the result.

export class ParseError extends Error {}

const OPERATORS = ["&&", "||", ";;", "|&", ";", "|", "&", "(", ")", "\n"];
// The index of the `)` that closes a `$(` whose contents start at `start`.
function matchingParen(text, start) {
  let depth = 1;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === "'") {
      const close = text.indexOf("'", i + 1);
      if (close < 0) break;
      i = close;
    } else if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      if (j >= text.length) break;
      i = j;
    } else if (c === "#" && /[\s;&|()]/.test(text[i - 1])) {
      // A comment that starts a word runs to the newline inside a substitution too: a `)` or a quote in it is text.
      const newline = text.indexOf("\n", i);
      i = newline < 0 ? text.length : newline;
    } else if (c === "(") {
      depth++;
    } else if (c === ")" && --depth === 0) {
      return i;
    }
  }
  throw new ParseError("unclosed $(");
}

// `&>` and `>&` are redirections, not the background operator.
function operatorAt(text, i) {
  if (text[i] === "&" && (text[i + 1] === ">" || text[i - 1] === ">" || text[i - 1] === "<")) return null;
  return OPERATORS.find((op) => text.startsWith(op, i)) ?? null;
}

// The words and operators of a command with the quotes removed. A word a shell would expand (a variable, a glob, a
// leading `~`) or that holds a substitution is `dynamic`; a substitution is kept as text, to be judged in a subshell.
// A redirection is one `{ redir: true }` token; its target is the word after it.
export function tokenize(text) {
  const out = [];
  let word = null;
  const current = () => (word ??= { value: "", dynamic: false, subst: [] });
  const end = () => {
    if (word) out.push(word);
    word = null;
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === " " || c === "\t" || c === "\r") {
      end();
      i++;
    } else if (c === "#" && word === null) {
      // A `#` that starts a word is a comment up to the newline. The newline itself stays and still ends the command.
      const newline = text.indexOf("\n", i);
      i = newline < 0 ? text.length : newline;
    } else if (c === "'") {
      const close = text.indexOf("'", i + 1);
      if (close < 0) throw new ParseError("unclosed '");
      current().value += text.slice(i + 1, close);
      i = close + 1;
    } else if (c === '"') {
      const w = current();
      let j = i + 1;
      while (j < text.length && text[j] !== '"') {
        const d = text[j];
        if (d === "\\" && j + 1 < text.length && '"\\$`\n'.includes(text[j + 1])) {
          if (text[j + 1] !== "\n") w.value += text[j + 1];
          j += 2;
        } else if (d === "$" && text[j + 1] === "(") {
          const close = matchingParen(text, j + 2);
          w.dynamic = true;
          w.subst.push(text.slice(j + 2, close));
          j = close + 1;
        } else if (d === "`") {
          const close = text.indexOf("`", j + 1);
          if (close < 0) throw new ParseError("unclosed `");
          w.dynamic = true;
          w.subst.push(text.slice(j + 1, close));
          j = close + 1;
        } else {
          if (d === "$") w.dynamic = true;
          w.value += d;
          j++;
        }
      }
      if (j >= text.length) throw new ParseError('unclosed "');
      i = j + 1;
    } else if (c === "\\") {
      if (text[i + 1] !== "\n") current().value += text[i + 1] ?? "";
      i += 2;
    } else if (c === "$" && text[i + 1] === "(") {
      const close = matchingParen(text, i + 2);
      const w = current();
      w.dynamic = true;
      w.subst.push(text.slice(i + 2, close));
      i = close + 1;
    } else if (c === "`") {
      const close = text.indexOf("`", i + 1);
      if (close < 0) throw new ParseError("unclosed `");
      const w = current();
      w.dynamic = true;
      w.subst.push(text.slice(i + 1, close));
      i = close + 1;
    } else if (c === ">" || c === "<") {
      // `2>` and `&>`: the digit or the ampersand in front belongs to the redirection.
      if (word && (/^\d+$/.test(word.value) || word.value === "&")) word = null;
      else end();
      out.push({ redir: true });
      i++;
    } else {
      const op = operatorAt(text, i);
      if (op) {
        end();
        out.push({ op });
        i += op.length;
      } else {
        const w = current();
        if (c === "$" || c === "*" || c === "?" || c === "[" || (c === "~" && w.value === "")) w.dynamic = true;
        w.value += c;
        i++;
      }
    }
  }
  end();
  return out;
}
