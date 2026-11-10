import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import type { SpeciesHit } from "@pflanzendex/core";
import { EmptyState } from "@/shared/patterns/elements/empty-state/empty-state";
import { texts } from "@/shared/lib/text-rules/texts";
import { LayerOpener } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormRoot,
} from "@/shared/ui/fields/form/form";
import { SearchInput } from "@/shared/ui/fields/input/search-input/search-input";
import { useShortcuts } from "@/shared/platform/device/keyboard/shortcut-provider/shortcut-provider";
import {
  DelayedSkeleton,
  useHeldLoader,
} from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { searchSchema, type SearchFields } from "../shared/schemas";
import { SearchResultsSkeleton } from "./search-view.skeleton";
import { HitList } from "./hit-list/hit-list";
import {
  applyFilters,
  FilterChips,
  FILTERS_LAYER,
  FiltersLayer,
  useFilters,
} from "./search-filters/search-filters";
import table from "./search-view.de.json";

const t = texts(table);

function Empty(props: { searchText: string; onPropose: () => void }) {
  const text = props.searchText.trim();
  return (
    <EmptyState
      title={text ? `Keine Art zu „${text}“ gefunden.` : "Der gemeinsame Katalog ist noch leer."}
      description={
        text
          ? "Prüfe die Schreibweise oder schlage die Art vor. Findest du ohne Suchtext auch nichts, ist der Katalog noch leer."
          : "Schlage die erste Art vor oder bitte den Betreiber, den Start-Katalog zu laden."
      }
      action={{ label: "Art vorschlagen", onClick: props.onPropose }}
    />
  );
}

function NoMatch(props: { onClear: () => void }) {
  return (
    <EmptyState
      title="Keine Art passt zu den Filtern."
      description="Nimm einen Filter heraus, dann siehst du mehr Arten."
      action={{ label: "Filter zurücksetzen", onClick: props.onClear }}
    />
  );
}

function SearchField(props: { searchText: string; onSearch: (text: string) => void }) {
  const form = useForm<SearchFields>({
    resolver: zodResolver(searchSchema),
    defaultValues: { search: props.searchText },
  });
  const { hint } = useShortcuts();
  return (
    <Form {...form}>
      {/* A 10 rem basis keeps the field from shrinking to a sliver; at a larger text size the row wraps (issue 1019). */}
      <FormRoot role="search" className="min-w-0 grow basis-40">
        <FormField
          control={form.control}
          name="search"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="sr-only">Lateinischer oder deutscher Name</FormLabel>
              <FormControl>
                <SearchInput
                  {...field}
                  autoComplete="off"
                  maxLength={120}
                  placeholder="Name der Art"
                  keyHint={hint("search")}
                  onChange={(e) => {
                    field.onChange(e);
                    props.onSearch(e.target.value);
                  }}
                  onClear={() => {
                    field.onChange("");
                    props.onSearch("");
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </FormRoot>
    </Form>
  );
}

/** The heading of the search and the proposal opener beside it; the opener goes below the heading when there is no room (issue 1019). */
function SearchTitle(props: { Heading: "h1" | "h2"; hasHits: boolean }) {
  const { Heading } = props;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Heading id="search-title" className="text-2xl font-semibold">
        Art wählen
      </Heading>
      {props.hasHits && (
        <LayerOpener id="propose" className="max-w-full shrink-0">
          Art vorschlagen
        </LayerOpener>
      )}
    </div>
  );
}

/**
 * Catalog search by Latin or German name and synonyms (US-QS-21): the field, a page of compact results, the filters in
 * a layer with the chosen ones as chips. Without hits "Propose species" follows (P-09). `children` are further layers
 * of the page (the proposal), rendered beside the list so that a pane can take its own column.
 */
export function SpeciesSearch(props: {
  searchText: string;
  hit: readonly SpeciesHit[];
  /** More species match than the hits show (FR-BES-24): a one-line notice above the list. */
  more?: boolean | undefined;
  loading?: boolean;
  /** The search failed: the page shows the error with a retry instead of "no hits". */
  failed?: boolean;
  onSearch: (text: string) => void;
  onOpen: (id: string) => void;
  onPropose: () => void;
  /** Below a destination title the search is a section: its name is then an h2 (US-QS-14). */
  embedded?: boolean | undefined;
  children?: ReactNode;
}) {
  const Heading = props.embedded ? "h2" : "h1";
  const { filters, change, clear, key, active } = useFilters();
  const shown = applyFilters(props.hit, filters);
  const hasHits = props.hit.length > 0;
  // The search runs beside the hits it already has: its status holds once shown (D5). The hits stay on screen, so they
  // are not held: the status is an annotation, not what the hits replace.
  const running = useHeldLoader(props.loading === true && hasHits);
  return (
    <div className="flex min-h-0 min-w-0 flex-1 gap-4">
      <section
        aria-labelledby="search-title"
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-3"
      >
        <SearchTitle Heading={Heading} hasHits={hasHits} />
        <div className="flex flex-wrap items-start gap-2">
          <SearchField searchText={props.searchText} onSearch={props.onSearch} />
          {(hasHits || active > 0) && (
            <LayerOpener id={FILTERS_LAYER} className="shrink-0">
              {active > 0 ? `Filter (${active})` : "Filter"}
            </LayerOpener>
          )}
        </div>
        <FilterChips filters={filters} onChange={change} />
        {props.loading && !hasHits && <SearchResultsSkeleton />}
        {running && (
          <DelayedSkeleton>
            <p role="status" className="text-sm text-muted-foreground">
              Suche läuft …
            </p>
          </DelayedSkeleton>
        )}
        {props.more && hasHits && <p className="text-sm text-muted-foreground">{t("more")}</p>}
        {!hasHits ? (
          !props.loading &&
          !props.failed && <Empty searchText={props.searchText} onPropose={props.onPropose} />
        ) : shown.length === 0 ? (
          <NoMatch onClear={clear} />
        ) : (
          <HitList
            hit={shown}
            onOpen={props.onOpen}
            resetKey={`${props.searchText.trim()}|${key}`}
          />
        )}
      </section>
      <FiltersLayer filters={filters} onChange={change} />
      {props.children}
    </div>
  );
}
