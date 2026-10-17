// Public interface of the module `monitoring` (ADR 0003, epic MON): reminders and their settings.
export { REMINDER_LIMITS, REMINDER_OCCASIONS, defaultReminderSettings } from "./types";
export type {
  ChannelStore,
  Occasion,
  OccasionSource,
  PushSubscription,
  ReminderChannel,
  ReminderMessage,
  ReminderOccasion,
  ReminderRoster,
  ReminderRow,
  ReminderSettings,
  ReminderStatus,
  ReminderStore,
  WateringEntry,
  WateringStore,
} from "./types";
export { bundleOf, deliveryTime, inQuietHours, isPaused, measurementOverdue } from "./daily/bundle";
export type { MeasuredSpecimen } from "./daily/bundle";
export {
  monitoringSaveSettings,
  monitoringSubscribe,
  monitoringUnsubscribe,
  reminderInbox,
} from "./settings/settings";
export {
  REMINDER_JOB_TYPE,
  messageOf,
  scheduleReminders,
  sendRemindersHandler,
} from "./daily/daily";
export { MAX_WATERED, monitoringWater, wateringDue, wateringOccasions } from "./watering/watering";
export type { WateredDependencies, WateringCandidate, WateringDue } from "./watering/watering";
