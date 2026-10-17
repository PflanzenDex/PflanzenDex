import {
  appError,
  calendarDateField,
  defineOperation,
  failed,
  idField,
  integerField,
  ok,
  orNull,
  shape,
  textField,
} from "../../../kernel";
import { LAMP_LIMITS, type EquipmentStore } from "../../store/types";
import type { DeviationLimitStore, LampMeasurementStore } from "./types";

const measureSchema = shape({
  equipmentId: idField("equipmentId"),
  measuredOn: calendarDateField("measuredOn"),
  lux: integerField("lux", LAMP_LIMITS.lux),
  distanceCm: orNull(integerField("distanceCm", LAMP_LIMITS.distanceCm)),
  method: orNull(textField("method", LAMP_LIMITS.method)),
});

/**
 * Records one measured light intensity of a lamp (US-EQU-03): date and lux are required, distance and method may stay
 * unknown (P-08). One entry makes the lamp "measured" (FR-LIC-06). The log is append-only: a wrong entry is corrected by
 * a new measurement, nothing disappears silently (P-10). Only lamps have measurements.
 */
export const equipmentMeasure = (deps: { measurements: LampMeasurementStore }) =>
  defineOperation({
    name: "equipment.measure",
    schema: measureSchema,
    run: async ({ userId }, input) => {
      const r = await deps.measurements.add(userId, input);
      if (r === "not_found") return failed(appError("equipment.not_found"));
      if (r === "not_lamp") return failed(appError("equipment.not_a_lamp"));
      return ok(r);
    },
  });

const describeSchema = shape({
  id: idField("id"),
  powerW: orNull(integerField("powerW", LAMP_LIMITS.powerW)),
  luxStatement: orNull(integerField("luxStatement", LAMP_LIMITS.lux)),
});

/**
 * Sets what the manufacturer states about a lamp: power and light intensity (DM-EQU-02). A missing value is unknown
 * (P-08); the statement is shown apart from the measured value (US-EQU-03).
 */
export const equipmentDescribeLamp = (deps: { equipment: EquipmentStore }) =>
  defineOperation({
    name: "equipment.describe_lamp",
    schema: describeSchema,
    run: async ({ userId }, { id, ...data }) => {
      const r = await deps.equipment.setLampData(userId, id, data);
      if (r === "not_found") return failed(appError("equipment.not_found"));
      if (r === "not_lamp") return failed(appError("equipment.not_a_lamp"));
      return ok(r);
    },
  });

const limitSchema = shape({
  percent: orNull(integerField("percent", LAMP_LIMITS.deviationPercent)),
});

/**
 * Sets the share (percent) by which the last measurement of a lamp may deviate from the ceiling of its zone before
 * "Check zone" appears. It is the keeper's decision; without a value no check runs (US-EQU-03, no invented threshold).
 */
export const equipmentSetDeviationLimit = (deps: { limits: DeviationLimitStore }) =>
  defineOperation({
    name: "equipment.set_deviation_limit",
    schema: limitSchema,
    run: async ({ userId }, { percent }) =>
      ok({ percent: await deps.limits.setLimit(userId, percent) }),
  });
