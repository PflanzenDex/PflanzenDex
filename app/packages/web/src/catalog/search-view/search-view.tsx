import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import type { SpeciesHit } from "@pflanzendex/core";
import { EmptyState } from "@/components/shared/empty-state/empty-state";
import { LayerOpener } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormRoot,
} from "@/components/ui/fields/form/form";
import { Input } from "@/components/ui/fields/input/input";
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
  return (
    <Form {...form}>
      <FormRoot role="search" className="min-w-0 flex-1">
        <FormField
          control={form.control}
          name="search"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="sr-only">Lateinischer oder deutscher Name</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="search"
                  autoComplete="off"
                  maxLength={120}
                  placeholder="Name der Art"
                  onChange={(e) => {
                    field.onChange(e);
                    props.onSearch(e.target.value);
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

/**
 * Catalog search by Latin or German name and synonyms (US-QS-21): the field, a page of compact results, the filters in
 * a layer with the chosen ones as chips. Without hits "Propose species" follows (P-09). `children` are further layers
 * of the page (the proposal), rendered beside the list so that a pane can take its own column.
 */
export function SpeciesSearch(props: {
  searchText: string;
  hit: readonly SpeciesHit[];
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
  return (
    <div className="flex min-h-0 min-w-0 flex-1 gap-4">
      <section
        aria-labelledby="search-title"
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-3"
      >
        <div className="flex items-center justify-between gap-2">
          <Heading id="search-title" className="text-2xl font-semibold">
            Art wählen
          </Heading>
          {hasHits && <LayerOpener id="propose">Art vorschlagen</LayerOpener>}
        </div>
        <div className="flex items-start gap-2">
          <SearchField searchText={props.searchText} onSearch={props.onSearch} />
          {(hasHits || active > 0) && (
            <LayerOpener id={FILTERS_LAYER}>
              {active > 0 ? `Filter (${active})` : "Filter"}
            </LayerOpener>
          )}
        </div>
        <FilterChips filters={filters} onChange={change} />
        {props.loading && !hasHits && <SearchResultsSkeleton />}
        {props.loading && hasHits && (
          <p role="status" className="text-sm text-muted-foreground">
            Suche läuft …
          </p>
        )}
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
