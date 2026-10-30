-- module: catalog
-- US-QS-24 (#1033): the source text of the dev seed species is shown to users, so it is German now. Only rows that carry
-- the exact old English marker change; the value stays a source statement (P-08), no field is filled. Expand only: a text
-- changes, the previous app version shows whichever text the row has.
update species
   set source = 'Dev-Seed: Namen und Familie aus allgemeinem botanischem Wissen; Schwierigkeit und Lichtbedarf unbekannt'
 where source = 'Dev seed: names and family from common botanical knowledge; difficulty and light need unknown';
