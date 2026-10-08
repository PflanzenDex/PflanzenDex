import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import type { Species, Specimen } from "@pflanzendex/core";
import { loadSpecies, searchSpecies } from "./catalog";
import { linkWishSpecimen, type PathNotice as Notice, type WishToPlant } from "./wishlist";
import {
  PATHS,
  PROFILE_BASE,
} from "./components/shared/navigation/nav-model/navigation/navigation";

type Token = () => Promise<string | undefined>;

const fold = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();

/** The catalog species whose Latin name is the name of the wish (exact, nothing guessed, P-08); `null` if there is none. */
async function speciesOf(api: string, token: Token, wish: WishToPlant): Promise<Species | null> {
  const t = await token();
  if (!t) return null;
  const found = await searchSpecies(api, t, wish.name);
  if (!found.ok) return null;
  const hit = found.value.find((s) => fold(s.latinName) === fold(wish.name));
  if (!hit) return null;
  const full = await loadSpecies(api, t, hit.id);
  return full.ok ? full.value : null;
}

const NOT_IN_CATALOG = (w: WishToPlant) =>
  `„${w.title}“ ist noch nicht im Katalog. Suche die Art unter ihrem Namen oder schlage sie vor; danach legst du das Exemplar an und der Wunsch wird verknüpft.`;

/** The German texts of all error codes are a big table: it loads with the first failure, not with the shell (DS-08). */
async function failureText(w: WishToPlant, code: string | undefined): Promise<string> {
  const { errorText } = await import("@/lib/error-text");
  return `Das Exemplar ist angelegt, aber die Verknüpfung mit dem Wunsch „${w.title}“ hat nicht geklappt. ${errorText(code)}`;
}

/** Links the wish to its new specimen and says what happened; a failure offers a retry (P-10). */
function useLink(api: string, token: Token, setNotice: (n: Notice) => void) {
  const link = useCallback(
    async (w: WishToPlant, specimen: Specimen): Promise<void> => {
      const t = await token();
      const r = t
        ? await linkWishSpecimen(api, t, { wishId: w.id, specimenId: specimen.id })
        : null;
      setNotice(
        r?.ok
          ? { kind: "status", text: r.value.hint.text, path: PATHS.collection }
          : {
              kind: "alert",
              text: await failureText(w, r?.error.code),
              path: PATHS.collection,
              retry: () => void link(w, specimen),
            },
      );
    },
    [api, token, setNotice],
  );
  return link;
}

/**
 * The way from a bought wish to its specimen (US-WUN-05). The app wires `wishlist`, `catalog` and `collection`, which do
 * not know each other (ADR 0003): the wish name finds the species in the catalog (exact Latin name; if it is missing the
 * catalog search starts with the name, US-BES-01); the form for the specimen opens with that species; once the specimen
 * exists the wish is linked to it. The link lives only while the keeper stays on the way (species or collection page)
 * and can be dropped, so an unrelated specimen is never linked to a wish.
 */
export function useWishToSpecimen(
  api: string,
  token: Token,
  go: { choose: (s: Species) => void; toTheCatalog: () => void },
) {
  const { pathname } = useLocation();
  const [wish, setWish] = useState<WishToPlant | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const link = useLink(api, token, setNotice);
  const current = useRef<string | null>(null);
  const { choose, toTheCatalog } = go;

  // Leaving the way drops the link and a notice of another page; the effect runs on address changes only.
  useEffect(() => {
    const onTheWay = pathname === PATHS.discover || pathname.startsWith(`${PROFILE_BASE}/`);
    if (!onTheWay && pathname !== PATHS.collection) {
      current.current = null;
      setWish(null);
    }
    setNotice((n) => (n && n.path !== pathname ? null : n));
  }, [pathname]);

  const start = useCallback(
    async (w: WishToPlant) => {
      current.current = w.id;
      setWish(w);
      setNotice(null);
      const species = await speciesOf(api, token, w);
      if (current.current !== w.id) return;
      if (species) return choose(species);
      setNotice({ kind: "status", text: NOT_IN_CATALOG(w), path: PATHS.discover });
      toTheCatalog();
    },
    [api, token, choose, toTheCatalog],
  );

  const created = useCallback(
    (specimen: Specimen) => {
      if (!wish) return;
      current.current = null;
      setWish(null);
      void link(wish, specimen);
    },
    [wish, link],
  );
  const drop = useCallback(() => {
    current.current = null;
    setWish(null);
  }, []);
  return { wish, notice, start, created, drop };
}

type Base = {
  newSpecies: Species | null;
  setNewSpecies: (s: Species | null) => void;
  choose: (s: Species) => void;
  toTheCatalog: () => void;
};

/**
 * The species hand-over of the app (US-BES-02) extended by the way from a bought wish to its specimen (US-WUN-05): the
 * routes get what they hand over, `notes` is what the page shows above the routes.
 */
export function useWishHandOver(api: string, token: Token, base: Base) {
  const way = useWishToSpecimen(api, token, base);
  const { pathname } = useLocation();
  const { setNewSpecies } = base;
  return {
    handOver: {
      ...base,
      onCreated: (specimen: Specimen) => {
        setNewSpecies(null);
        way.created(specimen);
      },
      startFromWish: (w: WishToPlant) => void way.start(w),
      ...(way.wish ? { searchStart: way.wish.name } : {}),
    },
    notes: { wish: way.wish, notice: way.notice, pathname, onDrop: way.drop },
  };
}
