import { useState, type MouseEventHandler, type ReactNode, type Ref } from "react";
import { cn } from "@/shared/lib/utils";
import { GroupedRow } from "../grouped-list/grouped-list";
import { OBJECT_TEXT, ROW_ACTION } from "../grouped-list/group-classes";
import { ObjectPlaceholder } from "../object-placeholder/object-placeholder";

// The row of one object (a plant, a species, a wish; US-QS-32, SG-LIST-03): a 56 px square thumbnail, the name on up to two
// lines, one meta line and at most one trailing element. The whole row is the target. The row has no surface of its own: it
// sits in one flat group (FX-35, SG-SHAPE-03), which draws the card and the hairline between its rows.
// An action beside the row wraps: when the text (thumbnail and two lines of name) and the action do not fit beside each other,
// the action moves below the text on its own line (issue 2322, SG-TYPE-05, SG-LIST-03); the text keeps its basis width.
const SURFACE = "flex min-w-0 flex-wrap items-stretch text-card-foreground";
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
   * sit in a link or a button. It counts as the row's one trailing element, so the chevron steps aside. When the row is too
   * narrow for the text and the action side by side (200 % text on a phone), the action moves below the text, at the trailing
   * edge of its own line (issue 2322).
   */
  action?: ReactNode;
  /** The row's own box: a lazy picture watches it (`useObjectPhoto`). */
  rootRef?: Ref<HTMLDivElement> | undefined;
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
 * because the list of `ScrollEntries` already wraps each row. An action sits beside the link or button, so a button never nests
 * in another one. Every row that opens a view or a layer shows the chevron unless a trailing element or an action takes its
 * place; there is no way to hide it (SG-TOUCH-02, issue 2355).
 */
export function ObjectRow(props: ObjectRowProps) {
  const hasAction = props.action !== undefined;
  return (
    <div ref={props.rootRef} data-object-row="" className={SURFACE}>
      <div className={cn("flex min-w-0", OBJECT_TEXT)}>
        <GroupedRow
          bare
          variant="object"
          id={props.id}
          to={props.to}
          onClick={props.onClick}
          haspopup={props.haspopup}
          expanded={props.expanded}
          hasAction={hasAction}
          leading={<Thumbnail src={props.src} alt={props.alt ?? ""} />}
          title={props.title}
          meta={props.meta}
          trailing={props.trailing}
        />
      </div>
      {hasAction && (
        <div className={cn("flex items-center py-1 pr-3", ROW_ACTION)}>{props.action}</div>
      )}
    </div>
  );
}
