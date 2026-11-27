import { FilterChips, type Filters, type QuickFilters } from "../search-filters/search-filters";
import { QuickFilterChips } from "../quick-filter-chips/quick-filter-chips";

/**
 * The rows under the search field: the quick filters of "Entdecken" (`quick`, US-QS-15, US-QS-21, issue 2587) and the chosen
 * filters as removable chips. With the quick filters on, the removable chips leave out what a pressed chip already shows.
 */
export function FilterRows(props: {
  filters: Filters;
  quick: QuickFilters | undefined;
  onChange: (patch: Partial<Filters>) => void;
}) {
  const { filters, quick, onChange } = props;
  return (
    <>
      {quick && (
        <QuickFilterChips
          filters={filters}
          caughtKnown={quick.caught !== null}
          onChange={onChange}
        />
      )}
      <FilterChips filters={filters} quick={quick !== undefined} onChange={onChange} />
    </>
  );
}
