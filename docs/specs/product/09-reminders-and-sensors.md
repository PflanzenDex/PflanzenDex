# 09 – Epic MON: Reminders, Watering and Sensors

Goal: the system gets in touch when something needs doing, instead of waiting for a visit. Later, sensors measure what is estimated so far.

Prototype reference: epic MON was only a spec there (no code). Here **phase 1 (reminders and watering log) is part of the core product**, because an app can do notifications natively. The sensor phase stays for later and depends on hardware decisions.

## Problem

1. **Pull system:** phase changes, overdue treatments and measurements become visible only on opening.
2. **No measurement data:** watering, room climate and real light intensity are estimates.

## User stories

### US-MON-01 · Be notified only when action is needed · ⬜ new

As a **plant keeper** I want a notification only when something needs doing, and no "all ok" messages.

Acceptance criteria:

- A daily job (time adjustable, default 08:00 in the user's time zone) checks the triggers from US-MON-02 to -05 and sends at most **one bundled** message.
- The message contains actions ("watered", "done", "moved") that execute directly, without searching the app.
- The same occasion is not reported twice on the same day (idempotency).
- Without need for action nothing is sent.
- Channel: web push; Telegram or email are optional (E-10).

### US-MON-02 · Be reminded at the phase change · ⬜ new (prototype: spec)

Acceptance criteria: trigger = the dormancy phase begins or ends today **and** the location is still the old one. The calculation is the same as in `US-PHA-01`, not rewritten (FR-MON-03).

### US-MON-03 · Be reminded of a due treatment · ⬜ new

Acceptance criteria: trigger = open treatment with date ≤ today. "Done" in the message ticks it off (US-BEH-03).

### US-MON-04 · Be reminded of an overdue measurement · ⬜ new

Acceptance criteria: trigger = last measurement older than N days (default 30, adjustable) or none. Cuttings per decision (FR-WAC-08).

### US-MON-05 · Be reminded to water by interval without a sensor · ⬜ new

As a **plant keeper** I want watering reminders and a watering log also without a sensor.

Acceptance criteria:

- New data: watering interval per species and phase (growth/dormancy, days) and watering log per specimen (`Date`, `Source: manual | sensor`).
- Trigger = last entry + interval of the **current** phase ≤ today.
- "Watered" (in the app or the message) writes a log entry; bulk action for several specimens.
- Starting values for intervals come from the species' watering hint and are adjustable.

### US-MON-06 · Capture soil moisture by sensor · ⬜ new (later)

Acceptance criteria:

- A rise by at least X percentage points within a short time counts as watering; the system writes an entry with `Source: sensor`.
- If the value falls below the threshold of the **current** phase, the system reports; for specimens with a sensor this replaces the interval reminder.
- The assignment sensor → specimen is a record (US-EQU-06), no code change.
- Calibration per pot (dry, wet); without it percentage values are not comparable.

### US-MON-07 · See climate and sensor status · ⬜ new (later)

Acceptance criteria:

- Per sensor: type, current value, 24 h minimum/maximum, last reception.
- "Status outdated" if the overall state is older than 1 day; sensor "silent" if the last reception is older than 6 hours (battery, Wi-Fi, cable).
- Climate: display and warning on outliers (e.g. plant in dormancy clearly warmer than its dormancy location), no control.
- Light measurement per zone once with a phone app (PPFD), with date and method (US-EQU-03).

### US-MON-08 · Control reminders · ⬜ new

Acceptance criteria:

- Per occasion (phase, treatment, measurement, watering, swap, friends) on/off, time, quiet hours.
- An occasion can be paused ("do not remind for a week") without losing data.
- Switching off a reminder does not change the calculation; "Today" still shows everything due (FR-MON-03).

## Requirements

### DM-MON-01 Data

`Watering_Interval_Days` per species: `{Growth, Dormancy}`; `Watering_Log` per specimen: `{Date, Source}`; `Sensor`: `{Id, Type, Specimen? or area, Calibration, Thresholds}`; `Measurement_Series`: raw values outside the user data, aggregated into `Sensor_Status`.

### Functional

| ID        | Requirement                                                                                                                                       | Status               |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| FR-MON-01 | The reminder logic is pure, tested logic (P-01), not bound to the delivery channel.                                                               | ⬜                   |
| FR-MON-02 | Reminders only when action is needed, once per occasion and day.                                                                                  | ⬜                   |
| FR-MON-03 | Phase calculation, "Today" list and reminder use the **same** logic (solves B-02).                                                                | ⬜                   |
| FR-MON-04 | Soil moisture replaces the watering tip where a sensor stands; without a sensor the tip stays.                                                    | ⬜                   |
| FR-MON-05 | No sensors for growth measurement and etiolation judgment; both stay manual.                                                                      | ⬜ (design decision) |
| FR-MON-06 | Sensor path (example from the prototype spec): controller → Wi-Fi/MQTT → receiver → raw value store → aggregates. Technology open (E-09).         | ⬜                   |
| FR-MON-07 | Raw values are kept separate from collection data; only aggregates go into the collection (from the prototype NFR-MON-01, here for data storage). | ⬜                   |
| FR-MON-08 | Delivery failed: marked after three attempts, visible in "Hints".                                                                                 | ⬜                   |

### Non-functional

| ID         | Requirement                                                                                        | Status |
| ---------- | -------------------------------------------------------------------------------------------------- | ------ |
| NFR-MON-02 | Thresholds are estimates; conservative starting values, adjust in operation (avoid alarm fatigue). | ⬜     |
| NFR-MON-03 | A sensor failure is noticed via the "silent" check.                                                | ⬜     |
| NFR-MON-04 | A failure of the reminder job is visible to the operator (NFR-18).                                 | ⬜     |

### Hardware pilot (guide values from the prototype, check before buying)

ESP32 controller (~€8), capacitive soil moisture sensors V1.2 (4 + 2 spare, ~€12), ADS1115 (~€4), SHT31 (~€6), accessories (~€10). Later Zigbee sensors with a USB coordinator. Deliberately **not** BH1750 (measuring range ≤ 65,535 lux for lamps with 100,000+ lux).

### Out of scope

Automatic watering, fertilizer tracking, photo evaluation for moisture or height, continuous light measurement, PPFD meter (€200+).

## Implementation phases

1. **Reminders:** watering interval and log, reminder job, web push, "Today" list (release R3).
2. **Sensor pilot:** on 3–4 delicate plants, wired and wireless, aggregates and status.
3. **Scale** after the pilot result.

## Open questions

1. Are intervals per phase enough without a sensor, or a finer watering description per plant?
2. Which delivery channel is the default (web push, Telegram, email), and who pays its costs if any?
3. Wireless (Zigbee) or wired? Decision after the pilot.
4. Which plants are the "delicate" ones for the pilot?
5. How often may messages be sent (daily bundled or on weekdays)?
