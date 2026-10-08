# 08 – Epic MON: Monitoring, Reminders and Sensors (planned)

**Status of the whole epic: ⬜ not implemented.** The source is exclusively `docs/superpowers/specs/2026-09-25-pflanzen-monitoring-design.md` (draft, direction "first bot, then hardware" confirmed by the user, details not agreed). In the vault there is neither `pflanzen_status.py`, nor `Giesslog`/`Giess_*`/`Sensor_*` fields, nor `Sensor-Status.md`. The only artifact: the savings goal `02-Areas/Finanzen/Sparziele/Pflanzen-Sensorik-Set.md` (about €40, pilot hardware).

## Problem

1. **Pull system:** all warnings appear only when the dashboard is opened. Phase changes and overdue treatments are not reported. That matches the "weak system" pattern: dependent on remembering.
2. **No measurement data:** watering, room climate and real light intensity are estimates (`Gießen_Messer` is free text, the lux values of the lamp levels are nominal values).

Stock at planning time: 12 plants, 15–30 planned.

## User stories

### US-MON-01 · Be notified daily only when action is needed · ⬜
As a **plant keeper** I want a Telegram message only when something needs doing, so that I do not depend on the dashboard and get no "all ok" messages.

Acceptance criteria:
- A daily bot job (e.g. 08:00, `run_daily`; caution: in python-telegram-bot weekday 0 = Sunday) reads the frontmatter and sends only if there is at least one trigger from US-MON-02 to -05.
- The message contains inline buttons ("gegossen ✔", "erledigt ✔") that write directly into the frontmatter.
- The same occasion is not reported twice on the same day (idempotency).
- If there is no need for action, nothing is sent.

### US-MON-02 · Be reminded at the phase change · ⬜
As a **plant keeper** I want to be reminded on the day a dormancy or growth phase begins if `Standort_Aktuell` is still the old location.

Acceptance criteria: trigger = the dormancy phase begins/ends today **and** `Standort_Aktuell` ≠ new target location. The phase calculation matches the dashboard (US-PHA-01).

### US-MON-03 · Be reminded of a due treatment · ⬜
Acceptance criteria: trigger = entry in `Behandlungen` with `Erledigt: false` and `Datum ≤ today`. Button "erledigt ✔" sets `Erledigt: true`.

### US-MON-04 · Be reminded of an overdue measurement · ⬜
Acceptance criteria: trigger = last `Wachstumslog` entry older than N days (starting value 30) or none at all. Cuttings are excluded (analogous to the phase block).

### US-MON-05 · Be reminded to water by interval without a sensor · ⬜
As a **plant keeper** I want a watering reminder and a command `/gegossen <plant>`, so that plants without a sensor also have a watering log.

Acceptance criteria:
- New fields (DM-M1): `Giess_Intervall_Tage: {Wachstum, Ruhe}` and `Giesslog: [{Datum, Quelle: "bot"|"sensor"}]`.
- Trigger = last `Giesslog` entry + interval of the **current** phase ≤ today.
- `/gegossen` and the inline button write `Giesslog` with `Quelle: "bot"`.
- Starting values of the intervals come from the free text `Gießen_Messer` and are readjustable.

### US-MON-06 · Capture soil moisture by sensor · ⬜
As a **plant keeper** I want a sensor to detect watering and report when it is due, so that the watering button is dropped there.

Acceptance criteria:
- A rise of at least X percentage points within a short time counts as watering; the bot writes `Giesslog` with `Quelle: "sensor"`.
- If `wert_prozent` falls below `Giess_Schwelle` of the **current** phase (e.g. growth 35, dormancy 10), the bot reports. For plants with a sensor this replaces the interval reminder.
- The assignment sensor → plant stands only in `Sensor_ID`; a new sensor is a frontmatter entry, no code change.
- Per pot, one dry and one wet calibration (`Sensor_Trocken`, `Sensor_Nass`); without calibration percentage values are not comparable.

### US-MON-07 · See climate and sensor status, notice failures · ⬜
As a **plant keeper** I want to see current climate values and the state of the sensors in the dashboard and document a one-time light measurement of the lamp levels.

Acceptance criteria:
- `02-Areas/Pflanzen/Sensor-Status.md` (written only by the script, idempotent, completely recomputed) with `stand` and per sensor `id`, `typ` (`bodenfeuchte`/`klima`), `wert_prozent` or `temp_c`/`luftfeuchte_prozent`, `min_24h`/`max_24h`, `zuletzt`.
- The dashboard block shows "Status veraltet" if `stand` is older than 1 day; individual sensors are "stumm" (silent) if `zuletzt` is older than 6 hours (empty battery, Wi-Fi, cable).
- Climate: display and warning on outliers only (e.g. dormancy plant clearly warmer than `Standort_Ruhephase`), no control.
- Light: one-time measurement per lamp level with a phone app (Photone, PPFD), result with date and method in `Lampen-Zuordnung.md`, no log.

