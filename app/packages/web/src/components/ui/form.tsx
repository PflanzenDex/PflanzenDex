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
import { cn } from "@/lib/utils";
import { Label } from "./label";

/**
 * Form family on react-hook-form (US-QS-07, DS-47, DS-48). `Form` is the provider; spread `useForm()` into it.
 * Validation comes from a zod schema through `zodResolver`. Ids, `aria-describedby` and `aria-invalid` are wired
 * automatically; the invalid border comes from the control's `aria-invalid` (see Input).
 */
const Form = FormProvider;

type FieldContextValue = { name: string };
const FieldContext = React.createContext<FieldContextValue | null>(null);
const ItemContext = React.createContext<{ id: string } | null>(null);

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

function useFormField() {
  const field = React.useContext(FieldContext);
  const item = React.useContext(ItemContext);
  const { getFieldState } = useFormContext();
  const state = useFormState({ name: field?.name ?? "" });
  if (!field || !item)
    throw new Error("FormLabel, FormControl and friends belong inside FormField and FormItem");
  const { error } = getFieldState(field.name, state);
  const { id } = item;
  return {
    id,
    name: field.name,
    error,
    controlId: `${id}-control`,
    descriptionId: `${id}-description`,
    messageId: `${id}-message`,
  };
}

/** Groups label, control, description and message of one field and owns their shared id. */
const FormItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    const id = React.useId();
    return (
      <ItemContext.Provider value={{ id }}>
        <div ref={ref} className={cn("flex flex-col gap-2", className)} {...props} />
      </ItemContext.Provider>
    );
  },
);
FormItem.displayName = "FormItem";

const FormLabel = React.forwardRef<HTMLLabelElement, React.ComponentPropsWithoutRef<typeof Label>>(
  ({ className, ...props }, ref) => {
    const { controlId, error } = useFormField();
    return (
      <Label
        ref={ref}
        htmlFor={controlId}
        className={cn(error && "text-destructive", className)}
        {...props}
      />
    );
  },
);
FormLabel.displayName = "FormLabel";

/** Wraps exactly one control (Input, Textarea, Select, ...) and gives it `id`, `aria-describedby` and `aria-invalid`. */
const FormControl = React.forwardRef<HTMLElement, React.ComponentPropsWithoutRef<typeof Slot>>(
  (props, ref) => {
    const { error, controlId, descriptionId, messageId } = useFormField();
    return (
      <Slot
        ref={ref}
        id={controlId}
        aria-describedby={error ? `${descriptionId} ${messageId}` : descriptionId}
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
    if (!body) return null;
    return (
      <p
        ref={ref}
        id={id}
        role={message ? "alert" : undefined}
        className={cn(
          "text-sm font-medium",
          message ? "text-destructive" : "text-muted-foreground",
          className,
        )}
        {...props}
      >
        {body}
      </p>
    );
  },
);
FormMessage.displayName = "FormMessage";

export {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
};
