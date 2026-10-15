#!/usr/bin/env node
// US-DEV-12: run a command with shortened output. The full output goes to a log file.
import { spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_TAIL = 15; // assumption, decided by the PO
const MAX_FAILURE_LINES = 20; // assumption, decided by the PO
const FAILURE_PATTERN = /\berror\b|\bFAIL\b|✗|Error:/i;

export function parseArgs(argv) {
  const sep = argv.indexOf("--");
  if (sep === -1 || sep === argv.length - 1) throw new Error("missing command after --");
  const opts = { tail: DEFAULT_TAIL, log: undefined, command: argv.slice(sep + 1) };
  for (let i = 0; i < sep; i += 2) {
    if (argv[i] === "--tail") opts.tail = Number(argv[i + 1]);
    else if (argv[i] === "--log") opts.log = argv[i + 1];
    else throw new Error(`unknown option ${argv[i]}`);
  }
  if (!Number.isInteger(opts.tail) || opts.tail < 0) throw new Error("--tail needs a number");
  return opts;
}

export function digest(lines, tail) {
  const failures = lines.filter((l) => FAILURE_PATTERN.test(l)).slice(0, MAX_FAILURE_LINES);
  return { failures, tail: tail > 0 ? lines.slice(-tail) : [] };
}

export function runQuiet({ tail, log, command }) {
  const started = Date.now();
  const logPath = log ?? join(process.cwd(), ".cache", "agent-logs", `run-${started}.log`);
  mkdirSync(dirname(logPath), { recursive: true });
  const fd = openSync(logPath, "w");
  const res = spawnSync(command[0], command.slice(1), { stdio: ["inherit", fd, fd] });
  closeSync(fd);
  if (res.error) writeFileSync(logPath, `${res.error.message}\n`, { flag: "a" });
  const code = res.status ?? (res.error ? 127 : 1);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const head = `${code === 0 ? "ok" : "FAILED"}: exit ${code} in ${seconds}s, full log: ${logPath}`;
  if (code === 0) return { code, report: head };
  const lines = readFileSync(logPath, "utf8").split("\n");
  while (lines.length && lines.at(-1) === "") lines.pop();
  const d = digest(lines, tail);
  const parts = [head];
  if (d.failures.length) parts.push("--- failure lines ---", ...d.failures);
  if (d.tail.length) parts.push(`--- last ${d.tail.length} lines ---`, ...d.tail);
  return { code, report: parts.join("\n") };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const res = runQuiet(parseArgs(process.argv.slice(2)));
    console.log(res.report);
    process.exitCode = res.code;
  } catch (e) {
    console.error(
      `usage: node app/tools/dev/agent/quiet.mjs [--tail N] [--log file] -- <command...>\n${e.message}`,
    );
    process.exitCode = 2;
  }
}
