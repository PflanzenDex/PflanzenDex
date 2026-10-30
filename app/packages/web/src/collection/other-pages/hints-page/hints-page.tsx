import { useCallback, type ReactNode } from "react";
import type { LightLocation, SpecimenHint } from "@pflanzendex/core";
import { EmptyState } from "@/components/shared/empty-state/empty-state";
import { Pager } from "@/components/shared/responsive/pager/pager";
import { LoadFrame, useInvalidate, useWriteAction } from "../../../kernel";
import { HintsPageSkeleton } from "./hints-page.skeleton";
import {
  GRID,
  PageFrame,
  Plain,
  Quiet,
  Status,
  TITLE,
  Warning,
} from "../../specimens/cards/parts/parts";
import { refusalText } from "../../specimens/model/refusal";
import { loadLocations } from "../../../light";
import { loadSpecimenHints } from "../../insights/api/hints-api";
import { setSpecimenLocation } from "../../specimens/model/specimens-api";
import { HintCount, type useHintCount } from "../../insights/api/hint-count/hint-count";
import { HintCard, type HintTarget } from "./hint-card/hint-card";

export type { HintTarget };

interface Data {
  readonly hints: readonly SpecimenHint[];
  readonly locations: readonly LightLocation[];
}

/**
 * Hints about incomplete specimens (US-BES-08): every one says what is missing and offers the action that fixes it
 * (P-09). An incomplete specimen drops out of evaluations; here it is named instead of vanishing (P-10). A specimen
 * without a location gets one right here, chosen from the own locations (US-PHA-03).
 */
const KEY = ["collection", "hints"] as const;

type Token = () => Promise<string | undefined>;

/**
 * With `count` the page renders nothing of its own and hands the number of hints to `count` (US-QS-18): the overview
 * of "Heute" shows it on a tile and in its summary. It shares the request and the cached copy with the list.
 */
export function HintsPage(
  props: HintsListProps & { count?: (hints: ReturnType<typeof useHintCount>) => ReactNode },
) {
  const { count, ...list } = props;
  if (count)
    return (
      <HintCount api={props.api} token={props.token}>
        {count}
      </HintCount>
    );
  return <HintsList {...list} />;
}

type HintsListProps = {
  api: string;
  token: Token;
  onOpen: (target: HintTarget) => void;
  /** Shown as a section of "Heute" (US-QS-14): no card frame and no title of its own, the area names the section. */
  host?: boolean;
};

function HintsList(props: HintsListProps) {
  const { api, onOpen, token } = props;
  const host = props.host === true;
  const Frame = host ? Plain : PageFrame;
  const again = useInvalidate(KEY);
  const place = useWriteAction(token, again);
  const load = useCallback(
    async (t: string) => {
      const [hints, locations] = await Promise.all([
        loadSpecimenHints(api, t),
        loadLocations(api, t),
      ]);
      if (!hints.ok) return hints;
      if (!locations.ok) return locations;
      return { ok: true as const, value: { hints: hints.value, locations: locations.value } };
    },
    [api],
  );
  return (
    <Frame>
      <LoadFrame
        queryKey={KEY}
        token={token}
        load={load}
        loadingText="Hinweise werden geladen …"
        {...(host ? {} : { heading: "Hinweise" })}
        loadingFallback={<HintsPageSkeleton label="Hinweise werden geladen …" host={host} />}
      >
        {(data: Data) => (
          <>
            {place.message && <Status>{place.message}</Status>}
            {place.error && (
              <Warning>
                <p>{refusalText(place.error)}</p>
              </Warning>
            )}
            <HintList
              data={data}
              busy={place.running}
              host={host}
              onOpen={onOpen}
              onLocate={(specimenId, locationId, success) =>
                void place.run(
                  (t) => setSpecimenLocation(api, t, { id: specimenId, locationId }),
                  success,
                )
              }
            />
          </>
        )}
      </LoadFrame>
    </Frame>
  );
}

/** Hints per page of the layer (starting value, assumption; US-QS-18). */
const PAGE_SIZE = 3;

function HintList(props: {
  host: boolean;
  data: Data;
  busy: boolean;
  onOpen: (t: HintTarget) => void;
  onLocate: (specimenId: string, locationId: string, success: string) => void;
}) {
  const card = (h: SpecimenHint) => (
    <HintCard
      hint={h}
      host={props.host}
      locations={props.data.locations}
      busy={props.busy}
      onOpen={props.onOpen}
      onLocate={props.onLocate}
    />
  );
  return (
    <section aria-labelledby={props.host ? undefined : "hints-title"}>
      {!props.host && (
        <h1 id="hints-title" className={TITLE}>
          Hinweise
        </h1>
      )}
      {props.data.hints.length === 0 ? (
        <EmptyState
          title="Keine Hinweise"
          level={props.host ? 3 : 2}
          description="Jedes Exemplar hat eine Art, einen Standort und eine Lichtzone."
          action={{ label: "Zum Bestand", onClick: () => props.onOpen("collection") }}
        />
      ) : (
        <>
          <Quiet className="mb-3">
            Diese Exemplare sind unvollständig und fallen sonst aus Auswertungen wie der Verteilung
            auf die Lichtzonen.
          </Quiet>
          {props.host ? (
            <Pager
              items={props.data.hints}
              pageSize={PAGE_SIZE}
              label="Fehlende Angaben"
              getKey={(h) => `${h.specimenId}-${h.kind}`}
              renderItem={(h) => card(h)}
            />
          ) : (
            <ul className={GRID}>
              {props.data.hints.map((h) => (
                <li key={`${h.specimenId}-${h.kind}`}>{card(h)}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
