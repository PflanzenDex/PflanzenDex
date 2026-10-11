/** The columns of an equipment row as `EquipmentRow` (US-EQU-01 to US-EQU-05). */
// Dates leave as text `YYYY-MM-DD` (NFR-08), the price as a number.
export const COLUMNS = `id, type, name, status, manufacturer, model, product_id as "productId",
  price_eur::float8 as "priceEur", to_char(bought_at, 'YYYY-MM-DD') as "boughtAt", note,
  light_zone_id as "lightZoneId", power_w as "powerW", lux_statement as "luxStatement",
  to_char(in_operation_since, 'YYYY-MM-DD') as "inOperationSince", check_interval_days as "checkIntervalDays",
  to_char(last_checked_on, 'YYYY-MM-DD') as "lastCheckedOn", lifetime_value as "lifetimeValue",
  lifetime_source as "lifetimeSource", case when status is null then coalesce(supply, 'available') end as supply,
  agent_link as "agentLink"`;
