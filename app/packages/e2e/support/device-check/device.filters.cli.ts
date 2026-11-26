import { SCREENS } from "../display/one-screen/register";
import { cellCount, parseFilters, type RawFilters } from "./device.filters";
import { loadFlows } from "./flow";

// The check of `make device-check` before anything starts (US-DEV-01, issue 2504): reads the DEVICE_CHECK_* settings of the
// environment, refuses an unknown value with the valid ones, and prints the number of cells of the run. Exit 1 on a refusal, so
// no database, Keycloak, server or browser is started for a wrong filter.

const raw: RawFilters = {
  DEVICE_CHECK_SCREEN: process.env["DEVICE_CHECK_SCREEN"],
  DEVICE_CHECK_FLOW: process.env["DEVICE_CHECK_FLOW"],
  DEVICE_CHECK_DEVICE: process.env["DEVICE_CHECK_DEVICE"],
  DEVICE_CHECK_THEME: process.env["DEVICE_CHECK_THEME"],
  DEVICE_CHECK_TEXT: process.env["DEVICE_CHECK_TEXT"],
  DEVICE_CHECK_FORCED: process.env["DEVICE_CHECK_FORCED"],
};

try {
  const flows = await loadFlows();
  const filters = parseFilters(raw, {
    screens: SCREENS.map((s) => s.id),
    flows: flows.map((f) => f.name),
  });
  console.log(
    `device-check: ${cellCount(filters)} cells (${filters.screens.length} screens, ${filters.flows.length} flows)`,
  );
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
