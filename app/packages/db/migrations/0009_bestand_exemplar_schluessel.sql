-- modul: bestand
-- Ziel für zusammengesetzte Fremdschlüssel anderer Module (US-WAC-01, AB-10): Eine Messung verweist auf ihr Exemplar
-- nur als (konto_id, id), damit sie nie auf das Exemplar eines anderen Kontos zeigen kann. Die Tabelle gehört
-- `bestand`, deshalb steht die Ergänzung in einer eigenen Migration des Moduls (AB-14).
alter table exemplar add constraint exemplar_konto_id_id unique (konto_id, id);
