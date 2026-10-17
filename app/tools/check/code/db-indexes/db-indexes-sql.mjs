// SQL helpers for the index gate (US-QG-07): turn a migration into normalized statements and split lists.

/**
 * Statements of a migration: comments and dollar-quoted bodies removed, string literals emptied, lower case,
 * quotes and `public.` removed, whitespace collapsed. Function bodies are not schema, so they are dropped whole.
 */
export function statements(text) {
  let out = "";
  for (let i = 0; i < text.length;) {
    const two = text.slice(i, i + 2);
    const tag = text.slice(i).match(/^\$[a-z_]*\$/i)?.[0];
    if (two === "--") {
      const nl = text.indexOf("\n", i);
      i = nl < 0 ? text.length : nl;
    } else if (two === "/*") {
      const end = text.indexOf("*/", i + 2);
      i = end < 0 ? text.length : end + 2;
    } else if (tag) {
      const end = text.indexOf(tag, i + tag.length);
      i = end < 0 ? text.length : end + tag.length;
      out += " $body ";
    } else if (text[i] === "'") {
      let j = i + 1;
      while (j < text.length && !(text[j] === "'" && text[j + 1] !== "'"))
        j += text[j] === "'" ? 2 : 1;
      i = j + 1;
      out += "''";
    } else out += text[i++];
  }
  return out
    .split(";")
    .map((s) =>
      s.toLowerCase().replaceAll('"', "").replaceAll("public.", "").replace(/\s+/g, " ").trim(),
    )
    .filter(Boolean);
}

/** Splits `text` at commas outside parentheses. */
export function splitTop(text) {
  const parts = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") depth--;
    else if (text[i] === "," && depth === 0) {
      parts.push(text.slice(from, i).trim());
      from = i + 1;
    }
  }
  parts.push(text.slice(from).trim());
  return parts.filter(Boolean);
}

/** The text between the first `(` and its matching `)`, and what follows it. */
export function parenGroup(text) {
  const start = text.indexOf("(");
  if (start < 0) return { inner: "", rest: text };
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")" && --depth === 0)
      return { inner: text.slice(start + 1, i), rest: text.slice(i + 1).trim() };
  }
  return { inner: text.slice(start + 1), rest: "" };
}

/** Leading plain column names of an index or key list; stops at the first expression such as `lower(name)`. */
export function leadingColumns(list) {
  const cols = [];
  for (const item of splitTop(list)) {
    const name = item.match(/^[a-z_]\w*/)?.[0];
    // `lower(name)` and `a + b` are expressions; `name desc` and `name text_pattern_ops` are plain columns.
    if (!name || !(item.length === name.length || item[name.length] === " ") || item.includes("("))
      break;
    cols.push(name);
  }
  return cols;
}
