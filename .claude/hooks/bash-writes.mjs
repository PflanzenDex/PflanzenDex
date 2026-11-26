// Bash commands that write a gate file (US-QG-07, issue 2554, round 2). This is the first of two layers: the Bash guard judges the
// command before it runs, and the fingerprint of the gate files (after-bash) catches what a shell did anyway. The command is read
// the way a shell splits its words, and each write target is judged. Pure: the caller answers whether a path is a gate file
// (run.mjs: case-corrected, with the links followed), and opts tell it about folders, hard links and the caller's actor.
// Verdicts: deny for a gate file, a folder that holds gate files, a hard link, a hook record, and any unclear target from a
// subagent; ask for an unclear target from the main session and for a tool that can rewrite the tree.
import path from "node:path";
import { ParseError, tokenize } from "./shell-words.mjs";

const MAX_DEPTH = 8;
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);
// Programs that run code given as text: their arguments and heredoc bodies are judged as script text.
const SCRIPT_PROGRAM = /^(?:python[\d.]*|node|perl|ruby|php|deno|bun|awk|gawk)$/;
// Words in front of a command that run the command after them. Their options and numbers go with them.
const WRAPPERS = new Set([
  "sudo",
  "doas",
  "env",
  "command",
  "builtin",
  "exec",
  "nohup",
  "time",
  "nice",
  "ionice",
  "timeout",
  "stdbuf",
  "caffeinate",
  "setsid",
  "strace",
  "watch",
  "parallel",
  "script",
  "flock",
]);
// Wrappers whose first operand is no command (a lock file, a typescript file).
const ONE_OPERAND_WRAPPERS = new Set(["flock", "script"]);
// Options of a wrapper that take the next word as their value.
// (`time -p` is a flag; `sudo -p prompt` takes a value.)
const VALUED_WRAPPER_OPTIONS = {
  sudo: new Set(["-u", "-g", "-C", "-h", "-p", "-r", "-t", "-U"]),
  doas: new Set(["-u", "-C"]),
  timeout: new Set(["-s", "-k"]),
  nice: new Set(["-n"]),
  ionice: new Set(["-c", "-n", "-p", "-P", "-u"]),
  strace: new Set(["-o", "-e", "-p", "-s"]),
  watch: new Set(["-n", "-d"]),
  flock: new Set(["-w", "-E"]),
};
// Make targets that rewrite files of the tree (issue 2554): their recipes are not read, so the command is unclear.
const MAKE_WRITERS = new Set(["format", "layout-fix", "layout-baseline", "ds-snapshots"]);
// The commands that stand for another program (gsed is GNU sed on macOS).
const programOf = (word) => {
  const name = path.basename(word);
  return name === "gsed" || name === "ssed" ? "sed" : name;
};
const COMPOUND = new Set([
  "{",
  "}",
  "!",
  "if",
  "then",
  "else",
  "elif",
  "fi",
  "do",
  "done",
  "while",
  "until",
]);
const ASSIGNMENT = /^[A-Za-z_]\w*=/;
const INLINE_CODE = /^-[a-zA-Z]*c[a-zA-Z]*$/; // sh -c, -lc, -ec
// Commands whose operands are written (or removed), and the editors that write the file they open.
const WRITES_OPERANDS = new Set([
  "tee",
  "truncate",
  "unlink",
  "shred",
  "sponge",
  "vim",
  "vi",
  "ed",
  "ex",
  "nano",
  "emacs",
  "pico",
]);
const REMOVES = new Set(["rm", "mv"]);
// Commands that copy or link: the destination (the folder of -t, else the last operand) is written.
const COPIES = new Set(["cp", "install", "rsync", "ln"]);
// Tools that may rewrite any file of the tree: the Edit tool is the way for a gate file.
const WHOLE_TREE = new Set(["patch", "tar", "unzip", "cpio", "bsdtar", "7z", "unrar"]);
// git subcommands that may rewrite the tree, and those that write the paths they are given.
const WHOLE_TREE_GIT = new Set([
  "apply",
  "am",
  "merge",
  "rebase",
  "cherry-pick",
  "revert",
  "pull",
  "stash",
]);
const GIT_PATH_OPS = new Set(["checkout", "restore", "rm", "mv"]);
const OUTPUT_OPTIONS = new Map([
  ["curl", ["-o", "--output"]],
  ["wget", ["-O", "--output-document"]],
]);
const XARGS_VALUED = new Set(["-I", "-n", "-d", "-P", "-L", "-s", "-a", "-E"]);
// Script text that writes a file: an open for writing (Python, Ruby, Perl, Node), a write or a delete call, or an in-place option.
const WRITE_TEXT = [
  // Modes that write: w, a, x, w+, a+, r+, wb, ab, and their + and b forms (round 3). A read mode (r, rb) does not match.
  /\bopen(?:Sync)?\s*\([^;]*?(?:['"](?=[rwaxb+]{1,3}['"])[rwaxb+]*[wax+][rwaxb+]*['"]|['"]\+?>{1,2})/,
  /\bopen\s+\w+\s*,\s*['"]\+?>{1,2}/,
  /\.write_(?:text|bytes)\b/,
  /\b(?:writeFile|appendFile|copyFile|rename|unlink|rmdir|truncate|rm|cp)(?:Sync)?\b|\b(?:writeSync|createWriteStream)\b/,
  /\bshutil\.(?:copy\w*|move)\b/,
  /\bos\.(?:rename|replace|remove|unlink|truncate)\b/,
  /\bFile\.(?:write|delete)\b|\bIO\.(?:write|binwrite|copy_stream)\b|\bFileUtils\./,
  /(?:^|\s)(?:-[A-Za-z]*i|--inplace)/,
];
// Words of a script that may name a file: split on quotes, spaces and the punctuation of a call.
const CANDIDATE_SPLIT = /[\s'"`(){}[\],=:;<>|&+]+/;
// awk writes with `print > "file"`; sed writes with its `w file` command and the `w` flag of `s///`.
const AWK_REDIRECT = />\s*(?:"([^"]*)"|'([^']*)'|([^\s;}()]+))/g;
const SED_WRITE = /(?:^|[\s;{}!/\d$])[wW]\s+(\S+)/g;
// A heredoc: its head (with the rest of the line) and its body up to the end word (quoted or not, indented or not).
const HEREDOC = /<<-?[ \t]*(['"]?)(\w+)\1([^\n]*)\n[\s\S]*?\n\s*\2(?=\n|$)/g;
const FD_DUPLICATE = /^&(\d+|-)$/;
const IN_PLACE = { sed: /^-[nErsuz]*i/, perl: /^-[pnaclswWx0-9]*i/ };
const SED_OPTIONS = {
  scriptFlag: (v) => /^-[a-zA-Z]*[ef]$/.test(v) || /^--(expression|file)(=|$)/.test(v),
  valued: (v) => /^-[a-zA-Z]*[efl]$/.test(v) || /^--(expression|file|line-length)$/.test(v),
};
const PERL_OPTIONS = {
  scriptFlag: (v) => /^-[a-zA-Z]*[eE]$/.test(v),
  valued: (v) => /^-[a-zA-Z]*[eEIMm]$/.test(v),
};
// A hook record: the name of a record or a glob that can match one (issue 2554). Quotes and backslashes are dropped first.
const RECORD_TARGET = /claude-g|\.git\/.*[*?[].*(log\.jsonl|\.json)/i;
const HOOK_MODULE =
  /(?:^|[\s/'"`])(?:gate-(?:log|confirmations|seal|allow|fingerprint|names|guard)|run)\.mjs\b/;

const finding = (decision, file, reason) => ({ decision, file, reason });
const deny = (label) =>
  finding(
    "deny",
    label,
    `This command writes a gate file (${label}). Agents change gate files only with the Edit or Write tool, where the owner is asked (US-QG-07, issue 2554). Use the Edit tool.`,
  );
const denyRecord = (label) =>
  finding(
    "deny",
    label,
    `This command writes a hook record (${label}). Only the hook and the make targets write the records (US-QG-07, issue 2554).`,
  );
const denyFolder = (label) =>
  finding(
    "deny",
    label,
    `This command writes or removes a folder (${label}) that holds gate files. Use the Edit tool for each gate file (US-QG-07, issue 2554).`,
  );
const denyLink = (label) =>
  finding(
    "deny",
    label,
    `This command writes through a hard link (${label}), a second name of a file that may be a gate file. Use the Edit tool (US-QG-07, issue 2554).`,
  );
// An unclear target: the main session is asked, a subagent is refused (Subagents do not edit gate files, issue 2554).
const unclear = (ctx, label, reason) =>
  finding(
    ctx.subagent ? "deny" : "ask",
    label,
    ctx.subagent
      ? `${reason} Subagents do not edit gate files, so this command is refused. Report it to the ticket lead (US-QG-07, issue 2554).`
      : `${reason} Use the Edit tool for a gate file (US-QG-07, issue 2554).`,
  );
const askDynamic = (ctx, label) =>
  unclear(
    ctx,
    label,
    `This command writes to a path that cannot be read (${label}), and the path may be a gate file.`,
  );
const askUnknownFolder = (ctx, label) =>
  unclear(
    ctx,
    label,
    `This command writes ${label}, and the folder it runs in is not known, so the path may be a gate file.`,
  );
const askWholeTree = (ctx, name) =>
  unclear(
    ctx,
    name,
    `This command can rewrite any file of the tree (${name}), so it may write a gate file.`,
  );
const denyUnreadable = (label) =>
  finding(
    "deny",
    label,
    `This command cannot be read well enough to see its write targets, and it names a gate file (${label}). Use the Edit tool for a gate file, or write the command as plain commands (US-QG-07, issue 2554).`,
  );

// The heredocs of a text: each body is taken out of the text and kept with the line of its head, which says what runs it.
function splitHeredocs(text) {
  const bodies = [];
  const stripped = text.replace(HEREDOC, (match, _quote, _word, rest, offset) => {
    const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
    bodies.push({
      text: match.slice(match.indexOf("\n") + 1),
      line: text.slice(lineStart, offset) + rest,
    });
    return `<<heredoc${rest}`;
  });
  return { text: stripped, bodies };
}

// The simple commands of a token list: words and redirections of each, split at the operators. A redirection takes the next word.
// `>>` and `<<<` are several tokens; `>&word` is `&` and the word; `>|word` is `|` and the word. A command after a pipe knows the
// command before it (pipedFrom), so that `echo text | sh` judges the text.
function simpleCommands(tokens) {
  const commands = [];
  let current = null;
  let last = null;
  let pipeNext = false;
  const start = () => {
    current ??= { words: [], redirs: [], pipedFrom: pipeNext ? last : null };
    pipeNext = false;
    return current;
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.op !== undefined) {
      if (current) {
        commands.push(current);
        last = current;
      }
      current = null;
      pipeNext = t.op === "|" || t.op === "|&";
    } else if (t.redir) {
      const cmd = start();
      const group = [t];
      while (tokens[i + 1]?.redir) group.push(tokens[++i]);
      const dirs = group.map((g) => g.dir);
      const writes = dirs.includes(">");
      let target = tokens[i + 1];
      if (writes && ((target?.value === "&" && !target.dynamic) || target?.op === "|"))
        target = tokens[(i += 1) + 1];
      if (target && target.op === undefined && !target.redir) {
        cmd.redirs.push({
          dir: writes ? ">" : "<",
          target,
          herestring: !writes && group.length >= 3,
        });
        i++;
      }
    } else {
      start().words.push(t);
    }
  }
  if (current) commands.push(current);
  return commands;
}

// The words of the command itself: assignments, compound words, `function NAME`, and wrappers in front are skipped.
function unwrap(words) {
  let i = 0;
  let wrapped = false;
  let wrapper = null;
  let operands = 0;
  while (i < words.length) {
    const { value, dynamic } = words[i];
    if (!dynamic && ASSIGNMENT.test(value)) i++;
    else if (!dynamic && value === "function" && !wrapped) i += 2;
    else if (wrapped && operands > 0 && !value.startsWith("-")) {
      operands--;
      i++;
    } else if (wrapped && VALUED_WRAPPER_OPTIONS[wrapper]?.has(value)) i += 2;
    else if (wrapped && /^(-|\d+(\.\d+)?[smhd]?$)/.test(value)) i++;
    else if (!dynamic && (COMPOUND.has(value) || WRAPPERS.has(value))) {
      wrapped = WRAPPERS.has(value);
      wrapper = wrapped ? value : null;
      if (ONE_OPERAND_WRAPPERS.has(value)) operands = 1;
      i++;
    } else break;
  }
  return words.slice(i);
}

// The operands of a command: the words that are not options. After `--` every word is an operand.
function operands(args) {
  const out = [];
  let options = true;
  for (const arg of args) {
    if (options && arg.value === "--") options = false;
    else if (options && arg.value.startsWith("-") && arg.value !== "-") continue;
    else out.push(arg);
  }
  return out;
}

// The files of a sed or perl call: the operands without the options' values. Without a script option the first operand is the
// script, which is no file (`sed -i 's/a/b/' Makefile`).
function fileOperands(args, { scriptFlag, valued }) {
  const files = [];
  let hasScript = false;
  let options = true;
  for (let i = 0; i < args.length; i++) {
    const value = args[i].value;
    if (options && value === "--") options = false;
    else if (options && value.startsWith("-") && value !== "-") {
      if (scriptFlag(value)) hasScript = true;
      if (valued(value)) i++;
    } else files.push(args[i]);
  }
  return hasScript ? files : files.slice(1);
}

const isInPlace = (program, args) =>
  args.some(
    (a) =>
      (program === "sed" && (a.value === "--in-place" || a.value.startsWith("--in-place="))) ||
      IN_PLACE[program].test(a.value),
  );

// The destination of cp, install, rsync and ln: the folder of -t, else the last operand; and the operands that are sources.
function destinationOf(args) {
  const t = args.findIndex((a) => a.value === "-t" || a.value === "--target-directory");
  if (t >= 0)
    return { dest: args[t + 1], sources: operands(args).filter((a) => a !== args[t + 1]) };
  const attached = args.find((a) => a.value.startsWith("--target-directory="));
  if (attached) {
    const dest = { ...attached, value: attached.value.slice("--target-directory=".length) };
    return { dest, sources: operands(args) };
  }
  const ops = operands(args);
  return { dest: ops.at(-1), sources: ops.slice(0, -1) };
}

// The texts a regular expression captures, one per match (the first group that matched).
const captures = (pattern, text) =>
  [...text.matchAll(pattern)].map((m) => m.slice(1).find((g) => g !== undefined)).filter(Boolean);

// Adjacent string pieces are one word: "Make"+"file" and "Make" "file" (issue 2554).
const joinFragments = (text) => text.replace(/["'`]\s*\+?\s*["'`]/g, "");

// The words of a script that may name a file: awk's output redirections, and every word of a text that writes.
function scriptWrites(text, program) {
  const redirected = program === "awk" || program === "gawk" ? captures(AWK_REDIRECT, text) : [];
  const joined = joinFragments(text);
  if (!WRITE_TEXT.some((pattern) => pattern.test(joined))) return redirected;
  return [...redirected, ...joined.split(CANDIDATE_SPLIT).filter(Boolean)];
}

// The path a word names from one folder: an absolute path, or a relative one from the folder (null when the folder is unknown).
function pathFrom(base, word) {
  if (path.isAbsolute(word)) return path.resolve(word);
  return base === null ? null : path.resolve(base, word);
}

// `a{b,c}d` as its alternatives (one level, up to 64 words).
function expandBraces(word) {
  const m = /\{([^{}]*,[^{}]*)\}/.exec(word);
  if (!m) return [word];
  const out = m[1]
    .split(",")
    .flatMap((alt) =>
      expandBraces(word.slice(0, m.index) + alt + word.slice(m.index + m[0].length)),
    );
  return out.length > 64 ? [word] : out;
}

// A glob as a regular expression (case-insensitive: this disk is case-insensitive, issue 2554).
function globRegExp(pattern) {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else if (c === "[" && pattern.indexOf("]", i + 1) > i) {
      const end = pattern.indexOf("]", i + 1);
      re += pattern.slice(i, end + 1);
      i = end;
    } else re += c.replace(/[.+^${}()|\\/[\]]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "i");
}

// Judges one write target (a word of a command) from every folder the shell may be in (issue 2554). A static path is a gate file, a
// folder that holds gate files (when `containsGates`), or a hard link. A glob counts its wildcards as one character and also
// matches the gate files as patterns. A variable, a substitution or an unknown folder is unclear.
function judgeTarget(word, ctx, { containsGates = false } = {}) {
  const value = word.value;
  if (value === "-" || (value === "" && word.subst.length === 0)) return;
  for (const alt of word.dynamic
    ? [word]
    : expandBraces(value).map((v) => ({ ...word, value: v }))) {
    judgeOne(alt, ctx, containsGates);
  }
}

function judgeOne(word, ctx, containsGates) {
  const value = word.value;
  if (RECORD_TARGET.test(value.replace(/["'\\]/g, ""))) {
    ctx.found.push(denyRecord(value));
    return;
  }
  const globbed = /[*?[]/.test(value);
  const probe = word.dynamic ? value.replace(/[*?[\]]/g, "x") : value;
  if (word.dynamic && globbed) {
    for (const base of ctx.bases) {
      if (base === null) continue;
      const pattern = path.resolve(base, value);
      if (ctx.gatePaths.some((gate) => globRegExp(pattern).test(gate))) {
        ctx.found.push(deny(value));
        return;
      }
    }
  }
  const tilde = probe.startsWith("~");
  let unknown = tilde;
  for (const base of ctx.bases) {
    const abs = tilde ? null : pathFrom(base, probe);
    if (abs === null) {
      unknown = true;
      continue;
    }
    if (ctx.isGate(abs)) return ctx.found.push(deny(value));
    if (ctx.linked(abs)) return ctx.found.push(denyLink(value));
    if (containsGates && ctx.gatesIn(abs)) return ctx.found.push(denyFolder(value));
  }
  if (word.unclear || (word.dynamic && (/[$`]/.test(probe) || word.subst.length > 0)))
    ctx.found.push(askDynamic(ctx, value));
  else if (unknown) ctx.found.push(askUnknownFolder(ctx, value));
}

// Words that a script may write: each names a file from every known folder. A word with no known folder is skipped.
function checkWords(words, ctx) {
  for (const word of words) {
    for (const base of ctx.bases) {
      const abs = pathFrom(base, word);
      if (abs !== null && ctx.isGate(abs)) return ctx.found.push(deny(word));
    }
  }
}

// `cd <folder>`: the folder after it is added to the folders the shell may be in, so a write later on is judged from either.
// A folder the command cannot name (a variable, a substitution, `~`, no argument, `-`) is unknown (null).
function changeFolder(args, ctx) {
  const targets = args.filter((a) => a.value !== "--" && !/^-[LPe@]+$/.test(a.value));
  const target = targets.length === 1 ? targets[0] : null;
  if (
    !target ||
    target.dynamic ||
    target.value === "" ||
    target.value === "-" ||
    target.value.startsWith("~")
  ) {
    ctx.bases.add(null);
    return;
  }
  for (const base of [...ctx.bases]) ctx.bases.add(pathFrom(base, target.value));
}

// A word that the command does not know (the input of xargs, the {} of find): its target is unclear, never a known path.
const dynamicWord = (value) => ({ value, dynamic: true, subst: [], unclear: true });

// The write targets of one command, by the command's name (issue 2554).
function judgeNamed(name, args, ctx, depth, cmd) {
  const text = args.map((a) => a.value).join(" ");
  if (name === "cd" || name === "pushd") return changeFolder(args, ctx);
  if (name === "popd") return ctx.bases.add(null);
  if (name === "eval") return judgeScript(text, ctx, depth + 1);
  if (name === "osascript") {
    for (const m of text.matchAll(/do shell script\s+"((?:[^"\\]|\\.)*)"/g))
      judgeScript(m[1].replace(/\\"/g, '"'), ctx, depth + 1);
    return checkWords(scriptWrites(text, "generic"), ctx);
  }
  if ((SHELLS.has(name) || SCRIPT_PROGRAM.test(name)) && judgeScriptFile(name, args, ctx, depth))
    return undefined;
  if (name === "make" && args.some((a) => MAKE_WRITERS.has(a.value)))
    return ctx.found.push(
      askWholeTree(ctx, `make ${args.find((a) => MAKE_WRITERS.has(a.value)).value}`),
    );
  if (SHELLS.has(name)) {
    const c = args.findIndex((a) => INLINE_CODE.test(a.value));
    if (c >= 0 && args[c + 1]) judgeScript(args[c + 1].value, ctx, depth + 1);
    else if (cmd?.redirs.some((r) => r.herestring))
      judgeScript(cmd.redirs.find((r) => r.herestring).target.value, ctx, depth + 1);
    else if (
      cmd?.pipedFrom &&
      ["echo", "printf"].includes(path.basename(cmd.pipedFrom.words[0]?.value ?? ""))
    )
      judgeScript(
        cmd.pipedFrom.words
          .slice(1)
          .map((w) => w.value)
          .join(" "),
        ctx,
        depth + 1,
      );
    return undefined;
  }
  if (name === "sed") {
    if (isInPlace("sed", args)) fileOperands(args, SED_OPTIONS).forEach((a) => judgeTarget(a, ctx));
    return checkWords(captures(SED_WRITE, text), ctx);
  }
  if (name === "dd") {
    for (const a of args.filter((x) => x.value.startsWith("of=")))
      judgeTarget({ ...a, value: a.value.slice(3) }, ctx);
    return undefined;
  }
  if (name === "find") return judgeFind(args, ctx, depth);
  if (name === "xargs") return judgeXargs(args, ctx, depth);
  if (name === "git") return judgeGit(args, ctx);
  if (["npx", "pnpx", "bunx"].includes(name)) {
    const rest = args.filter((a) => !a.value.startsWith("-"));
    if (rest.length === 0) return undefined;
    const [tool, ...toolArgs] = args.slice(args.indexOf(rest[0]));
    return judgeNamed(path.basename(tool.value), toolArgs, ctx, depth, cmd);
  }
  if (COPIES.has(name)) return judgeCopy(name, args, ctx);
  if (OUTPUT_OPTIONS.has(name)) {
    const flags = OUTPUT_OPTIONS.get(name);
    args.forEach((a, k) => {
      if (flags.includes(a.value) && args[k + 1]) judgeTarget(args[k + 1], ctx);
      else if (a.value.startsWith(`${flags.at(-1)}=`))
        judgeTarget({ ...a, value: a.value.slice(flags.at(-1).length + 1) }, ctx);
    });
    return undefined;
  }
  if (REMOVES.has(name))
    return operands(args).forEach((a) => judgeTarget(a, ctx, { containsGates: true }));
  if (WRITES_OPERANDS.has(name)) return operands(args).forEach((a) => judgeTarget(a, ctx));
  if (name === "prettier" && args.some((a) => a.value === "--write" || a.value === "-w"))
    return operands(args).forEach((a) => judgeTarget(a, ctx));
  if (name === "perl" && isInPlace("perl", args))
    fileOperands(args, PERL_OPTIONS).forEach((a) => judgeTarget(a, ctx));
  if (WHOLE_TREE.has(name)) return ctx.found.push(askWholeTree(ctx, name));
  if (SCRIPT_PROGRAM.test(name)) {
    if (
      args.some((a) => /^(-e|--eval|-p|--print|--input-type)/.test(a.value)) &&
      HOOK_MODULE.test(text)
    )
      ctx.found.push(denyRecord(`${name}: the hook modules`));
    // A write whose path is computed (a decoding, a join) cannot be read: the name of the file is not in the text (issue 2554).
    const joinedText = joinFragments(text);
    if (
      WRITE_TEXT.some((p) => p.test(joinedText)) &&
      /base64|fromCharCode|atob|decodeURI|String\.raw|\bjoin\(|\.reverse\(/.test(text)
    )
      ctx.found.push(askWholeTree(ctx, `${name} script with a computed path`));
    if (cmd?.redirs.some((r) => r.herestring))
      checkWords(scriptWrites(cmd.redirs.find((r) => r.herestring).target.value, name), ctx);
    return checkWords(scriptWrites(text, name), ctx);
  }
  return undefined;
}

// cp, install, rsync, ln: the destination and the file that lands in it (a source's name in the destination folder).
function judgeCopy(name, args, ctx) {
  const { dest, sources } = destinationOf(args);
  if (!dest) return;
  const recursive = args.some(
    (a) => /^-[a-zA-Z]*[rRa]/.test(a.value) || a.value === "--recursive" || a.value === "--archive",
  );
  // ln: a hard link is a second name of the source file, and a symbolic link points at the source: both sources are judged.
  if (name === "ln") for (const src of sources) judgeTarget(src, ctx);
  judgeTarget(dest, ctx, { containsGates: recursive || name === "ln" });
  if (dest.dynamic) return;
  for (const src of sources) {
    if (src.dynamic) continue;
    const landing = path.posix.join(dest.value, path.posix.basename(src.value));
    judgeTarget({ value: landing, dynamic: false, subst: [] }, ctx, { containsGates: recursive });
  }
}

// find -exec: the command of each exec action judged with its {} as an unknown path; -delete removes what it finds.
function judgeFind(args, ctx, depth) {
  for (let i = 0; i < args.length; i++) {
    if (args[i].value === "-delete") ctx.found.push(askWholeTree(ctx, "find -delete"));
    if (["-exec", "-execdir", "-ok", "-okdir"].includes(args[i].value)) {
      const segment = [];
      for (let j = i + 1; j < args.length && ![";", "+"].includes(args[j].value); j++)
        segment.push(args[j]);
      if (segment.length > 0)
        judgeNamed(
          path.basename(segment[0].value),
          segment.slice(1).map(asDynamicIfBrace),
          ctx,
          depth + 1,
        );
      i += segment.length + 1;
    }
  }
}

const asDynamicIfBrace = (a) => (a.value === "{}" || a.value === "{}+" ? dynamicWord(a.value) : a);

// xargs: its command is judged with the words it reads from the input as unknown operands.
function judgeXargs(args, ctx, depth) {
  let i = 0;
  while (i < args.length && args[i].value.startsWith("-"))
    i += XARGS_VALUED.has(args[i].value) ? 2 : 1;
  const command = args.slice(i);
  if (command.length === 0) return;
  const replaced = command.map(asDynamicIfBrace);
  judgeNamed(
    path.basename(replaced[0].value),
    [...replaced.slice(1), dynamicWord("<input>")],
    ctx,
    depth + 1,
  );
}

// git: the subcommands that rewrite the tree are judged as a whole; the ones that write the paths they name judge those paths.
function judgeGit(args, ctx) {
  let i = 0;
  while (i < args.length && args[i].value.startsWith("-"))
    i += ["-C", "-c", "--git-dir", "--work-tree"].includes(args[i].value) ? 2 : 1;
  const sub = args[i]?.value;
  if (WHOLE_TREE_GIT.has(sub)) return ctx.found.push(askWholeTree(ctx, `git ${sub}`));
  if (GIT_PATH_OPS.has(sub))
    operands(args.slice(i + 1)).forEach((a) =>
      judgeTarget(a, ctx, { containsGates: sub === "rm" || sub === "mv" }),
    );
  return undefined;
}

// One simple command: its substitutions and redirections are judged, then the command by its name.
function judgeSimple(command, ctx, depth) {
  const words = [...command.words, ...command.redirs.map((r) => r.target)];
  for (const word of words) for (const inner of word.subst) judgeScript(inner, ctx, depth + 1);
  for (const { dir, target } of command.redirs) {
    if (dir !== ">" || FD_DUPLICATE.test(target.value)) continue;
    judgeTarget(
      target.value.startsWith("&") ? { ...target, value: target.value.slice(1) } : target,
      ctx,
    );
  }
  if (command.words[0]?.value === "env") {
    const split = command.words.findIndex((w) => w.value === "-S" || w.value === "--split-string");
    if (split > 0 && command.words[split + 1])
      judgeScript(command.words[split + 1].value, ctx, depth + 1);
  }
  const argv = unwrap(command.words);
  if (argv.length === 0) return;
  const [head, ...args] = argv;
  if (head.dynamic) return args.forEach((a) => judgeTarget(a, ctx));
  // An alias defined earlier in the text stands for its value (issue 2554): `alias s=sed; s -i ...` judges `sed -i ...`.
  if (programOf(head.value) === "alias") {
    for (const a of args) {
      const eq = a.value.indexOf("=");
      if (eq > 0) ctx.aliases.set(a.value.slice(0, eq), a.value.slice(eq + 1));
    }
    return undefined;
  }
  if (ctx.aliases.has(head.value))
    return judgeScript(
      [ctx.aliases.get(head.value), ...args.map((a) => a.value)].join(" "),
      ctx,
      depth + 1,
    );
  return judgeNamed(programOf(head.value), args, ctx, depth, command);
}

// A shell or an interpreter that runs a script file (issue 2554): a shell's file is judged as commands when it can be read, an
// interpreter's file is left to the fingerprint layer, and a file that cannot be read is unclear. False when the command runs
// inline code (-c, -e) or reads its input, which the other rules judge.
function judgeScriptFile(name, args, ctx, depth) {
  // awk's first operand is its program, not a file (awk -f would name one).
  if (name === "awk" || name === "gawk") return false;
  if (
    args.some(
      (a) =>
        ["-c", "-e", "--eval", "-p", "--print"].includes(a.value) ||
        /^-[a-zA-Z]*[ce]$/.test(a.value),
    )
  )
    return false;
  const file = args.find((a) => !a.value.startsWith("-") && !a.dynamic);
  if (!file) return false;
  let text;
  for (const base of ctx.bases) {
    if (base === null) continue;
    text = ctx.readScript(pathFrom(base, file.value));
    if (text !== undefined) break;
  }
  if (typeof text !== "string") {
    ctx.found.push(
      unclear(
        ctx,
        file.value,
        `This command runs ${file.value}, whose writes cannot be read here.`,
      ),
    );
  } else if (SHELLS.has(name)) judgeScript(text, ctx, depth + 1);
  return true;
}

// The text of a command line: every simple command in order, then the heredoc bodies that a shell or a script runs. A body is
// judged by the line that starts it (`python3 - <<EOF`, `cat <<EOF | sh`).
function judgeScript(raw, ctx, depth) {
  if (depth > MAX_DEPTH) throw new ParseError("nested too deep");
  const { text, bodies } = splitHeredocs(raw);
  for (const command of simpleCommands(tokenize(text))) judgeSimple(command, ctx, depth);
  for (const body of bodies) {
    const words = body.line.split(/[\s;&|()`$<>"']+/);
    if (words.some((w) => SHELLS.has(w) || w === "eval" || w === "source"))
      judgeScript(body.text, ctx, depth + 1);
    if (words.some((w) => SCRIPT_PROGRAM.test(w)))
      checkWords(scriptWrites(body.text, "generic"), ctx);
    if (words.includes("sed")) checkWords(captures(SED_WRITE, body.text), ctx);
  }
}

// The verdict for a Bash command: null when it writes no gate file, else { decision, reason, file }. A deny wins over an ask.
// `cwd` is the folder the shell is in. `isGate(absolutePath)` answers for a gate file (case-corrected, links followed). `opts`:
// subagent (the actor), gatesIn(absolutePath) (a folder holds gate files), linked(absolutePath) (a hard link), gatePaths (the gate
// files as absolute paths, for globs).
export function bashGateWrite(raw, cwd, isGate, opts = {}) {
  const ctx = {
    bases: new Set([path.resolve(cwd)]),
    isGate,
    found: [],
    subagent: opts.subagent === true,
    gatesIn: opts.gatesIn ?? (() => false),
    linked: opts.linked ?? (() => false),
    gatePaths: opts.gatePaths ?? [],
    // The text of a script file that the command runs: undefined when it is missing, null when it cannot be read.
    readScript: opts.readScript ?? (() => undefined),
    aliases: new Map(),
  };
  if (/(^|[;&|(\s])(source|\.)\s+<\(/.test(raw))
    ctx.found.push(askWholeTree(ctx, "source of a process substitution"));
  try {
    judgeScript(raw, ctx, 0);
  } catch (error) {
    if (!(error instanceof ParseError)) throw error;
    // The writes cannot be seen: a gate file named in the text is refused, and nothing else is.
    for (const word of raw.split(CANDIDATE_SPLIT).filter(Boolean))
      for (const base of ctx.bases) {
        const abs = pathFrom(base, word);
        if (abs !== null && isGate(abs)) return denyUnreadable(word);
      }
  }
  return ctx.found.find((f) => f.decision === "deny") ?? ctx.found[0] ?? null;
}
