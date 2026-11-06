// Quarterly review of the principles register (US-QG-06, criterion 4; spec 19, gate health, quarterly).
// Lists every gated and checked entry whose Evidence has no Caught line dated within the last three months.
// Report only: it prints the list and exits 0, so it never fails CI. The owner keeps each listed entry with a reason
// in its Evidence or lowers its maturity in a PR of its own. Run it with `make principles-review`.
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  monthsBefore,
  parseCaught,
  parseEntry,
  readRegister,
  SECTIONS,
  today,
} from "./check-principles.mjs";

export const WINDOW_MONTHS = 3;
const REVIEWED = ["gated", "checked"];

// The window is the calendar days from `cutoff` to `now`, both included.
// files: { "PRIN-001-x.md": text }, as readRegister returns them.
export function reviewRows(files, now) {
  const cutoff = monthsBefore(now, WINDOW_MONTHS);
  const reviewed = Object.values(files)
    .map((text) => parseEntry(text))
    .filter(({ meta }) => REVIEWED.includes(meta.maturity));
  const rows = [];
  for (const { meta, sections } of reviewed) {
    const dates = (sections[SECTIONS.evidence] ?? "")
      .split("\n")
      .map((line) => parseCaught(line)?.date)
      .filter(Boolean)
      .sort();
    const last = dates.at(-1) ?? "";
    if (last >= cutoff) continue;
    rows.push({
      id: meta.id,
      title: meta.title,
      maturity: meta.maturity,
      last,
      blocking: meta.blocking_from ?? "",
    });
  }
  return { cutoff, now, total: reviewed.length, rows };
}

export function reviewToMarkdown({ cutoff, now, total, rows }) {
  const head = [
    "### Principles review (US-QG-06, quarterly)",
    "",
    `${rows.length} of ${total} gated and checked entries have no Caught line dated ${cutoff} to ${now}.`,
    "Keep each one with a reason in its Evidence, or lower its maturity in a PR of its own. Report only.",
    "",
  ];
  if (!rows.length) return head.join("\n");
  const table = [
    "| ID | Principle | Maturity | Last Caught | blocking_from |",
    "|---|---|---|---|---|",
    ...rows.map(
      (r) => `| ${r.id} | ${r.title} | ${r.maturity} | ${r.last || "none"} | ${r.blocking} |`,
    ),
    "",
  ];
  return [...head, ...table].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  console.log(reviewToMarkdown(reviewRows(readRegister(root), today())));
}
