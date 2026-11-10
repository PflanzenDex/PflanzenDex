/**
 * The card around the species profile: 16 px of padding at normal text (`p-4`), shrinking as the text grows, so the title
 * beside the back control gets the room (NFR-13, issue 1216). The padding is 24 px less half of 1 rem, never under 8 px:
 * 16 px at 100 % text, 8 px at 200 %. From 768 px it keeps the wide padding of the page (`md:p-7`). The page and the
 * skeleton of its route (issue 1727) share it, so the fallback has the card's size before the page is there.
 */
export const PROFILE_CARD =
  "flex min-h-0 min-w-0 flex-1 flex-col gap-4 rounded-2xl border border-border bg-card px-[max(8px,calc(24px_-_0.5rem))] py-[max(8px,calc(24px_-_0.5rem))] text-card-foreground md:p-7";
