-- modul: bestand
-- Datenbankgarantie für den Art-Verweis (US-BES-02, AB-10, ADR 0003 O-2, P-04, P-10). `art` ist als globale
-- Referenztabelle registriert (GLOBAL_REFERENCE_TABLES in app/modules.config.mjs): ein einfacher Verweis auf (id) ist
-- erlaubt, weil der Katalog keine Konto-Kennung hat, aber nur mit on delete restrict. Eine unbekannte Art lässt sich
-- nicht mehr eintragen, und das Löschen einer benutzten Art scheitert, statt still etwas mitzunehmen.
-- Die Sichtbarkeitsprüfung (private Vorschläge fremder Konten) bleibt in der Operation; der Verweis prüft nur das Dasein.
-- Die Anwendungsrolle hat weiterhin kein delete auf art.

-- Bestandsprüfung: ein hängender Verweis aus der Zeit ohne Fremdschlüssel bricht die Migration mit einer klaren
-- Meldung ab (nichts wird stillschweigend gelöscht oder umgeschrieben); der Betreiber klärt die Zeilen von Hand.
do $$
declare
  haengend integer;
begin
  select count(*) into haengend from exemplar e where not exists (select 1 from art a where a.id = e.art_id);
  if haengend > 0 then
    raise exception 'exemplar.art_id: % Exemplar(e) verweisen auf eine unbekannte Art; vor dem Fremdschlüssel von Hand klären', haengend;
  end if;
end
$$;

alter table exemplar
  add constraint exemplar_art foreign key (art_id) references art (id) on delete restrict;
