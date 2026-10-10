-- module: collection
-- US-SOZ-05: the day a cutting was repotted (US-BES-04), so the feed can show "Potted" with its real date. A local
-- calendar date of the keeper (NFR-08), set by the repot operation; null = unknown (an older repot, or no time zone
-- given), never guessed (P-08). Additive and nullable: the previous app version ignores it.

alter table specimen add column repotted_at date;
