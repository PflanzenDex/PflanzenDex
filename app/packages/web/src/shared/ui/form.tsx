import { Slot } from "@radix-ui/react-slot";
import * as React from "react";
import {
  Controller,
  FormProvider,
  useForm,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
  type UseFormProps,
} from "react-hook-form";
import { cva } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";
import { Label } from "./label";
import {
  FieldContext,
  ItemContext,
  focusSend,
  keepFieldFocus,
  useFormField,
  useItemContextValue,
  useRenderedPart,
} from "./form.context";

/**
 * Form family on react-hook-form (US-QS-07, DS-47, DS-48): `Form` is the provider, spread `useFieldForm()` into it.
 * Zod schemas validate through `zodResolver`; ids, `aria-describedby` and `aria-invalid` are wired (see Input).
 */
const Form = FormProvider;

/**
 * The hook of every form (US-QS-32, SG-FORM-05): a field is validated when it is left and on each change after that,
 * so its message and red frame clear together; on send all fields are validated and the first wrong one takes focus.
 */
function useFieldForm<T extends FieldValues>(
  options?: Omit<UseFormProps<T>, "mode" | "reValidateMode">,
) {
  return useForm<T>({ ...options, mode: "onTouched", reValidateMode: "onChange" });
}

/** Binds a named field to the form; the render prop receives react-hook-form's `field` (spread it on the control). */
function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(props: ControllerProps<TFieldValues, TName>) {
  return (
    <FieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FieldContext.Provider>
  );
}

/** Groups label, control, description and message of one field and owns their shared id. */
const FormItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return (
      <ItemContext.Provider value={useItemContextValue()}>
        <div ref={ref} className={cn("flex flex-col gap-2", className)} {...props} />
      </ItemContext.Provider>
    );
  },
);
FormItem.displayName = "FormItem";

/** Form label and message tone (US-QS-07, DS-34): the error state is a variant, not a ternary. */
const formTone = cva("", {
  variants: { invalid: { true: "text-destructive", false: "" } },
  defaultVariants: { invalid: false },
});

const formMessageTone = cva("text-sm font-medium", {
  variants: { invalid: { true: "text-destructive", false: "text-muted-foreground" } },
  defaultVariants: { invalid: false },
});

const FormLabel = React.forwardRef<HTMLLabelElement, React.ComponentPropsWithoutRef<typeof Label>>(
  ({ className, ...props }, ref) => {
    const { controlId, error } = useFormField();
    return (
      <Label
        ref={ref}
        htmlFor={controlId}
        className={cn(formTone({ invalid: Boolean(error) }), className)}
        {...props}
      />
    );
  },
);
FormLabel.displayName = "FormLabel";

/** Wraps one control: `id`, `aria-describedby` (rendered parts only, US-QS-14) and `aria-invalid`. */
const FormControl = React.forwardRef<HTMLElement, React.ComponentPropsWithoutRef<typeof Slot>>(
  (props, ref) => {
    const { error, controlId, descriptionId, messageId, rendered } = useFormField();
    const describedBy = [
      rendered.description && descriptionId,
      rendered.message && messageId,
    ].filter(Boolean);
    return (
      <Slot
        ref={ref}
        id={controlId}
        aria-describedby={describedBy.length > 0 ? describedBy.join(" ") : undefined}
        aria-invalid={error ? true : undefined}
        {...props}
      />
    );
  },
);
FormControl.displayName = "FormControl";

const FormDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  const { descriptionId } = useFormField();
  useRenderedPart("description", true);
  return (
    <p
      ref={ref}
      id={descriptionId}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
});
FormDescription.displayName = "FormDescription";

type FormMessageProps = React.HTMLAttributes<HTMLParagraphElement> & {
  /** Form-level message (e.g. `root.server`): reads this path instead of the surrounding FormField. */
  name?: string;
};

/**
 * Shows the error text of its field (the text the resolver or `setError` carries, German by caller) or, without
 * an error, the children. It is a live region (`role="alert"`), so a new error is announced (DS-38).
 */
const FormMessage = React.forwardRef<HTMLParagraphElement, FormMessageProps>(
  ({ className, children, name, ...props }, ref) => {
    const own = React.useContext(FieldContext);
    const item = React.useContext(ItemContext);
    const { getFieldState } = useFormContext();
    const path = name ?? own?.name ?? "";
    const state = useFormState({ name: path });
    const message = getFieldState(path, state).error?.message;
    const body = message ?? children;
    const fallbackId = React.useId();
    const id = !name && item ? `${item.id}-message` : fallbackId;
    useRenderedPart("message", !name && Boolean(body));
    if (!body) return null;
    return (
      <p
        ref={ref}
        id={id}
        role={message ? "alert" : undefined}
        className={cn(formMessageTone({ invalid: Boolean(message) }), className)}
        {...props}
      >
        {body}
      </p>
    );
  },
);
FormMessage.displayName = "FormMessage";

/** The `<form>` under `Form`: `noValidate`, no reload, keeps the field focus on a send press. */
const FormRoot = React.forwardRef<
  HTMLFormElement,
  Omit<React.FormHTMLAttributes<HTMLFormElement>, "onSubmit" | "noValidate"> & {
    onSubmit?: (event: React.FormEvent<HTMLFormElement>) => unknown;
  }
>(({ onSubmit, onMouseDown, ...props }, ref) => (
  <form
    ref={ref}
    noValidate
    onSubmit={(event) => {
      event.preventDefault();
      void onSubmit?.(event);
    }}
    onMouseDown={(event) => keepFieldFocus(event, onMouseDown)}
    onClickCapture={focusSend}
    {...props}
  />
));
FormRoot.displayName = "FormRoot";

export {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormRoot,
  useFieldForm,
  useFormField,
};
