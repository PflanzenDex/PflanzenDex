# Test log: #249 footer contrast

Fix: `.version-footer` used `opacity: 0.6` (4.01:1 on the light background). It now uses `color: var(--leise)` without opacity.

| Check | Result |
|---|---|
| Unit test of the contrast ratio (`style-contrast.test.ts`), red before the fix (`issue-249-red.txt`: 2 of 3 failing) | ✅ red, then 3 of 3 green |
| `make ci` on own test DB (port 54400) | ✅ exit 0 |
| Playwright + axe (wcag2a, wcag2aa) on the landing page, 1440x900 and 375x812, light and dark | ✅ no violations, footer colour `rgb(79, 99, 85)` light / `rgb(169, 189, 174)` dark, opacity 1 (`issue-249/observation.json`, screenshots `issue-249/footer-*.png`) |
| Logged-in Bestand view (where axe found the finding before) | ⏭️ not run; only the landing page was checked, the footer rule is global |
