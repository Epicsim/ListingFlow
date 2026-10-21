"use client";

import { CheckCircle2, CircleAlert } from "lucide-react";
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  startTransition,
  useActionState,
  useContext,
  useEffect,
  useRef,
} from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/action-state";
import { Button } from "./button";

interface FormContextValue {
  errors: Record<string, string>;
  pending: boolean;
}

const FormContext = createContext<FormContextValue>({ errors: {}, pending: false });

export function useFieldError(name: string): string | undefined {
  return useContext(FormContext).errors[name];
}

export function useFormPending(): boolean {
  return useContext(FormContext).pending;
}

/**
 * Form wrapper for server actions that return an ActionState.
 *
 * Submitting through onSubmit (instead of the `action` prop) keeps what the
 * user typed when the server returns validation errors; React would otherwise
 * reset the form after every submission.
 */
export function ActionForm({
  action,
  children,
  resetOnSuccess = false,
  showSuccess = true,
  className,
  ...rest
}: Omit<ComponentProps<"form">, "action" | "onSubmit"> & {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  resetOnSuccess?: boolean;
  showSuccess?: boolean;
}) {
  const [state, dispatch, pending] = useActionState(action, { ok: false });
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && resetOnSuccess) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <FormContext value={{ errors: state.fieldErrors ?? {}, pending }}>
      <form
        ref={formRef}
        noValidate
        className={className}
        onSubmit={(event) => {
          event.preventDefault();
          const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
          const formData = new FormData(event.currentTarget, submitter);
          startTransition(() => dispatch(formData));
        }}
        {...rest}
      >
        {children}
        <FormMessage state={state} showSuccess={showSuccess} />
      </form>
    </FormContext>
  );
}

function FormMessage({ state, showSuccess }: { state: ActionState; showSuccess: boolean }) {
  const show = state.message && (!state.ok || showSuccess);
  return (
    <div aria-live="polite" role="status" className="empty:hidden">
      {show ? (
        <p
          className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
            state.ok ? "fade-away bg-accent-soft text-accent-ink" : "bg-danger-soft text-danger"
          }`}
        >
          {state.ok ? (
            <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" />
          ) : (
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          )}
          <span>{state.message}</span>
        </p>
      ) : null}
    </div>
  );
}

/** Submit button that reflects the pending state of its ActionForm (or plain form). */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const contextPending = useFormPending();
  const { pending: statusPending } = useFormStatus();
  const pending = contextPending || statusPending;
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-disabled={pending} {...props}>
      {pending ? (pendingLabel ?? "Saving…") : children}
    </Button>
  );
}
