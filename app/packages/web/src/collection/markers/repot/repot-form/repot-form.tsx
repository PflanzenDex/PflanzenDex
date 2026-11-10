import { useCallback, useState, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Control } from "react-hook-form";
import { useRequest, type ApiError } from "@/shared/data";
import { refusalText } from "@/shared/lib/error-text";
import { texts } from "@/shared/lib/text-rules/texts";
import { Button } from "@/shared/ui/button/button";
import { useHeldLoader } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormRoot,
} from "@/shared/ui/fields/form/form";
import { DateField } from "@/shared/ui/fields/input/native-fields/date-field/date-field";
import { FormButtons, Quiet, TITLE, Warning } from "../../../specimens/cards/parts/parts";
import { LoadingNote } from "../../../specimens/cards/parts/parts";
import { useEdited, useRefusal } from "../../../specimens/model/refusal";
import { repotSchema, type RepotFields } from "../../../specimens/model/schemas";
import type { RepotTarget, useRepot } from "../../../specimens/hooks/use-repot";
import { useToday } from "../../catch-date/use-today";
import { loadRepotPlan, REPOT_PLAN_KEY, type RepotPlanView } from "../repot-api";
import table from "../repot.de.json";
import { PotField } from "./pot-field/pot-field";

const t = texts(table);

/** The status names of a plant and a cutting, compared as values (FR-QG-12). */
const PLANT_STATUS = "plant" as const;
const CUTTING_STATUS = "cutting" as const;

/** What the form needs from the page: the target, the write and the access to the plant's plan. */
type FormState = Pick<ReturnType<typeof useRepot>, "send" | "setOpen" | "access"> & {
  open: RepotTarget;
};

/** The fields the server refused by name: the day (`date`) and the pot it named (`potId`, US-BES-19). */
const repotFields = (error: ApiError): ("date" | "potId")[] =>
  (["date", "potId"] as const).filter((f) => error.details?.some((d) => d.field === f));

/**
 * Whether the form offers the pot choice: a plant, the equipment on and the repot planner on, and a pot to choose (the
 * recorded one or a free one). Otherwise no pot is named and the plant leaves its pot (US-BES-19, DM-EQU-06).
 */
const potChoiceOf = (planted: boolean, plan: RepotPlanView | null): boolean =>
  planted &&
  plan !== null &&
  !plan.hidden &&
  !plan.equipmentOff &&
  (plan.freePots.length > 0 || plan.currentPot !== null);

/** The day of the repot: the keeper's local today preset, never later (NFR-08). */
function RepotDateField(props: {
  control: Control<RepotFields>;
  today: string;
  label: string;
  hint: string;
}) {
  return (
    <FormField
      control={props.control}
      name="date"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{props.label}</FormLabel>
          <FormControl>
            <DateField {...field} max={props.today} />
          </FormControl>
          <FormDescription>{props.hint}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** The frame of the form: the one heading, the target's name and what the write does (P-09). */
function RepotFrame(props: { open: RepotTarget; children: ReactNode }) {
  const planted = props.open.status === PLANT_STATUS;
  return (
    <section aria-labelledby="repot-title">
      <h1 id="repot-title" className={TITLE}>
        {planted ? t("form.titlePlant") : t("form.titleCutting")}
      </h1>
      <p className="mb-2 text-muted-foreground">{t("form.nameLine", { name: props.open.name })}</p>
      <Quiet className="mb-5">{planted ? t("form.quietPlant") : t("form.quietCutting")}</Quiet>
      {props.children}
    </section>
  );
}

/**
 * The form with its fields. A cutting is potted (US-BES-04), a plant is repotted and may name its pot (US-BES-19); a
 * refusal stays in the form by its code (P-10), and "Speichern" writes nothing before it is pressed.
 */
function RepotFormBody(props: FormState & { plan: RepotPlanView | null; reload: () => void }) {
  const { open, send, setOpen, plan, reload } = props;
  const planted = open.status === PLANT_STATUS;
  const today = useToday();
  const [error, setError] = useState<ApiError | null>(null);
  const potChoice = potChoiceOf(planted, plan);
  const form = useForm<RepotFields>({
    resolver: zodResolver(repotSchema),
    defaultValues: { date: today, potId: plan?.currentPot?.id ?? "" },
  });
  const alertText = useRefusal(error, form.setError, repotFields);
  useEdited(
    form,
    useCallback(() => setError(null), []),
  );
  const submit = form.handleSubmit(async (values) => {
    const potId = potChoice && values.potId !== "" ? values.potId : undefined;
    const refused = await send(values.date, potId);
    setError(refused);
    // A refused pot may be taken or gone by now: the plan is read again for the choice (P-10).
    if (refused && planted) reload();
  });
  return (
    <RepotFrame open={open}>
      <Form {...form}>
        <FormRoot
          onSubmit={submit}
          aria-label={planted ? t("form.ariaPlant") : t("form.ariaCutting")}
          className="flex max-w-xl flex-col gap-4"
        >
          <RepotDateField
            control={form.control}
            today={today}
            label={planted ? t("form.datePlant") : t("form.dateCutting")}
            hint={planted ? t("form.dateHintPlant") : t("form.dateHintCutting")}
          />
          {potChoice && plan !== null ? <PotField control={form.control} plan={plan} /> : null}
          {planted && !potChoice ? <Quiet>{t("pot.leaveNotice")}</Quiet> : null}
          {alertText !== null && (
            <Warning>
              <p>{alertText}</p>
            </Warning>
          )}
          <FormButtons
            submit={t("form.submit")}
            cancel={t("form.cancel")}
            pending={form.formState.isSubmitting}
            onCancel={() => setOpen(null)}
          />
        </FormRoot>
      </Form>
    </RepotFrame>
  );
}

/** A plant's repot waits for its plan: the pots it may name come from there, so nothing is sent before it is read. */
function PlantRepotForm(props: FormState & { open: RepotTarget }) {
  const { open, access, setOpen } = props;
  const plan = useRequest<RepotPlanView>({
    queryKey: REPOT_PLAN_KEY(open.id),
    token: access.token,
    load: (token) => loadRepotPlan(access.api, token, open.id),
    fresh: true,
  });
  const loading = useHeldLoader(plan.status === "pending");
  if (loading)
    return (
      <RepotFrame open={open}>
        <LoadingNote>{t("form.loadingPots")}</LoadingNote>
      </RepotFrame>
    );
  if (plan.status === "error" || plan.value === undefined)
    return (
      <RepotFrame open={open}>
        <Warning>
          <p>{t("form.potsFailed")}</p>
          {plan.error ? <p>{refusalText(plan.error)}</p> : null}
        </Warning>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button type="button" size="touch" onClick={plan.retry}>
            {t("form.retry")}
          </Button>
          <Button type="button" size="touch" variant="outline" onClick={() => setOpen(null)}>
            {t("form.cancel")}
          </Button>
        </div>
      </RepotFrame>
    );
  return <RepotFormBody {...props} plan={plan.value} reload={plan.retry} />;
}

/**
 * Pot a cutting (US-BES-04) or repot a plant (US-BES-19): one day field preset to today, for a plant the pot it moves
 * into, "Speichern" writes, "Abbrechen" changes nothing.
 */
export function RepotForm(props: { state: FormState }) {
  const { state } = props;
  if (state.open.status === CUTTING_STATUS)
    return <RepotFormBody {...state} open={state.open} plan={null} reload={() => undefined} />;
  return <PlantRepotForm {...state} open={state.open} />;
}
