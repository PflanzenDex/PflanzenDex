/**
 * The difficulty words of the catalog (US-BES-05). They have a module of their own: the catalog's barrel exports them, and the
 * barrel must load no formatting code (`text.ts` imports `UNKNOWN`, whose module loads the core's root), so the start chunk
 * can draw the species skeleton of "Entdecken" through the barrel (issue 2243).
 */
export const DIFFICULTY: Record<number, string> = { 1: "Leicht", 2: "Mittel", 3: "Schwierig" };
