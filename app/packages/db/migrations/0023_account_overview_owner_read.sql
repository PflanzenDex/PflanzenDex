-- module: account
-- Operator overview under a NON-superuser table owner (#294, QG-D1, US-ACC-05). `account` and `account_data` have
-- forced row security (`tenant_protection`), which also binds the table owner. `operator_overview()` is a
-- `security definer` function that runs as the owner and must count every account; as a non-superuser owner it saw only
-- the operator's own row, so the counts were wrong (the old test suite connected as a superuser and never noticed).
-- Fix: a SELECT-only rule for the owner role, taken from `current_user` at migration time (the role that owns the
-- tables). The application role keeps the `tenant` rule only, so it still sees nothing but its own account and reaches
-- the totals solely through the checked function. Writes of the owner stay bound by the forced rule.
-- Expand only: a new rule, nothing removed; the previous app version keeps working.

create policy owner_count on account for select to current_user using (true);
create policy owner_count on account_data for select to current_user using (true);
