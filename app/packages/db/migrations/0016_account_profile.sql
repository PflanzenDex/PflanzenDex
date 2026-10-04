-- module: account
-- US-ACC-02: Profile and settings (display name, time zone, notification preferences, privacy and recommendation controls).

-- Add profile and settings columns to account_data.
alter table account_data add column time_zone text;
alter table account_data add column everything_private boolean not null default false;
alter table account_data add column no_recommendations boolean not null default false;
alter table account_data add column notification_settings jsonb;

-- Validate time zone if set (must start with a letter and be a valid IANA time zone).
alter table account_data add constraint account_data_time_zone_check
  check (time_zone is null or (time_zone ~ '^[A-Za-z]' and length(time_zone) <= 64));
