// Steps that the app takes over its own history, which the focus does not follow (issue 2165). A settle steps back over its
// guard entry and pushes the form again: RouteFocus sees both as view changes, but the person has not navigated. The key of
// the entry such a step leaves is listed here. The arrival from a listed key moves no focus and says no title, and it takes
// the key off the list, so a later Forward or Back from that entry moves the focus as any other step does.
const quiet = new Set<string>();

/** The next arrival from the entry `key` moves no focus and says no title (issue 2165). */
export function quietFrom(key: string): void {
  quiet.add(key);
}

/** Whether the arrival from the entry `key` is quiet; the arrival takes the key off the list. */
export function takeQuiet(key: string): boolean {
  return quiet.delete(key);
}
