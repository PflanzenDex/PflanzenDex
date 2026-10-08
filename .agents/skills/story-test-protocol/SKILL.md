---
name: story-test-protocol
description: Use when a story has flows that automated tests do not cover (real login, browser behavior, mobile layout, visual states) and before marking it done. Runs the flow by hand against the real app and writes a testprotocol with screenshots in Docs/test-logs.
---

# Story test protocol

Automated tests come first (skill `spec-to-tests`). The protocol covers what they cannot: real services, the browser, layout and wording. It reports honestly; unchecked items say so (D-05).

1. Run `make ci` first and record the result as section 0 ("Gates"). Do not start the manual test on a red build.
2. Start the real stack with its own ports (`make worktree` gives each worktree separate ports; `make dev` starts API and web, `make auth-up` the sign-in service). Note anything you had to change at runtime that is not in the repo (for example a redirect address), in the header.
3. Create the file `docs/records/test-logs/<story-id-lowercase>.md` (existing examples: `docs/records/test-logs/lic-05.md`, `docs/records/test-logs/acc-01.md`) and a folder with the same name for screenshots. Language English, like the existing protocols; quote UI texts as they appear in the app (German).
4. Header, as in the examples: title with story ID and issue, branch, environment (OS, Node, ports, browser, date), method, legend `✅ wie erwartet · ⚠️ funktioniert, aber Auffälligkeit · ❌ error · ⏭️ nicht geprüft`.
5. One section per acceptance criterion of the story, each with "Erwartet" and "Beobachtet". Cite tests where a criterion is covered automatically and separate that from what you did by hand.
6. Take screenshots for each state at desktop 1440×900 and mobile 375×812, named `NN-<state>-desktop.png` and `NN-<state>-mobil.png`. Check mobile: no horizontal scroll, tap targets at least 48 px.
7. Mark assumptions (limits, start values) as ⚠️ with "assumption" (P-08). Mark everything you did not do as ⏭️; never write ✅ for something only a test shows without saying so.
8. End with "Offene Punkte": follow-up work, known limits, and anything environment-specific. Link the protocol from the PR description under "Test evidence".
9. A ❌ or an unexpected ⚠️ becomes a failing automated test first where possible, then a fix, then the protocol is updated.

## Check

```bash
make ci
```

Expected: green; the protocol file and screenshot folder exist under `docs/records/test-logs/` and every acceptance criterion of the story has a section.
