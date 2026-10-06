import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { SpeciesHit, NameField } from "@pflanzendex/core";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormRoot,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { searchSchema, type SearchFields } from "./schemas";
import { SearchResultsSkeleton } from "./search-view.skeleton";
import { badge } from "./text";

const FOUND: Record<NameField, string> = {
  latin: "lateinischen Namen",
  german: "deutschen Namen",
  english: "englischen Namen",
  synonym: "Synonym",
};

function Hit({ t, onOpen }: { t: SpeciesHit; onOpen: (id: string) => void }) {
  // Searching by the own Latin/German name is self-evident; explain only what deviates.
  const over = t.hit && t.hit.field !== "latin" && t.hit.field !== "german";
  return (
    <li className="rounded-xl border border-border bg-card text-card-foreground">
      <Button
        type="button"
        variant="ghost"
        className="grid h-auto min-h-16 w-full justify-items-start gap-0.5 px-3.5 py-3 text-left font-normal"
        onClick={() => onOpen(t.id)}
      >
        <span className="text-lg font-semibold">
          <i>{t.latinName}</i>
        </span>
        {t.germanName && <span className="text-sm text-muted-foreground">{t.germanName}</span>}
        {over && t.hit && (
          <span className="text-sm text-muted-foreground">
            Gefunden über {FOUND[t.hit.field]}: {t.hit.display}
          </span>
        )}
        <Badge variant="outline" className="mt-1 whitespace-normal">
          {badge(t)}
        </Badge>
      </Button>
    </li>
  );
}

function Empty(props: { searchText: string; onPropose: () => void }) {
  const text = props.searchText.trim();
  return (
    <EmptyState
      title={text ? `Keine Art zu „${text}“ gefunden.` : "Der gemeinsame Katalog ist noch leer."}
      description={
        text ? "Prüfe die Schreibweise oder schlage die Art vor." : "Schlage die erste Art vor."
      }
      action={{ label: "Art vorschlagen", onClick: props.onPropose }}
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
      <FormRoot role="search" className="max-w-xl">
        <FormField
          control={form.control}
          name="search"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Lateinischer oder deutscher Name</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="search"
                  autoComplete="off"
                  maxLength={120}
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

/** Catalog search by Latin or German name and synonyms; without hits "Propose species" follows (P-09). */
export function SpeciesSearch(props: {
  searchText: string;
  hit: readonly SpeciesHit[];
  loading?: boolean;
  /** The search failed: the page shows the error with a retry instead of "no hits". */
  failed?: boolean;
  onSearch: (text: string) => void;
  onOpen: (id: string) => void;
  onPropose: () => void;
}) {
  return (
    <section aria-labelledby="search-title" className="flex min-w-0 flex-col gap-3">
      <h1 id="search-title" className="text-2xl font-semibold">
        Art wählen
      </h1>
      <p className="text-muted-foreground">
        Suche die Art deiner Pflanze im Katalog. Findest du sie nicht, schlage sie vor.
      </p>
      <SearchField searchText={props.searchText} onSearch={props.onSearch} />
      {props.loading && props.hit.length === 0 && <SearchResultsSkeleton />}
      {props.loading && props.hit.length > 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          Suche läuft …
        </p>
      )}
      {props.hit.length === 0 ? (
        !props.loading &&
        !props.failed && <Empty searchText={props.searchText} onPropose={props.onPropose} />
      ) : (
        <>
          <ul className="m-0 grid list-none gap-2 p-0" aria-label="Treffer">
            {props.hit.map((t) => (
              <Hit key={t.id} t={t} onOpen={props.onOpen} />
            ))}
          </ul>
          <Button
            type="button"
            variant="secondary"
            className="self-start"
            onClick={props.onPropose}
          >
            Nicht dabei? Art vorschlagen
          </Button>
        </>
      )}
    </section>
  );
}
