# Design mockups

Source files of the redesign mockups (US-QS-14). The decision and the design tokens are in ADR [0011](../../adr/0011-redesign-direction-greenhouse.md); that ADR and the app (`app/packages/web/src/styles/tokens.css`) are the source of truth. These files only show how the screens are meant to look.

| Folder           | Content                                                                                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `greenhouse/`    | The 22 screens of the chosen direction A "Greenhouse", with the final navigation (Heute, Sammlung, Entdecken, Freunde, Konto): 12 mobile screens at 360 px (`Main` and `M-*`) and 10 desktop screens at 1280 px (`D-*`). |
| `directions/`    | The three directions that were compared before the decision: A Greenhouse, B Field Notes, C Collector (Today and collection or Pokédex, mobile and desktop).                                       |

## What the files are

- Each `*.dc.html` file is one artboard of a canvas made in the Claude Design editor, and `canvas.json` holds the frame position and size of every artboard.
- The artboards load `./support.js`, the editor's runtime. It is **not** part of this repository, so the files do **not** open as ordinary web pages. Open them in the canvas editor, or read the markup as a specification of structure, copy and spacing.
- Every artboard has a light and dark variant through its `theme` property (the `data-props` attribute at the end of the file) and uses example data only: plant names, counts and dates are placeholders, and photos are tinted blocks.
- Texts are German because they are UI texts (ADR 0004). Markup and comments are English.

## Rules

- Do not build the app from these files by copying their markup. Use the owned components in `components/ui` and `components/shared` and the tokens.
- Where a mockup and the ADR disagree, the ADR wins. Where a mockup shows a number that is not measured (for example "42 von 118 Arten"), it is an example, not a requirement.
- Change a mockup only together with the decision it illustrates: update the ADR or the story first.
