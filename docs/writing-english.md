# Writing English

How we write English in specs, docs, code comments, issues and PRs. The rules come from the writing rules of ASD-STE100 (Simplified Technical English). We adopt the rules, not the dictionary (E-32). They apply to new and touched text; do not rewrite old text for them. No gate checks them.

## Rules

1. **Short sentences.** Up to about 20 words in a procedure or instruction, up to about 25 in a description. Split longer ones.
2. **One instruction per sentence.** Write "Open the file. Add the row." Not "Open the file and add the row, then save it."
3. **Active voice.** Name who acts: "The operation rejects the input", not "The input is rejected".
4. **Imperative for instructions.** "Run `make gates`", not "You should run `make gates`".
5. **Verbs, not nominalisations.** "The API validates the input", not "The API performs a validation of the input".
6. **No noun clusters over three words.** "Rules for the swap request", not "swap request handling rule set". Glossary terms count as one word.
7. **Simple tenses.** Use the simple present for rules and the simple past for what happened. Avoid perfect and progressive forms.
8. **One meaning per word.** Use the same word for the same thing, and do not use one word for two things. Do not vary a term for style.
9. **State the condition first.** "If the keeper has no specimen, show the empty state."

## Technical names

The terms in the glossary of `docs/specs/product/00-product-overview.md` are technical names. Use them exactly (Specimen, Cutting, Light zone, ...). So are our process terms: claim, gate, lead, implementer, owner merge, handoff, worktree, fix plan. Do not replace them with synonyms.

## Avoid list

| Avoid | Write instead |
| --- | --- |
| should | must, or must not; or an open question for the owner |
| handle, deal with | the exact verb: validate, reject, store, retry, show |
| support | what the code does: accepts, reads, shows, exports |
| etc., "...", and so on | the full list, or "for example" with a named rule |
| as needed, if necessary | the condition |
| can (for permission) | may; for ability, name the actor: "the keeper can" |
| utilize, leverage | use |
| in order to | to |
| perform, conduct | the exact verb |
| fast, large, many | a number, or "assumption" (P-08) |

## Check before you commit

- Count the words of each longer sentence.
- Find each "should", "handle", "support" and "etc.".
- Check that each term appears in one spelling only.
