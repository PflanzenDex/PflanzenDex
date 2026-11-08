import type { OfferType } from "@pflanzendex/core";
import { Checkbox } from "@/shared/ui/fields/checkbox/checkbox";
import { Select } from "@/shared/ui/fields/select/select";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../../../swap.de.json";
import { TYPE_TEXT } from "../../offer-form/health-text";
import type { ExchangeFilters } from "../../../api/exchange-api";

const t = texts(table);

export function Filters(props: { value: ExchangeFilters; onChange: (v: ExchangeFilters) => void }) {
  const { value } = props;
  return (
    <div className="flex flex-wrap items-center gap-x-3">
      <label className="grid gap-1 text-sm font-medium">
        <span className="sr-only">{t("friends.typeLabel")}</span>
        <Select
          value={value.type}
          onChange={(e) => props.onChange({ ...value, type: e.target.value as OfferType | "" })}
        >
          <option value="">{t("friends.allTypes")}</option>
          {(Object.keys(TYPE_TEXT) as OfferType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_TEXT[t]}
            </option>
          ))}
        </Select>
      </label>
      <Checkbox
        checked={value.lack}
        onChange={(e) => props.onChange({ ...value, lack: e.target.checked })}
      >
        {t("friends.lackFilter")}
      </Checkbox>
    </div>
  );
}
