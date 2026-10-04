-- module: account
-- Auto-update the updated_at timestamp on every UPDATE to account_data.

create function account_data_update_timestamp() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create trigger account_data_update_timestamp before update on account_data
  for each row execute function account_data_update_timestamp();
