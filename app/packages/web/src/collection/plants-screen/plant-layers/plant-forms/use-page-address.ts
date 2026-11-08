import type { Token } from "../../../specimens/hooks/use-collection";
import { useFormPlant, type FormAddress, type FormPlant } from "./address/form-address";
import { useFormAddress } from "./address/use-form-address";

/**
 * The address of the forms of the page. Within the area the area's address and plant are used; a page of its own (no
 * address passed in) addresses its forms itself, so its forms behave the same (US-QS-15).
 */
export function usePageAddress(
  api: string,
  token: Token,
  wired: { formAddress?: FormAddress; formPlant?: FormPlant },
): { form: FormAddress; formPlant: FormPlant } {
  const standalone = wired.formAddress === undefined;
  const own = useFormAddress(standalone);
  const read = useFormPlant(api, token, standalone ? own.plantId : null);
  return { form: wired.formAddress ?? own, formPlant: wired.formPlant ?? read };
}
