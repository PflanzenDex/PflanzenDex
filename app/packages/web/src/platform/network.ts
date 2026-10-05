/** Whether the device believes it has a network (DS-10: components never read `navigator` themselves). */
export function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}
