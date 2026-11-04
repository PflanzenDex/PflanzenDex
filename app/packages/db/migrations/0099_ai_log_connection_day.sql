-- module: ai
-- NFR-12, US-QG-07 (#1243): the daily limit counts the calls of one connection since the start of the UTC day, on every AI call
-- (`AiLogPostgres.countSince`). The log is never purged, and for an account with several busy connections the planner scans the
-- calls of the whole account of the day (`ai_log_list`). This index serves the count as one range of one connection.
-- Plain `create index`: the runner applies each file in one transaction, where `concurrently` is not allowed; the build
-- blocks writes to `ai_log` for its duration (docs/guides/reference/app.md). Additive: the previous app version does not name it.
create index ai_log_connection_day on ai_log (account_id, connection_id, created_at);
