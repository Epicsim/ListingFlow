"use client";

import { ChevronDown, ImageUp } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { contrastRatio, readableOn } from "@/lib/color";
import type { ActionState } from "@/lib/action-state";
import { ActionForm, SubmitButton, useFieldError } from "./ui/action-form";
import { CheckboxField, SelectField, TextArea, TextField } from "./ui/fields";

export interface ProfileDefaults {
  full_name: string;
  brokerage: string;
  license_number: string;
  contact_email: string;
  phone: string;
  primary_color: string;
  service_areas: string;
  intro: string;
  booking_url: string;
  privacy_policy_url: string;
  notification_email: string;
  notify_new_inquiry: boolean;
  send_acknowledgment: boolean;
  timezone: string;
}

interface Props {
  mode: "onboarding" | "settings";
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  defaults: ProfileDefaults;
  timeZones: string[];
  headshotUrl?: string | null;
  logoUrl?: string | null;
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-line bg-surface p-5 shadow-card sm:p-6">
      <legend className="sr-only">{title}</legend>
      <div className="mb-5">
        <h2 className="text-[15px] font-semibold text-ink" aria-hidden>
          {title}
        </h2>
        {description ? <p className="mt-0.5 text-sm text-ink-muted">{description}</p> : null}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function ProfileForm({ mode, action, defaults, timeZones, headshotUrl, logoUrl }: Props) {
  const onboarding = mode === "onboarding";

  const about = (
    <Section
      title="About you"
      description={onboarding ? "Shown on your seller pages so homeowners know who they're talking to." : undefined}
    >
      <TextField name="full_name" label="Full name" defaultValue={defaults.full_name} autoComplete="name" required />
      <TextField name="brokerage" label="Brokerage" optional defaultValue={defaults.brokerage} autoComplete="organization" />
      <TextField
        name="contact_email"
        label="Contact email"
        type="email"
        defaultValue={defaults.contact_email}
        hint="Shown publicly so homeowners can reach you."
        autoComplete="email"
        required
      />
      <TextField name="phone" label="Phone" type="tel" optional defaultValue={defaults.phone} autoComplete="tel" />
      <TextField
        name="service_areas"
        label="Service areas"
        optional
        defaultValue={defaults.service_areas}
        hint="Neighborhoods or cities you serve, separated by commas."
        wrapperClassName="sm:col-span-2"
      />
      <TimeZoneSelect defaultValue={defaults.timezone} options={timeZones} detect={onboarding} />
      <TextField
        name="license_number"
        label="License number"
        optional
        defaultValue={defaults.license_number}
        hint="Many states require it in advertising."
      />
    </Section>
  );

  const pageDetails = (
    <Section title="Your seller pages" description="Defaults used by every campaign. Campaigns can override the booking link.">
      <TextArea
        name="intro"
        label="Short introduction"
        optional
        rows={4}
        maxLength={700}
        defaultValue={defaults.intro}
        hint="A few sentences about how you help sellers. Up to 700 characters."
        wrapperClassName="sm:col-span-2"
      />
      <TextField
        name="booking_url"
        label="Consultation booking link"
        type="url"
        optional
        placeholder="https://calendly.com/your-name/consultation"
        defaultValue={defaults.booking_url}
        hint="Your existing scheduler (Calendly, Cal.com, Google Calendar booking page…). Shown after someone submits a request."
        wrapperClassName="sm:col-span-2"
      />
      <TextField
        name="privacy_policy_url"
        label="Your privacy policy link"
        type="url"
        optional
        placeholder="https://your-brokerage.com/privacy"
        defaultValue={defaults.privacy_policy_url}
        hint="If you leave this blank, your pages link to the standard privacy notice."
        wrapperClassName="sm:col-span-2"
      />
    </Section>
  );

  const branding = (
    <Section title="Branding" description="JPG, PNG or WebP, up to 2 MB each.">
      <ImageField name="headshot" label="Headshot" currentUrl={headshotUrl} shape="round" />
      <ImageField name="logo" label="Logo" currentUrl={logoUrl} shape="wide" />
      <ColorField defaultValue={defaults.primary_color} />
    </Section>
  );

  const notifications = (
    <Section title="Notifications" description="Where new-inquiry alerts go and what homeowners receive automatically.">
      <TextField
        name="notification_email"
        label="Notification email"
        type="email"
        optional
        defaultValue={defaults.notification_email}
        hint="Where new-inquiry alerts are sent. Defaults to your contact email."
        wrapperClassName="sm:col-span-2"
      />
      <CheckboxField
        name="notify_new_inquiry"
        label="Email me when a new inquiry arrives"
        defaultChecked={defaults.notify_new_inquiry}
        wrapperClassName="sm:col-span-2"
      />
      <CheckboxField
        name="send_acknowledgment"
        label="Send homeowners an acknowledgment email after they submit"
        hint="Uses your acknowledgment template. Emails are only sent once email delivery is set up."
        defaultChecked={defaults.send_acknowledgment}
        wrapperClassName="sm:col-span-2"
      />
    </Section>
  );

  return (
    <ActionForm action={action} className="space-y-5" encType="multipart/form-data">
      {about}
      {onboarding ? (
        <details className="group rounded-xl border border-line bg-surface shadow-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-5 py-4 sm:px-6 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block text-[15px] font-semibold">Add branding and your booking link</span>
              <span className="block text-sm text-ink-muted">Optional – you can do this later in Settings.</span>
            </span>
            <ChevronDown aria-hidden className="size-5 text-ink-muted transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-5 border-t border-line p-3 sm:p-4">
            {branding}
            {pageDetails}
          </div>
        </details>
      ) : (
        <>
          {branding}
          {pageDetails}
          {notifications}
        </>
      )}
      <div className="flex items-center justify-end gap-3 pt-1">
        <SubmitButton size="lg" pendingLabel={onboarding ? "Saving…" : "Saving changes…"}>
          {onboarding ? "Save and create my first page" : "Save changes"}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

function TimeZoneSelect({ defaultValue, options, detect }: { defaultValue: string; options: string[]; detect: boolean }) {
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (!detect || !ref.current) return;
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected && options.includes(detected)) ref.current.value = detected;
  }, [detect, options]);
  return (
    <SelectField
      ref={ref}
      name="timezone"
      label="Time zone"
      defaultValue={defaultValue}
      hint="Used for appointment times and dashboard dates."
    >
      {options.map((tz) => (
        <option key={tz} value={tz}>
          {tz.replace(/_/g, " ")}
        </option>
      ))}
    </SelectField>
  );
}

