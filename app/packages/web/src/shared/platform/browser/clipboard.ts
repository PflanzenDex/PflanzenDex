/** Copies text to the clipboard (DS-10: device APIs only here). Returns whether it worked; never throws. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
