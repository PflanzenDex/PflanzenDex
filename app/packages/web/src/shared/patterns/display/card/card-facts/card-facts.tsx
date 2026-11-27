import type { ReactNode } from "react";
import { Badge } from "@/shared/ui/badge";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./card-facts.de.json";

const t = texts(table);

const stars = (n: number) => "★".repeat(n) + "☆".repeat(3 - n);

/**
 * Difficulty as stars with a text alternative every screen reader exposes (US-QS-14, WCAG 1.1.1): the stars are
 * hidden from assistive technology, the visually hidden `label` is read instead of an aria-label on a plain element.
 */
export function DifficultyStars(props: { level: number; label: string }) {
  return (
    <>
      <span aria-hidden="true">{stars(props.level)}</span>
      <span className="sr-only">{props.label}</span>
    </>
  );
}

/** One fact as a chip: it wraps inside the card at large text instead of widening it (SG-TYPE-04). */
export function Fact(props: { children: ReactNode }) {
  return (
    <li className="min-w-0 max-w-full">
      <Badge variant="outline" className="max-w-full whitespace-normal">
        {props.children}
      </Badge>
    </li>
  );
}

/** The facts of a card front as a row of chips that wraps; a card shows at most two (US-QS-32, d-159). */
export function FactList(props: { children: ReactNode }) {
  return <ul className="m-0 flex min-w-0 list-none flex-wrap gap-2 p-0">{props.children}</ul>;
}

/** The word of each level of 1 to 3, the words of owner decision d-163 (Leicht, Mittel, Schwierig). */
const WORD = { 1: "difficultyEasy", 2: "difficultyMedium", 3: "difficultyHard" } as const;

/** "★★☆ Mittel" for a level of 1 to 3: the stars, their text alternative and the word every keeper sees. */
function Difficulty(props: { level: number }) {
  const word = t(WORD[props.level as 1 | 2 | 3]);
  return (
    <>
      <DifficultyStars level={props.level} label={t("difficultyLabel", { level: props.level })} />
      <span>{word}</span>
    </>
  );
}

/**
 * The two facts of a card front, the ones that decide the swipe (US-QS-32, owner decisions d-159 and d-160): the light zone
 * as "Lichtzone N", then the difficulty as "★★☆ Mittel". "Lichtzone N" is the form of a card, where no label stands beside
 * the value; elsewhere a zone reads "Zone <n>" (SG-FMT-04). An unknown value says "unbekannt" and never shows a star or a
 * number (P-08).
 */
export function CardFacts(props: { lightZone: number | null; difficulty: number | null }) {
  const { lightZone, difficulty } = props;
  return (
    <FactList>
      <Fact>{lightZone === null ? t("zoneUnknown") : t("zone", { zone: lightZone })}</Fact>
      <Fact>
        {difficulty === null ? t("difficultyUnknown") : <Difficulty level={difficulty} />}
      </Fact>
    </FactList>
  );
}
