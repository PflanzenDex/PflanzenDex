/**
 * The class part that every pressed toggle chip shares (US-QS-15, SG-COLOR-03, SG-COLOR-05, SG-TYPE-01, issue 2612, owner
 * decision d-178): an outlined chip, not a tinted button. It has the card fill (the fill of the search field and of an unpressed
 * chip), a 2 px border in the primary colour and primary text, so the check mark, which is the chip's own icon in the text
 * colour, is primary too. The label keeps the weight 600 of every control label, never 700 (700 is for the page title only).
 * The chip takes the neutral `ghost` variant from the caller (a hover that tints it for a moment), so no tinted fill stands at
 * rest and the chip cannot be taken for the tinted buttons "Filter" and "Art vorschlagen" (SG-BTN-02, SG-COLOR-01). The state
 * is not told by colour alone: the check mark, the thicker border and `aria-pressed`. In forced colors the button's own
 * `forced-colors:border` (1 px) would replace the thicker border and take that cue away, so the pressed chip asks for its 2 px
 * there too (WCAG 1.4.11). The quick filters of "Entdecken" and the filter chips of the layer "Filter" in "Pokédex" take the
 * part from here, so the pressed look changes in one place.
 */
export const PRESSED_CHIP =
  "border-2 border-primary bg-card font-semibold text-primary forced-colors:border-2";
