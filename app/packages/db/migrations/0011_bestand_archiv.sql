-- modul: bestand
-- Archivieren (US-BES-07, DM-BES-02): Datum und Grund der Archivierung am Exemplar. `status` kennt `archiviert` schon seit
-- 0007. Die Spalten sind nullable, die alte App-Version schreibt sie nie und liest sie nicht (Expand/Contract).
alter table exemplar
  -- Lokales Kalenderdatum des Nutzers, kein Zeitpunkt (NFR-08).
  add column archiviert_am date,
  add column archiviert_grund text check (char_length(archiviert_grund) between 1 and 250),
  -- Status vor der Archivierung, damit ein Steckling nach dem Wiederherstellen ein Steckling bleibt.
  add column status_vor_archiv text check (status_vor_archiv in ('pflanze', 'steckling'));

-- Status, Datum und Grund gehören zusammen: ein archiviertes Exemplar hat Datum und Grund, ein anderes keines.
alter table exemplar add constraint exemplar_archiv_zusammen check (
  (status = 'archiviert' and archiviert_am is not null and archiviert_grund is not null)
  or (status <> 'archiviert' and archiviert_am is null and archiviert_grund is null)
);
