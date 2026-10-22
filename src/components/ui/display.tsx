import type { ComponentProps, ReactNode } from "react";

export function Card({ className = "", ...props }: ComponentProps<"section">) {
  return <section className={`rounded-2xl border border-line bg-surface shadow-card ${className}`} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-5 sm:px-6">
      <div className="min-w-0">
        <h2 id={id} className="text-[15px] font-semibold tracking-tight text-ink">
          {title}
        </h2>
        {description ? <p className="mt-0.5 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-center justify-between gap-5 sm:mb-9">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1.5 text-sm text-ink-muted">{eyebrow}</div> : null}
        <h1 className="font-display text-[28px] leading-tight font-semibold tracking-[-0.035em] text-ink sm:text-[34px]">
          {title}
        </h1>
        {description ? <p className="mt-1.5 max-w-2xl text-[15px] text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

type Tone = "neutral" | "accent" | "warning" | "danger" | "info";

const tones: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-soft ring-line",
  accent: "bg-accent-soft text-accent-ink ring-accent/15",
  warning: "bg-warning-soft text-warning ring-warning/15",
  danger: "bg-danger-soft text-danger ring-danger/15",
  info: "bg-info-soft text-info ring-info/15",
};

export function Badge({ tone = "neutral", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  compact = false,
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? "px-4 py-8" : "px-6 py-14"}`}>
      {icon ? (
        <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-sunken text-ink-muted [&>svg]:size-5">
          {icon}
        </div>
      ) : null}
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {children ? <div className="mt-1 max-w-md text-sm text-ink-muted">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
  icon,
  className = "",
}: {
  tone?: Tone;
  title?: ReactNode;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  const palette: Record<Tone, string> = {
    neutral: "border-line bg-sunken/70 text-ink-soft",
    accent: "border-accent/20 bg-accent-soft text-accent-ink",
    warning: "border-warning/20 bg-warning-soft text-warning",
    danger: "border-danger/20 bg-danger-soft text-danger",
    info: "border-info/15 bg-info-soft text-info",
  };
  return (
    <div className={`flex gap-3 rounded-lg border px-4 py-3 text-sm ${palette[tone]} ${className}`}>
      {icon ? <div className="mt-0.5 shrink-0 [&>svg]:size-4">{icon}</div> : null}
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={title ? "mt-0.5" : ""}>{children}</div>
      </div>
    </div>
  );
}

export function DefinitionList({ items }: { items: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-[max-content_1fr]">
      {items.map((item, i) => (
        <div key={i} className="contents">
          <dt className="text-ink-muted">{item.label}</dt>
          <dd className="-mt-2 min-w-0 break-words text-ink sm:mt-0">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
