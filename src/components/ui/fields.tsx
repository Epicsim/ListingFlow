"use client";

import { type ComponentProps, type ReactNode, useId } from "react";
import { useFieldError } from "./action-form";

interface FieldShellProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}

function FieldShell({ id, label, hint, error, optional, children, className = "" }: FieldShellProps) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between gap-3 text-sm font-medium text-ink">
        <span>{label}</span>
        {optional ? <span className="text-xs font-normal text-ink-muted">Optional</span> : null}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[13px] leading-snug text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-[13px] font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, hint: unknown, error: unknown) {
  return [error ? `${id}-error` : null, hint && !error ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
}

type BaseProps = {
  name: string;
  label: ReactNode;
  hint?: ReactNode;
  optional?: boolean;
  /** Override the error from the surrounding ActionForm. */
  error?: string;
  wrapperClassName?: string;
};

export function TextField({
  name,
  label,
  hint,
  optional,
  error: errorProp,
  wrapperClassName,
  className = "",
  ...props
}: BaseProps & Omit<ComponentProps<"input">, "name">) {
  const id = useId();
  const contextError = useFieldError(name);
  const error = errorProp ?? contextError;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional} className={wrapperClassName}>
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={`input-base ${className}`}
        {...props}
      />
    </FieldShell>
  );
}

export function TextArea({
  name,
  label,
  hint,
  optional,
  error: errorProp,
  wrapperClassName,
  className = "",
  ...props
}: BaseProps & Omit<ComponentProps<"textarea">, "name">) {
  const id = useId();
  const contextError = useFieldError(name);
  const error = errorProp ?? contextError;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional} className={wrapperClassName}>
      <textarea
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={`input-base min-h-24 resize-y leading-relaxed ${className}`}
        {...props}
      />
    </FieldShell>
  );
}

export function SelectField({
  name,
  label,
  hint,
  optional,
  error: errorProp,
  wrapperClassName,
  className = "",
  children,
  ...props
}: BaseProps & Omit<ComponentProps<"select">, "name">) {
  const id = useId();
  const contextError = useFieldError(name);
  const error = errorProp ?? contextError;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional} className={wrapperClassName}>
      <select
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={`input-base appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22%23645d53%22><path d=%22M5.5 7.5 10 12l4.5-4.5%22 stroke=%22%23645d53%22 stroke-width=%221.6%22 fill=%22none%22 stroke-linecap=%22round%22/></svg>')] bg-[length:18px] bg-[right_10px_center] bg-no-repeat pr-9 ${className}`}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  );
}

export function CheckboxField({
  name,
  label,
  hint,
  error: errorProp,
  wrapperClassName = "",
  ...props
}: Omit<BaseProps, "optional"> & Omit<ComponentProps<"input">, "name" | "type">) {
  const id = useId();
  const contextError = useFieldError(name);
  const error = errorProp ?? contextError;
  return (
    <div className={wrapperClassName}>
      <div className="flex items-start gap-3">
        <input
          id={id}
          name={name}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className="mt-0.5 size-[18px] shrink-0 rounded border-line-strong accent-[var(--brand,var(--color-accent))]"
          {...props}
        />
        <label htmlFor={id} className="text-sm leading-snug text-ink-soft">
          {label}
        </label>
      </div>
      {hint && !error ? (
        <p id={`${id}-hint`} className="mt-1 pl-[30px] text-[13px] text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1 pl-[30px] text-[13px] font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