function ColorField({ defaultValue }: { defaultValue: string }) {
  const [color, setColor] = useState(defaultValue);
  const id = useId();
  const error = useFieldError("primary_color");
  const onWhite = contrastRatio(color, "#FFFFFF");
  return (
    <div className="sm:col-span-2">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        Brand color
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <input
          id={id}
          type="color"
          name="primary_color"
          value={color}
          onChange={(e) => setColor(e.target.value.toUpperCase())}
          className="h-10 w-14 cursor-pointer rounded-lg border border-line-strong bg-surface p-1"
          aria-describedby={`${id}-hint`}
        />
        <span
          className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium shadow-sm"
          style={{ background: color, color: readableOn(color) }}
        >
          Button preview
        </span>
        <code className="text-sm text-ink-muted">{color}</code>
      </div>
      <p id={`${id}-hint`} className="mt-1.5 text-[13px] text-ink-muted">
        Used for buttons and accents on your pages.
        {onWhite < 3 ? " This color is light, so links will use dark text to stay readable." : ""}
      </p>
      {error ? <p className="mt-1 text-[13px] font-medium text-danger">{error}</p> : null}
    </div>
  );
}

function ImageField({
  name,
  label,
  currentUrl,
  shape,
}: {
  name: "headshot" | "logo";
  label: string;
  currentUrl?: string | null;
  shape: "round" | "wide";
}) {
  const id = useId();
  const error = useFieldError(name);
  const [preview, setPreview] = useState<string | null>(null);
  const [remove, setRemove] = useState(false);
  const shown = remove ? null : (preview ?? currentUrl ?? null);
  const frame = shape === "round" ? "size-16 rounded-full" : "h-16 w-28 rounded-lg";

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium">
        {label} <span className="font-normal text-ink-muted">· optional</span>
      </span>
      <div className="flex items-center gap-4">
        <div className={`${frame} flex shrink-0 items-center justify-center overflow-hidden border border-line bg-sunken`}>
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt={`${label} preview`} className={`h-full w-full ${shape === "round" ? "object-cover" : "object-contain p-1"}`} />
          ) : (
            <ImageUp aria-hidden className="size-5 text-ink-muted" />
          )}
        </div>
        <div className="min-w-0 space-y-1.5">
          <label
            htmlFor={id}
            className="inline-flex h-8 cursor-pointer items-center rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium shadow-sm hover:bg-sunken/60 focus-within:ring-2 focus-within:ring-accent/30"
          >
            {currentUrl || preview ? "Replace" : "Upload"}
            <input
              id={id}
              name={name}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-invalid={error ? true : undefined}
              onChange={(e) => {
                const file = e.target.files?.[0];
                setPreview(file ? URL.createObjectURL(file) : null);
                if (file) setRemove(false);
              }}
            />
          </label>
          {currentUrl ? (
            <label className="flex items-center gap-2 text-[13px] text-ink-muted">
              <input
                type="checkbox"
                name={`remove_${name}`}
                checked={remove}
                onChange={(e) => setRemove(e.target.checked)}
                className="size-4 accent-[var(--color-accent)]"
              />
              Remove current {label.toLowerCase()}
            </label>
          ) : null}
        </div>
      </div>
      {error ? <p className="mt-1.5 text-[13px] font-medium text-danger">{error}</p> : null}
    </div>
  );
}
