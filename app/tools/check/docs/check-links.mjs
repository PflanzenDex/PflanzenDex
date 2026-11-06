#!/usr/bin/env node

import { readFileSync, existsSync, readdirSync, lstatSync } from "fs";
import { resolve, dirname, join, relative, sep } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// This file sits in app/tools/check/docs/, so the repository root is four levels up.
const repoRoot = resolve(__dirname, "../../../..");

// Dependencies, build output and test reports, named as .gitignore lists them. Hidden entries (.git,
// .worktrees, .cache, .github, .claude, ...) are skipped by the walker as well.
const GENERATED_DIR_NAMES = new Set([
  "node_modules",
  "dist",
  "playwright-report",
  "test-results",
  "one-screen-report",
  "a11y-routes-report",
]);

// Vitest writes coverage next to each package: app/coverage and app/packages/<pkg>/coverage. A folder named
// coverage anywhere else is source (app/tools/check/quality/coverage) and is read.
function isCoverageOutput(dir, entry) {
  if (entry !== "coverage") {
    return false;
  }
  const parts = relative(repoRoot, dir).split(sep);
  return (
    (parts.length === 1 && parts[0] === "app") ||
    (parts.length === 3 && parts[0] === "app" && parts[1] === "packages")
  );
}

// Simple recursive directory walker for markdown files
function walkDir(dir) {
  const files = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);

    // Skip ignored patterns
    if (
      GENERATED_DIR_NAMES.has(entry) ||
      isCoverageOutput(dir, entry) ||
      entry.startsWith(".") ||
      fullPath.includes("/docs/records/spikes/") ||
      fullPath.includes("/docs/records/test-logs/") ||
      fullPath.includes("/docs/guides/roadmap.md") ||
      (fullPath.includes("/app/") && fullPath.endsWith("/CHANGELOG.md"))
    ) {
      continue;
    }

    // lstat, not stat: a symbolic link is not followed, so nothing outside the repository is read through one
    // and a link loop cannot recurse forever. A file that a link points to is read where it lies.
    const stat = lstatSync(fullPath);
    if (stat.isSymbolicLink()) {
      continue;
    }

    if (stat.isDirectory()) {
      files.push(...walkDir(fullPath));
    } else if (entry.endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files;
}

const files = walkDir(repoRoot).map((f) => f.substring(repoRoot.length + 1));

let brokenLinks = [];
// Files that could not be read. Such a file was not checked, so the run fails for it (US-QG-04).
let unreadableFiles = [];

// Regular expression to find markdown links
// Matches [text](path) and [text](path#anchor)
// Excludes http(s)://, mailto:, and pure #anchor links
const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

for (const file of files) {
  const filePath = join(repoRoot, file);
  const fileDir = dirname(filePath);

  try {
    const content = readFileSync(filePath, "utf-8");
    let match;

    while ((match = linkRegex.exec(content)) !== null) {
      const text = match[1];
      const href = match[2];

      // Skip external URLs and mailto links
      if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:")) {
        continue;
      }

      // Skip pure anchor links
      if (href.startsWith("#")) {
        continue;
      }

      // Extract the file path and anchor
      const [filePart] = href.split("#");

      // Resolve the target file path
      const targetPath = resolve(fileDir, filePart);

      // Check if the file exists
      if (!existsSync(targetPath)) {
        // Count line number by finding the position in content
        const position = match.index;
        const lineNumber = content.substring(0, position).split("\n").length;

        brokenLinks.push({
          file,
          line: lineNumber,
          href,
          text,
        });
      }
    }
  } catch (error) {
    unreadableFiles.push({ file, message: error.message });
  }
}

if (brokenLinks.length > 0) {
  console.error("\nBroken links found:\n");
  for (const link of brokenLinks) {
    console.error(`${link.file}:${link.line} [${link.text}](${link.href})`);
  }
  console.error(`\nTotal broken links: ${brokenLinks.length}`);
}

if (unreadableFiles.length > 0) {
  console.error("\nMarkdown files that cannot be read:\n");
  for (const { file, message } of unreadableFiles) {
    console.error(`${file}: cannot be read (${message})`);
  }
  console.error(`\n${unreadableFiles.length} of ${files.length} Markdown files were not checked.`);
}

// Success is reported only when every file was read and no link is broken (US-QG-04).
if (brokenLinks.length > 0 || unreadableFiles.length > 0) {
  process.exit(1);
} else {
  console.log(`All relative links are valid (${files.length} Markdown files checked).`);
  process.exit(0);
}