## Requirements

### Data (DM-M1)

```yaml
Giess_Intervall_Tage: {Wachstum: 7, Ruhe: 30}
Giesslog: []                       # {Datum, Quelle: "bot"|"sensor"}
Sensor_ID: null                    # e.g. "bf-03"
Sensor_Trocken: null
Sensor_Nass: null
Giess_Schwelle: {Wachstum: 35, Ruhe: 10}   # percent after calibration
```

### Functional

| ID | Requirement | Status |
|---|---|---|
| FR-MON-01 | Bot job `pflanzen_status.py` with tests (model `sport_status.py`/`sport_schau.py` in the bot module). | ⬜ |
| FR-MON-02 | Reminders only when action is needed; once per occasion and day. | ⬜ |
| FR-MON-03 | The phase calculation in the bot is congruent with the dashboard (ideally shared, tested logic). | ⬜ |
| FR-MON-04 | Soil moisture replaces the watering button where a sensor stands; without a sensor the button stays. | ⬜ |
| FR-MON-05 | No sensors for growth measurement and etiolation judgment; both stay manual. | ⬜ (design decision) |
| FR-MON-06 | Path: ESP32 (ESPHome) → Wi-Fi/MQTT → Mosquitto (home server) → bot → raw values in SQLite/CSV **outside** the vault → aggregated in `Sensor-Status.md`. | ⬜ |
| FR-MON-07 | Dashboard block for sensor status with drift checks (`stand`, `zuletzt`). | ⬜ |
| FR-MON-08 | The new fields (`Giess_*`, `Giesslog`) are taken into the species/specimen templates and documented in `CLAUDE.md` ("Workflow: Pflanzenpflege"), otherwise the system becomes orphaned. | ⬜ |

### Non-functional / constraints

| ID | Requirement | Status |
|---|---|---|
| NFR-MON-01 | **Raw measured values do not go into the vault.** The vault is synchronized via Git (auto pushes); minute values would bloat the history and create merge conflicts. Only aggregates (current value, daily min/max, timestamp) go into the vault. | ⬜ |
| NFR-MON-02 | Thresholds are estimates; conservative starting values, adjust in operation (avoid alarm fatigue). | ⬜ |
| NFR-MON-03 | A sensor failure must be noticed via the "silent" check (battery, Wi-Fi, cable). | ⬜ |
| NFR-MON-04 | A bot failure stops reminders; the existing systemd/auto-update mechanisms of the bot apply unchanged. | ⬜ |

### Hardware (pilot, guide values from the conversation, check before buying)

| Part | Purpose |
|---|---|
| ESP32 Dev Kit C V4 (about €8) | Controller, Wi-Fi |
| Capacitive soil moisture sensor V1.2 ×6 (4 pilot + 2 spare, about €12) | Soil moisture, wired, quality varies |
| ADS1115 (about €4) | more analog channels (ESP32 ADC with Wi-Fi: about 6–8 usable) |
| SHT31 (about €6) | Temperature/humidity per lamp zone |
| Jumper, breadboard, power supply (about €10) | Assembly |
| *After the pilot:* Zigbee soil moisture sensor + USB coordinator (about €10–25 each + about €20–30 once) | Wireless variant without cables |

Deliberately **not** included: BH1750 (measuring range up to 65,535 lux, lamps 3/4 are at 100,000/110,000 lux).

### Out of scope

Automatic watering, fertilizer tracking, photo evaluation, continuous light measurement, PPFD meter (€200+), cloud services.

## Implementation phases

1. **Bot reminders** (no hardware): fields `Giess_Intervall_Tage`, `Giesslog` into the schema and the prompt template; `pflanzen_status.py` with tests; bot job; `/gegossen`.
2. **Pilot:** Mosquitto on the home server; one ESP32 with SHT31 and 3–4 soil moisture sensors plus 1–2 wireless sensors; raw value store; `Sensor-Status.md`; dashboard block; drift checks. The pilot tests wired and wireless on 3–4 delicate plants before scaling.
3. **Scale:** further sensors after the pilot result; check the light levels with Photone (any time, independent).

## Open questions (from the spec, unanswered)

1. Are intervals per phase enough for the reminder without a sensor, or should watering be described more finely per plant?
2. Is an MQTT broker (or Home Assistant) already running on the home server, or is Mosquitto set up anew?
3. Wireless (Zigbee) or wired: decision after the pilot; does the home server need a free USB port for the coordinator?
4. Which plants are the "delicate" ones for the pilot?
5. How often may the bot report (daily at 08:00 or bundled, e.g. only on weekdays)?

## Risks

Cheap sensors are unreliable (quality, unsealed edges, drift); substrate differences (pumice, perlite, soil) change the measurement, hence calibration per pot; batteries for wireless sensors; few I2C addresses limit the number of sensors (not checked). Too many Telegram messages consume attention; see open question 5.
