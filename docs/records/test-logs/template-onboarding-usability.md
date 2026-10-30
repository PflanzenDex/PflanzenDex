# Usability test: introduction and first plant (epic ONB, US-ONB-08)

Template. Copy it to `docs/records/test-logs/onb-usability-<date>.md` for every run and fill it in. Record what was observed. Never invent results: a cell without an observation stays empty or says "not observed".

**Date:**
**Version / commit of the app:**
**Environment (device, browser, screen size):**
**Moderator / observer:**
**Release or PR the run belongs to:** (link it in the release PR, US-DEV-06)
**Order or unlock rules changed since the last run (yes / no, what):**

## 1. Method

- 3 to 5 casual users (people who do not keep plants regularly, never saw the app). Recruit on the day, no briefing about the app.
- Real app, fresh account per person, phone-sized screen (360 px wide) first.
- Task given in one sentence: "Lege deine erste Pflanze an." No help, no hints from the moderator. The moderator answers questions only with "What would you do?".
- Screen recording or notes with time stamps; screenshots of every place where the person hesitated.
- Consent for recording and notes is asked before the test; no names in the log, only P1 to P5.

## 2. Targets (starting values, assumptions; from US-ONB-08)

The operator area ("Betreiber", section "Einstieg") shows the same targets from existing data (account and first plant creation dates, aggregated, from 5 accounts on). The test below adds what numbers cannot show: where people hesitate and what they ask.

| Measure                                       | Target             |
| --------------------------------------------- | ------------------ |
| Time from first open to the saved first plant | at most 90 seconds |
| Steps to the saved first plant                | at most 3          |
| Help or outside explanation needed            | none               |
| Abandonment before the first plant            | none in the test   |

## 3. Results per person

| Person | Age group / plant experience | Time to first plant (s) | Steps | Questions asked (wording) | Help given (yes / no, what) | Abandoned (yes / no, where) | Hesitation or wrong turn (screen, what) |
| ------ | ---------------------------- | ----------------------- | ----- | ------------------------- | --------------------------- | --------------------------- | --------------------------------------- |
| P1     |                              |                         |       |                           |                             |                             |                                         |
| P2     |                              |                         |       |                           |                             |                             |                                         |
| P3     |                              |                         |       |                           |                             |                             |                                         |
| P4     |                              |                         |       |                           |                             |                             |                                         |
| P5     |                              |                         |       |                           |                             |                             |                                         |

Median time: (calculated from the table, empty if fewer than 3 values)

## 4. Follow-up questions (asked after the task)

| Question                                                                                                 | P1  | P2  | P3  | P4  | P5  |
| -------------------------------------------------------------------------------------------------------- | --- | --- | --- | --- | --- |
| What did you expect to happen after saving the plant?                                                    |     |     |     |     |     |
| Was anything unclear? Which word or screen?                                                              |     |     |     |     |     |
| What would you want to do next? Did the app offer it?                                                    |     |     |     |     |     |
| Did you see functions you cannot use yet? Did you understand why and how to open them? (after US-ONB-05) |     |     |     |     |     |
| Did a hint disturb you? (after US-ONB-07)                                                                |     |     |     |     |     |

## 5. Checks by the observer (yes / no / not observed)

- First screen is the first plant, no location or light zone asked before (US-ONB-01, US-ONB-02):
- Light need prefilled and changeable, unknown shown as unknown (US-ONB-01):
- No explanatory paragraph needed to continue (US-ONB-01):
- Locked functions visible with reason and way; unlock by tap works (US-ONB-05):
- Keeper style chosen or skipped without confusion (US-ONB-03):
- Hints dismissible and not repeated (US-ONB-07):
- Function overview "Was die App kann" found without help (US-ONB-06):

## 6. Findings

| No. | Finding (what happened, where) | Seen by (persons) | Severity (blocks / slows / cosmetic) | Issue (label `epic:ONB`) |
| --- | ------------------------------ | ----------------- | ------------------------------------ | ------------------------ |
|     |                                |                   |                                      |                          |

## 7. Conclusion

Targets met (per measure, yes / no / not enough data):

Next step (P-09): (open issues, repeat the run after the change, link in the release PR)
