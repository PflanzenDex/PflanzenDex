// DS-48 (DESIGN-SYSTEM.md): AST detection of raw controls outside components/ui, used by check-design-system-rules.mjs.
import ts from "typescript";

const RAW_TAGS = new Set(["button", "input", "select", "textarea", "form"]);
const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "checkbox",
  "switch",
  "radio",
  "tab",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "textbox",
  "searchbox",
  "combobox",
  "slider",
  "spinbutton",
  "treeitem",
]);

const attrOf = (opening, name) =>
  opening.attributes.properties.find((a) => ts.isJsxAttribute(a) && a.name.getText() === name);
// Static string value of a JSX attribute, or undefined when it is dynamic or absent.
function staticValue(attr) {
  const init = attr?.initializer;
  if (init === undefined) return undefined;
  if (ts.isStringLiteral(init)) return init.text;
  if (ts.isJsxExpression(init) && init.expression && ts.isStringLiteralLike(init.expression))
    return init.expression.text;
  return undefined;
}
const openingOf = (node) => (ts.isJsxElement(node) ? node.openingElement : node);

// DS-48 (issue 452): why an element is a raw control, or undefined when it is not one.
function rawControl(opening) {
  const tag = opening.tagName.getText();
  if (RAW_TAGS.has(tag)) return tag;
  if (INTERACTIVE_ROLES.has(staticValue(attrOf(opening, "role")))) return "role";
  if (tag === "a" && attrOf(opening, "onClick")) {
    const href = attrOf(opening, "href");
    const value = staticValue(href);
    if (href === undefined || value === "#" || /^javascript:/i.test(value ?? "")) return "a";
  }
  return undefined;
}

// DS-48: raw controls outside components/ui, found in the TypeScript AST. The direct children of
// an element with `asChild` are exempt: the parent primitive renders them (Radix Slot). So is a
// `<form>` directly under the `Form` provider (DS-47/DS-48; no `<form>` primitive exists).
export function rawControlLines(content, file = "file.tsx") {
  const source = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const exempt = new Set();
  const found = [];
  const visit = (node) => {
    if (ts.isJsxElement(node)) {
      // The DS pattern is `<Form {...form}><form>`: the native form under the provider is allowed.
      const asChild = attrOf(node.openingElement, "asChild") !== undefined;
      const provider = node.openingElement.tagName.getText() === "Form";
      for (const child of node.children) {
        const isElement = ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child);
        if (isElement && (asChild || (provider && openingOf(child).tagName.getText() === "form")))
          exempt.add(child);
      }
    }
    if ((ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) && !exempt.has(node)) {
      const opening = openingOf(node);
      if (rawControl(opening) !== undefined)
        found.push(source.getLineAndCharacterOfPosition(opening.getStart(source)).line + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}
