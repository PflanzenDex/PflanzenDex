import { useState, type MouseEventHandler, type ReactNode, type Ref } from "react";
import { GroupedRow } from "../grouped-list/grouped-list";
import { ObjectPlaceholder } from "../object-placeholder/object-placeholder";

// The row of one object (a plant, a species, a wish; US-QS-32, SG-LIST-03): a 56 px square thumbnail, the name on up to
// two lines, one meta line and at most one trailing element. The whole row is the target. The surface is a card of its
// own, so a list of rows reads as objects, not as settings.
const SURFACE =
  "flex min-w-0 items-stretch overflow-hidden rounded-lg border border-border bg-card text-card-foreground";
/** The thumbnail box is reserved before the picture comes (SG-PHOTO-01): 56 px square in px, so it keeps its size at a large text size; the control radius. */
const THUMB = "flex size-[56px] shrink-0 items-center justify-center overflow-hidden rounded-lg";

export type ObjectRowProps = {
  id?: string | undefined;
  /** The row navigates: it is a link to this address. Wins over `onClick` when both are given. */
  to?: string | undefined;
  /** The row acts or opens a layer: it is a button. */
  onClick?: MouseEventHandler<HTMLButtonElement> | undefined;
  /** The row opens a layer: announced as a dialog trigger, with whether the layer is open. */
  haspopup?: "dialog" | undefined;
  expanded?: boolean | undefined;
  /** The picture's address. Without it, or when the picture fails to load, the drawn placeholder shows (SG-PHOTO-02). */
  src?: string | undefined;
  /** The alternative text. Empty (the default) makes the picture decorative: the name of the row is its label. */
  alt?: string | undefined;
  /** The name: wraps to two lines, then clamps (SG-TYPE-05). */
  title: ReactNode;
  /** One meta line, which truncates (SG-LIST-03). */
  meta?: ReactNode | undefined;
  /** The one trailing element: a badge or a value. It takes the place of the chevron (SG-LIST-03). */
  trailing?: ReactNode;
  /**
   * An action beside the row, at its trailing edge (for example "Umstellen"). It is never inside the row: a button cannot
   * sit in a link or a button. It counts as the row's one trailing element, so the chevron steps aside.
   */
  action?: ReactNode;
  /** The row's own box: a lazy picture watches it (`useObjectPhoto`). */
  rootRef?: Ref<HTMLDivElement> | undefined;
  /**
   * The chevron of a link or button row: shown by default unless a trailing element or an action takes its place; set `false`
   * where the row opens a layer and no other view (SG-TOUCH-02). It cannot be drawn on a row without a link or a button.
   */
  chevron?: boolean | undefined;
};

/** The thumbnail: the picture, or the drawn placeholder while there is none and when it failed (P-10: no empty box). */
function Thumbnail({ src, alt }: { src: string | undefined; alt: string }) {
  // The address that failed: the placeholder stays until another address comes.
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span className={THUMB}>
      {src !== undefined && src !== failed ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
          onError={() => setFailed(src)}
        />
      ) : (
        <ObjectPlaceholder />
      )}
    </span>
  );
}

/**
 * One object in a list (US-QS-32, SG-LIST-03). The row is a `GroupedRow` of the object variant without its own list item,
 * because the list of a pager already wraps each row. An action sits beside the link or button, so a button never nests
 * in another one.
 */
export function ObjectRow(props: ObjectRowProps) {
  const hasAction = props.action !== undefined;
  return (
    <div ref={props.rootRef} className={SURFACE}>
      <div className="flex min-w-0 flex-1">
        <GroupedRow
          bare
          variant="object"
          id={props.id}
          to={props.to}
          onClick={props.onClick}
          haspopup={props.haspopup}
          expanded={props.expanded}
          chevron={props.chevron ?? (props.trailing === undefined && !hasAction)}
          leading={<Thumbnail src={props.src} alt={props.alt ?? ""} />}
          title={props.title}
          meta={props.meta}
          trailing={props.trailing}
        />
      </div>
      {hasAction && <div className="flex shrink-0 items-center pr-3">{props.action}</div>}
    </div>
  );
}
