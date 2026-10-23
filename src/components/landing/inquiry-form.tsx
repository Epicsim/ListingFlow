"use client";

import { CircleAlert, Lock } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { submitInquiryAction } from "@/app/p/[slug]/actions";
import { CheckboxField, SelectField, TextArea, TextField } from "@/components/ui/fields";
import { CONTACT_METHOD_LABELS, CONTACT_METHODS, TIMELINE_LABELS, TIMELINES } from "@/lib/domain";

type Values = {
  full_name: string;
  email: string;
  phone: string;
  property_address: string;
  timeline: string;
  message: string;
  preferred_contact: string;
  marketing_consent: boolean;
};

const EMPTY: Values = {
  full_name: "",
  email: "",
  phone: "",
  property_address: "",
  timeline: "",
  message: "",
  preferred_contact: "email",
  marketing_consent: false,
};

const FIELD_ORDER = ["full_name", "email", "property_address", "timeline", "preferred_contact", "phone", "message"];

export function InquiryForm({
  slug,
  token,
  utm,
  ctaText,
  agentName,
  consentWording,
  privacyHref,
  disabled = false,
}: {
  slug: string;
  token: string;
  utm: Record<string, string | undefined>;
  ctaText: string;
  agentName: string;
  consentWording: string;
  privacyHref: string;
  disabled?: boolean;
}) {
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const referrerRef = useRef<HTMLInputElement>(null);

  // Record only the referring site's host name (never a full URL with query data).
  useEffect(() => {
    if (!referrerRef.current || !document.referrer) return;
    try {
      const host = new URL(document.referrer).hostname;
      if (host && host !== window.location.hostname) referrerRef.current.value = host;
    } catch {
      /* ignore malformed referrers */
    }
  }, []);

  const set = (name: keyof Values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [name]: e.target.value }));

  const needsPhone = values.preferred_contact === "phone" || values.preferred_contact === "text";

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || pending) return;
    const formData = new FormData(event.currentTarget);
    setFormError(null);
    startTransition(async () => {
      try {
        // On success the action redirects to the confirmation page.
        const result = await submitInquiryAction(slug, formData);
        if (result && !result.ok) {
          setErrors(result.fieldErrors ?? {});
          setFormError(result.message);
          const first = FIELD_ORDER.find((f) => result.fieldErrors?.[f]);
          const target = first ? formRef.current?.elements.namedItem(first) : null;
          if (target instanceof HTMLElement) target.focus();
        }
      } catch (error) {
        // Navigation (the redirect) is not an error; anything else means nothing was saved.
        if ((error as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw error;
        setFormError(
          "We couldn't reach the server, so your request was not sent. Please check your connection and try again.",
        );
      }
    });
  }

  return (
    <div className="rounded-2xl bg-white p-5 shadow-raised ring-1 ring-black/5 sm:p-7">
      <h2 className="font-display text-[22px] font-semibold tracking-tight text-ink">Request your estimate</h2>
      <p className="mt-1 text-sm text-ink-muted">About a minute. No cost and no obligation.</p>

      <form ref={formRef} onSubmit={onSubmit} noValidate className="mt-5 space-y-4" aria-describedby="inquiry-reassurance">
        <input type="hidden" name="form_token" value={token} />
        {Object.entries(utm).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
        <input ref={referrerRef} type="hidden" name="referrer_host" defaultValue="" />
        {/* Spam trap: invisible to people and screen readers, often filled in by bots. */}
        <div aria-hidden className="absolute -left-[10000px] h-px w-px overflow-hidden">
          <label>
            Leave this field empty
            <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
          </label>
        </div>

        <TextField
          name="full_name"
          label="Your name"
          autoComplete="name"
          value={values.full_name}
          onChange={set("full_name")}
          error={errors.full_name}
          required
        />
        <TextField
          name="email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={values.email}
          onChange={set("email")}
          error={errors.email}
          required
        />
        <TextField
          name="property_address"
          label="Property address"
          autoComplete="street-address"
          placeholder="Street, city"
          value={values.property_address}
          onChange={set("property_address")}
          error={errors.property_address}
          required
        />
        <SelectField
          name="timeline"
          label="When are you thinking of selling?"
          value={values.timeline}
          onChange={set("timeline")}
          error={errors.timeline}
          required
        >
          <option value="" disabled>
            Choose one
          </option>
          {TIMELINES.map((t) => (
            <option key={t} value={t}>
              {TIMELINE_LABELS[t]}
            </option>
          ))}
        </SelectField>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink">How should {agentName.split(" ")[0]} contact you?</legend>
          <div className="grid grid-cols-3 gap-2">
            {CONTACT_METHODS.map((m) => (
              <label
                key={m}
                className={`flex cursor-pointer items-center justify-center rounded-lg border px-2 py-2.5 text-center text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--brand-text)] ${
                  values.preferred_contact === m
                    ? "border-[var(--brand-text)] bg-[color-mix(in_srgb,var(--brand)_10%,white)] font-medium text-ink"
                    : "border-line-strong text-ink-soft hover:bg-sunken/50"
                }`}
              >
                <input
                  type="radio"
                  name="preferred_contact"
                  value={m}
                  checked={values.preferred_contact === m}
                  onChange={set("preferred_contact")}
                  className="sr-only"
                />
                {CONTACT_METHOD_LABELS[m]}
              </label>
            ))}
          </div>
          {errors.preferred_contact ? (
            <p className="mt-1.5 text-[13px] font-medium text-danger">{errors.preferred_contact}</p>
          ) : null}
        </fieldset>

        <TextField
          name="phone"
          label="Phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          optional={!needsPhone}
          hint={needsPhone ? "Needed so you can be called or texted." : undefined}
          value={values.phone}
          onChange={set("phone")}
          error={errors.phone}
        />
        <TextArea
          name="message"
          label="Anything you'd like to share?"
          optional
          rows={3}
          maxLength={2000}
          placeholder="Recent updates, questions, the best time to reach you…"
          value={values.message}
          onChange={set("message")}
          error={errors.message}
        />

        <div className="rounded-lg bg-sunken/60 p-3">
          <CheckboxField
            name="marketing_consent"
            label={consentWording}
            checked={values.marketing_consent}
            onChange={(e) => setValues((v) => ({ ...v, marketing_consent: e.target.checked }))}
          />
        </div>

        {formError ? (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {formError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={disabled || pending}
          className="flex h-12 w-full items-center justify-center rounded-lg bg-[var(--brand)] px-5 text-base font-medium text-[var(--brand-contrast)] shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {disabled ? "Submissions are off in preview" : pending ? "Sending…" : ctaText}
        </button>

        <p id="inquiry-reassurance" className="flex gap-2 text-[13px] leading-relaxed text-ink-muted">
          <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Your details are shared only with {agentName}, who will personally prepare your estimate and reach out the
            way you prefer. Submitting doesn&rsquo;t sign you up for marketing. See the{" "}
            <a href={privacyHref} className="underline underline-offset-2 hover:text-ink">
              privacy notice
            </a>
            .
          </span>
        </p>
      </form>
    </div>
  );
}
