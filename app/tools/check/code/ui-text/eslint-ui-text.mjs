// UI texts live in message tables (FR-QG-26, ADR 0004): JSX text, user-facing props and toast or announcer
// messages in app/packages/web/src may not be string literals. A text with no letter (punctuation, numbers,
// symbols such as "·" or "–") is not a UI text. Known literals are counted per file in ui-text-baseline.json;
// a file listed there is allowed up to its count (`max`), check-ui-text.mjs keeps that list exact.

const LETTER = /\p{L}/u;

// Props whose value a user reads or hears. Props named …Label or …Text count as well.
export const USER_FACING_PROPS = new Set([
  "aria-label",
  "aria-description",
  "aria-roledescription",
  "aria-valuetext",
  "title",
  "placeholder",
  "alt",
  "label",
  "description",
  "hint",
  "help",
  "caption",
  "heading",
  "message",
  "text",
]);
const USER_FACING_SUFFIX = /[a-z](Label|Text)$/;

// Calls whose message argument is shown or announced: toast.show({ message, action: { label } }) and announce("…").
const MESSAGE_KEYS = new Set(["message", "label"]);

export const isUserFacingProp = (name) =>
  USER_FACING_PROPS.has(name) || USER_FACING_SUFFIX.test(name);

const hasLetter = (text) => LETTER.test(text);

// The string literals an expression can evaluate to: plain strings, templates and the branches of `a ? b : c`
// and `a ?? b` / `a || b`. Other expressions (variables, calls, table lookups) are not literals.
function literalNodes(node) {
  if (!node) return [];
  if (node.type === "Literal" && typeof node.value === "string")
    return hasLetter(node.value) ? [node] : [];
  if (node.type === "TemplateLiteral")
    return node.quasis.some((q) => hasLetter(q.value.cooked ?? "")) ? [node] : [];
  if (node.type === "ConditionalExpression")
    return [...literalNodes(node.consequent), ...literalNodes(node.alternate)];
  if (node.type === "LogicalExpression")
    return [...literalNodes(node.left), ...literalNodes(node.right)];
  if (node.type === "JSXExpressionContainer") return literalNodes(node.expression);
  return [];
}

function messageLiterals(objectNode) {
  if (objectNode?.type !== "ObjectExpression") return [];
  return objectNode.properties.flatMap((p) => {
    if (p.type !== "Property" || p.key.type !== "Identifier") return [];
    if (p.value.type === "ObjectExpression") return messageLiterals(p.value);
    return MESSAGE_KEYS.has(p.key.name) ? literalNodes(p.value) : [];
  });
}

function isMessageCall(callee) {
  if (callee.type === "Identifier") return callee.name === "announce";
  if (callee.type !== "MemberExpression" || callee.property.type !== "Identifier") return false;
  const { name } = callee.property;
  if (name === "announce") return true;
  return name === "show" && callee.object.type === "Identifier" && callee.object.name === "toast";
}

const noLiteralText = {
  meta: {
    type: "problem",
    docs: {
      description: "UI texts come from a message table (*.de.json), not from string literals",
    },
    schema: [
      {
        type: "object",
        properties: { max: { type: "integer", minimum: 0 } },
        additionalProperties: false,
      },
    ],
    messages: {
      literal:
        "UI text as a literal: move it into the feature's *.de.json and read it through texts() (FR-QG-26).",
      overBaseline:
        "UI text as a literal: this file has {{count}} literal UI texts, ui-text-baseline.json allows {{max}} (FR-QG-26).",
    },
  },
  create(context) {
    const max = context.options[0]?.max;
    const found = [];
    const add = (nodes) => found.push(...nodes);
    return {
      JSXText(node) {
        if (hasLetter(node.value)) found.push(node);
      },
      JSXExpressionContainer(node) {
        if (node.parent.type === "JSXElement" || node.parent.type === "JSXFragment")
          add(literalNodes(node.expression));
      },
      JSXAttribute(node) {
        if (node.name.type === "JSXIdentifier" && isUserFacingProp(node.name.name))
          add(literalNodes(node.value));
      },
      CallExpression(node) {
        if (!isMessageCall(node.callee)) return;
        const [first] = node.arguments;
        add(first?.type === "ObjectExpression" ? messageLiterals(first) : literalNodes(first));
      },
      "Program:exit"() {
        if (max !== undefined && found.length <= max) return;
        const messageId = max === undefined ? "literal" : "overBaseline";
        for (const node of found)
          context.report({ node, messageId, data: { count: found.length, max } });
      },
    };
  },
};

export default { rules: { "no-literal-text": noLiteralText } };
