import { expect, test } from "claude-code/testing";
import type { On } from "claude-code";

// US-DEV-08, issue 2376: the status panel shows worktrees, the heavy lock, owner-merge PRs and my claim drafts.

const ROOT = "/repo";
const PANE = {
  plugin: "status-panel",
  component: "Pane",
  requestId: "status-panel",
  props: {
    title: "PflanzenDex",
    isFocused: false,
    bodyColumns: 60,
    placement: "dock",
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const;

const WORKTREES = [
  `worktree ${ROOT}\nHEAD a\nbranch refs/heads/dev`,
  `worktree ${ROOT}/.worktrees/fix-issue-1-a\nHEAD b\nbranch refs/heads/fix/issue-1-a`,
  `worktree ${ROOT}/.worktrees/chore-issue-2-b\nHEAD c\nbranch refs/heads/chore/issue-2-b`,
].join("\n\n");

const PRS = [
  {
    number: 11,
    title: "fix: a",
    headRefName: "fix/issue-1-a",
    isDraft: false,
    labels: [{ name: "owner-merge" }],
    statusCheckRollup: [
      {
        name: "ci-status",
        status: "COMPLETED",
        conclusion: "FAILURE",
        startedAt: "2026-11-20T10:00:00Z",
      },
    ],
  },
  {
    number: 12,
    title: "chore: b",
    headRefName: "chore/issue-2-b",
    isDraft: true,
    labels: [],
    statusCheckRollup: [
      {
        name: "ci-status",
        status: "IN_PROGRESS",
        conclusion: null,
        startedAt: "2026-11-20T10:00:00Z",
      },
    ],
  },
];

const RUN = {
  command: "status-panel",
  args: "",
  origin: { kind: "composer" },
  presentation: { isFullscreen: false, columns: 100 },
} as const;

type World = { worktrees: string; hasGh: boolean; note: string | null };

function engine(on: On, world: World) {
  on("command.register", () => ({ value: { command: "status-panel" } }));
  on("ui.open", () => ({ value: { isPlaced: true } }));
  on("ui.status", () => ({ value: undefined }));
  on("clock.now", () => ({ value: Date.parse("2026-11-20T09:30:00Z") }));
  on("fs.read", (_, e) => {
    if (world.note === null) throw new Error("ENOENT");
    expect(String(e.path)).toBe(`${ROOT}/.git/heavy-job.owner`);

    return { value: world.note };
  });
  on("process.run", (_, e) => {
    const a = e.argv.join(" ");
    const out = (exitCode: number, stdout: string) => ({
      value: { exitCode, stdout, stderr: "", isStdoutTruncated: false, isStderrTruncated: false },
    });
    if (a.includes("--git-common-dir")) return out(0, `${ROOT}/.git\n`);
    if (a.includes("worktree list")) return out(0, world.worktrees);
    if (a.startsWith("kill -0")) return out(0, "");
    if (!world.hasGh) return out(1, "");
    if (a.includes("viewer")) return out(0, "someone\n");
    if (a.includes("pr list")) return out(0, JSON.stringify(PRS));
    if (a.includes("issue list") && a.includes("--assignee someone")) {
      return out(0, JSON.stringify([{ number: 2 }]));
    }

    return out(1, "");
  });
}

test("US-DEV-08 the pane shows worktrees, a held lock, owner-merge and my claim drafts", async ($, on) => {
  engine(on, {
    worktrees: WORKTREES,
    hasGh: true,
    note: `4242 ${ROOT}/.worktrees/fix-issue-1-a e2e 2026-11-20T09:00:00Z\n`,
  });

  const ran = await $.command.run(RUN);
  expect(ran.text).toContain("owner-merge (1)");
  expect(ran.text).toContain("Open claim drafts (someone): 1");
  expect(ran.text).toContain("(over 20 min!)");

  for (const surface of ["terminal", "desktop", "mobile"] as const) {
    const ui = await $.ui.mount({ ...PANE, surface });
    expect((await ui.find({ type: "Text", text: /#11/ }))?.text).toContain("✗ #11 fix-issue-1-a");
    expect((await ui.find({ type: "Text", text: /#12/ }))?.text).toContain("… #12 draft");
    expect((await ui.find({ type: "Text", text: /held by/ }))?.text).toContain(
      "e2e (fix-issue-1-a)",
    );
    await ui.unmount();
  }
});

test("US-DEV-08 without gh and without worktrees it shows the local parts quietly", async ($, on) => {
  engine(on, {
    worktrees: `worktree ${ROOT}\nHEAD a\nbranch refs/heads/dev`,
    hasGh: false,
    note: null,
  });

  const ran = await $.command.run(RUN);
  expect(ran.text).toContain("no worktrees");
  expect(ran.text).toContain("Heavy lock: free");
  expect(ran.text).toContain("local parts only");
  expect(ran.text).not.toContain("error");
});
