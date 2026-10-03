-- modul: licht
-- Ziel für zusammengesetzte Fremdschlüssel anderer Module (US-BES-02, AB-10): Ein Exemplar verweist auf seinen
-- Standort nur als (konto_id, id), damit es nie auf den Standort eines anderen Kontos zeigen kann. Die Tabelle
-- gehört `licht`, deshalb steht die Ergänzung in einer eigenen Migration des Moduls (AB-14).
alter table standort add constraint standort_konto_id_id unique (konto_id, id);
