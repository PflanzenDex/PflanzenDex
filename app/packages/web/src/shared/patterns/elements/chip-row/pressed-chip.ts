/**
 * The class part that every pressed toggle chip shares (US-QS-15, SG-COLOR-03, SG-COLOR-05, SG-TYPE-01, issue 2612): a 2 px
 * border in the primary colour, and a label in the weight 600 of every control label, never 700 (700 is for the page title
 * only). The tinted fill comes from the button variant `secondary`; the check mark is the chip's own icon, so the state is
 * not told by colour alone. In forced colors the button's own `forced-colors:border` (1 px) would replace the thicker border
 * and take that cue away, so the pressed chip asks for its 2 px there too (WCAG 1.4.11). The quick filters of "Entdecken"
 * and the filter chips of the layer "Filter" in "Pokédex" take the part from here, so the pressed look changes in one place.
 */
export const PRESSED_CHIP = "border-2 border-primary font-semibold forced-colors:border-2";
