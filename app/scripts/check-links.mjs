#!/usr/bin/env node

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// Simple recursive directory walker for markdown files
function walkDir(dir) {
  const files = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    // Skip ignored patterns
    if (
      entry === "node_modules" ||
      entry.startsWith(".") ||
      fullPath.includes("/Docs/spikes/") ||
      fullPath.includes("/Docs/testprotokolle/") ||
      fullPath.includes("/ROADMAP.md") ||
      (fullPath.includes("/app/") && fullPath.endsWith("/CHANGELOG.md"))
    ) {
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
    console.error(`Error reading file ${file}: ${error.message}`);
  }
}

if (brokenLinks.length > 0) {
  console.error("\nBroken links found:\n");
  for (const link of brokenLinks) {
    console.error(`${link.file}:${link.line} [${link.text}](${link.href})`);
  }
  console.error(`\nTotal broken links: ${brokenLinks.length}`);
  process.exit(1);
} else {
  console.log("All relative links are valid.");
  process.exit(0);
}
