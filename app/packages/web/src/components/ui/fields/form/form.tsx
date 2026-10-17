import { Slot } from "@radix-ui/react-slot";
import * as React from "react";
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Label } from "../../display/label/label";
import {
  FieldContext,
  ItemContext,
  useFormField,
  useItemContextValue,
  useRenderedPart,
} from "./form-context";

/**
 * Form family on react-hook-form (US-QS-07, DS-47, DS-48). `Form` is the provider; spread `useForm()` into it.
 * Validation comes from a zod schema through `zodResolver`. Ids, `aria-describedby` and `aria-invalid` are wired
 * automatically; the invalid border comes from the control's `aria-invalid` (see Input).
 */
const Form = FormProvider;

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

/**
 * Wraps exactly one control (Input, Textarea, Select, ...) and gives it `id`, `aria-describedby` and `aria-invalid`.
 * `aria-describedby` lists only the description and message that are rendered, so no id dangles (US-QS-14).
 */
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

/**
 * The `<form>` of the Form family (US-QS-07, DS-47, DS-48). Place it directly under the `Form` provider and pass
 * `onSubmit={form.handleSubmit(...)}`: the browser's own validation bubbles are off (`noValidate`, the zod
 * resolver owns validation) and the native submit never reloads the page. The handler may be async.
 */
const FormRoot = React.forwardRef<
  HTMLFormElement,
  Omit<React.FormHTMLAttributes<HTMLFormElement>, "onSubmit" | "noValidate"> & {
    onSubmit?: (event: React.FormEvent<HTMLFormElement>) => unknown;
  }
>(({ onSubmit, ...props }, ref) => (
  <form
    ref={ref}
    noValidate
    onSubmit={(event) => {
      event.preventDefault();
      void onSubmit?.(event);
    }}
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
  useFormField,
};
