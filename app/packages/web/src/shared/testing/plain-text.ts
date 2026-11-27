// Test helper: the text of a row as a keeper reads it. The meta line of an object row keeps the dot of its " · " separator at the
// end of its line with a no-break space before it (issue 2606), so its text holds U+00A0 where the caller wrote a space.
export function plain(text: string | null | undefined): string {
  return (text ?? "").replaceAll(" ", " ");
}
