// Central constants (FR-QG-12, QG-C9): thresholds and enum values are named once and imported.
//  - constants/no-magic-number wraps the typescript-eslint extension of `no-magic-numbers`: an inline number other
//    than 0, 1, -1, an array index or a default value is reported (`const LIMIT = 5` and limit objects are fine).
//    A number inside the initializer of a module-level `const NAME_LIKE_THIS` is the definition of a named constant
//    and is allowed.
//    HTTP status codes of the API are protocol constants, not domain thresholds, and are allowed.
//  - constants/no-enum-literal reports a string literal that is a value of an exported `as const` array of core
//    (`export const SPECIMEN_STATUS = ["plant", ...] as const`) when it is used as a key (===, !==, ==, !=, a
//    `case` label or the argument of `.includes()`) outside the file that defines the value.
// Known hits are counted per file in constants-baseline.json; a listed file may keep up to its count (`max`),
// check-constants.mjs keeps that list exact.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tseslint from "typescript-eslint";

const CORE_SRC = fileURLToPath(new URL("../../../../packages/core/src", import.meta.url));
const COMPARISONS = new Set(["===", "!==", "==", "!="]);
const ENUM_ARRAY = /export const ([A-Z][A-Z0-9_]*)\s*=\s*\[([^\]]*)\]\s*as const/g;
const STRING_VALUE = /"([^"\\\n]*)"|'([^'\\\n]*)'/g;
const CONSTANT_NAME = /^[A-Z][A-Z0-9_]*$/;
const isTestFile = (f) => /\.(test|spec)\.tsx?$|test-helpers|\.fake\.ts$|\.d\.ts$/.test(f);

// HTTP status codes used by the API (protocol constants), allowed inline.
export const HTTP_STATUS_CODES = [
  200, 201, 202, 204, 301, 302, 304, 400, 401, 403, 404, 405, 409, 410,
];
export const NUMBER_OPTIONS = {
  ignore: [0, 1, -1, ...HTTP_STATUS_CODES],
  ignoreArrayIndexes: true,
  ignoreDefaultValues: true,
  enforceConst: false,
  detectObjects: false,
  ignoreNumericLiteralTypes: true,
  ignoreEnums: true,
  ignoreTypeIndexes: true,
  ignoreReadonlyClassProperties: true,
};

function* sourceFiles(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* sourceFiles(full);
    else if (/\.tsx?$/.test(e.name) && !isTestFile(e.name)) yield full;
  }
}

// value -> [{ name, file }] for every exported `as const` string array under `root` (files as absolute paths).
export function collectEnumValues(root = CORE_SRC) {
  const values = new Map();
  for (const file of sourceFiles(root)) {
    for (const [, name, body] of fs.readFileSync(file, "utf8").matchAll(ENUM_ARRAY)) {
      for (const m of body.matchAll(STRING_VALUE)) {
        const value = m[1] ?? m[2];
        const list = values.get(value) ?? [];
        if (!list.some((d) => d.name === name && d.file === file)) list.push({ name, file });
        values.set(value, list);
      }
    }
  }
  return values;
}

const budgetSchema = [
  {
    type: "object",
    properties: { max: { type: "integer", minimum: 0 } },
    additionalProperties: false,
  },
];

// Collects the reports of `find`, then reports all of them unless their number stays within `max`.
function budgeted(context, find) {
  const max = context.options[0]?.max;
  const found = [];
  const visitors = find((report) => found.push(report));
  const exit = visitors["Program:exit"];
  return {
    ...visitors,
    "Program:exit"(node) {
      exit?.(node);
      if (max !== undefined && found.length <= max) return;
      for (const r of found)
        context.report({ ...r, data: { ...r.data, count: found.length, max } });
    },
  };
}

// True when the node sits in the initializer of a module-level `const UPPER_CASE = …`: that is a named constant.
function inNamedConstant(node) {
  for (let n = node.parent; n; n = n.parent) {
    if (n.type !== "VariableDeclarator") continue;
    const decl = n.parent;
    const top = decl.parent?.type === "Program" || decl.parent?.type === "ExportNamedDeclaration";
    return (
      top && decl.kind === "const" && n.id.type === "Identifier" && CONSTANT_NAME.test(n.id.name)
    );
  }
  return false;
}

const magicRule = tseslint.plugin.rules["no-magic-numbers"];
const noMagicNumber = {
  meta: {
    type: "suggestion",
    docs: { description: "Thresholds are named constants in the module's limits" },
    schema: budgetSchema,
    messages: {
      magic:
        "Inline number {{raw}}: move it to a named constant in the module's limits (FR-QG-12).",
    },
  },
  create(context) {
    return budgeted(context, (add) => {
      const inner = Object.create(context, {
        options: { value: [NUMBER_OPTIONS] },
        report: {
          value: ({ node, data }) =>
            !inNamedConstant(node) &&
            add({ node, messageId: "magic", data: { raw: data?.raw ?? String(node.value) } }),
        },
      });
      return magicRule.create(inner, [NUMBER_OPTIONS]);
    });
  },
};

const describe = (defs) =>
  defs
    .slice(0, 3)
    .map(
      (d) =>
        `${d.name}[…] in ${path
          .relative(path.dirname(path.dirname(CORE_SRC)), d.file)
          .split(path.sep)
          .join("/")}`,
    )
    .join(" or ");

export function createNoEnumLiteral(values) {
  return {
    meta: {
      type: "suggestion",
      docs: { description: "Enum values are compared through their constant, not as literals" },
      schema: budgetSchema,
      messages: {
        literal: '"{{value}}" is {{where}}; use the constant (FR-QG-12).',
      },
    },
    create(context) {
      return budgeted(context, (add) => {
        const here = path.resolve(context.filename);
        const check = (node) => {
          if (node?.type !== "Literal" || typeof node.value !== "string") return;
          const defs = values.get(node.value);
          if (!defs || defs.some((d) => d.file === here)) return;
          add({ node, messageId: "literal", data: { value: node.value, where: describe(defs) } });
        };
        return {
          BinaryExpression(node) {
            if (!COMPARISONS.has(node.operator)) return;
            check(node.left);
            check(node.right);
          },
          SwitchCase: (node) => check(node.test),
          CallExpression(node) {
            const { callee } = node;
            if (callee.type === "MemberExpression" && callee.property.name === "includes")
              check(node.arguments[0]);
          },
        };
      });
    },
  };
}

export default {
  rules: {
    "no-magic-number": noMagicNumber,
    "no-enum-literal": createNoEnumLiteral(collectEnumValues()),
  },
};
