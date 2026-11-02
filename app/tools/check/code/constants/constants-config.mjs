// ESLint flat-config blocks of the constants gate (FR-QG-12, QG-C9), spread into eslint.config.js.
// Known hits are counted per file in constants-baseline.json; a listed file may keep up to its count.
// check-constants.mjs runs with CONSTANTS_BASELINE=off and keeps the list exact. Numbers: core and api; enum
// literals: core, api and web. Tests, helpers, fakes and stories hold sample data.
import fs from "node:fs";
import constants from "./eslint-constants.mjs";

const ignores = [
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/*.spec.ts",
  "**/*.stories.tsx",
  "**/test-helpers*.ts",
  "**/*-test-helpers.ts",
  "**/*.fake.ts",
  "**/test-global-setup.ts",
  "packages/web/src/lib/page-stories/**",
  "packages/web/src/lib/test-setup/**",
];
const numberFiles = ["packages/core/src/**/*.ts", "packages/api/src/**/*.ts"];
const enumFiles = [...numberFiles, "packages/web/src/**/*.ts", "packages/web/src/**/*.tsx"];
const baseline =
  process.env.CONSTANTS_BASELINE === "off"
    ? []
    : JSON.parse(
        fs.readFileSync(
          new URL("../../../../config/gates/baselines/constants-baseline.json", import.meta.url),
          "utf8",
        ),
      ).entries;

export const constantsConfigs = [
  {
    files: numberFiles,
    ignores,
    plugins: { constants },
    rules: { "constants/no-magic-number": "error" },
  },
  {
    files: enumFiles,
    ignores,
    plugins: { constants },
    rules: { "constants/no-enum-literal": "error" },
  },
  ...baseline.map((e) => ({
    files: [e.file],
    rules: {
      ...(e.numbers && { "constants/no-magic-number": ["error", { max: e.numbers }] }),
      ...(e.enums && { "constants/no-enum-literal": ["error", { max: e.enums }] }),
    },
  })),
];
