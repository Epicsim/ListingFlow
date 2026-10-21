"use client";

import { ImageUp, Info } from "lucide-react";
import { useId, useState } from "react";
import type { ActionState } from "@/lib/action-state";
import { ActionForm, SubmitButton, useFieldError, useFormPending } from "./ui/action-form";
import { Button } from "./ui/button";
import { Notice } from "./ui/display";
import { TextArea, TextField } from "./ui/fields";

export interface CampaignDefaults {
  name: string;
  slug: string;
  headline: string;
  description: string;
  cta_text: string;
  thank_you_message: string;
  booking_url: string;
}

export function CampaignForm({
  action,
  defaults,
  campaignId,
  heroUrl,
  origin,
  defaultBookingUrl,
  isPublished,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  defaults: CampaignDefaults;
  campaignId?: string;
  heroUrl?: string | null;
  origin: string;
  defaultBookingUrl: string | null;
  isPublished?: boolean;
}) {
  const creating = !campaignId;
  return (
    <ActionForm action={action} className="space-y-5" encType="multipart/form-data">
      {campaignId ? <input type="hidden" name="campaign_id" value={campaignId} /> : null}

      <section className="rounded-xl border border-line bg-surface p-5 shadow-card sm:p-6">
        <h2 className="mb-5 text-[15px] font-semibold">Basics</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            name="name"
            label="Campaign name"
            defaultValue={defaults.name}
            hint="Only you see this."
            required
          />
          <SlugField defaultValue={defaults.slug} origin={origin} warnOnChange={Boolean(isPublished)} />
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface p-5 shadow-card sm:p-6">
        <h2 className="text-[15px] font-semibold">Page content</h2>
        <p className="mt-0.5 mb-5 text-sm text-ink-muted">
          Starter copy is included – make it sound like you.
        </p>
        <Notice tone="info" icon={<Info />} className="mb-5">
          Keep the offer accurate: <strong>you</strong> prepare each estimate personally. Don&rsquo;t describe it as
          an instant, automated or MLS-powered valuation – this page doesn&rsquo;t produce one.
        </Notice>
        <div className="grid gap-5">
          <TextArea name="headline" label="Headline" rows={2} maxLength={160} defaultValue={defaults.headline} required />
          <TextArea
            name="description"
            label="Description"
            rows={5}
            maxLength={1200}
            defaultValue={defaults.description}
            hint="Explain what the homeowner gets and who prepares it."
            required
          />
          <HeroField currentUrl={heroUrl} />
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              name="cta_text"
              label="Button text"
              maxLength={60}
              defaultValue={defaults.cta_text}
              hint="For example “Request my estimate”."
              required
            />
            <TextField
              name="booking_url"
              label="Booking link for this campaign"
              type="url"
              optional
              placeholder={defaultBookingUrl ?? "https://"}
              defaultValue={defaults.booking_url}
              hint={
                defaultBookingUrl
                  ? "Leave blank to use your default booking link."
                  : "Add one here or set a default in Settings to offer booking after submission."
              }
            />
          </div>
          <TextArea
            name="thank_you_message"
            label="Thank-you message"
            rows={3}
            maxLength={800}
            defaultValue={defaults.thank_you_message}
            hint="Shown right after someone submits. Say what happens next."
            required
          />
        </div>
      </section>

      <FormActions creating={creating} />
    </ActionForm>
  );
}

function FormActions({ creating }: { creating: boolean }) {
  const pending = useFormPending();
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {creating ? (
        <>
          <Button type="submit" name="intent" value="draft" variant="secondary" size="lg" disabled={pending}>
            Save as draft
          </Button>
          <Button type="submit" name="intent" value="publish" size="lg" disabled={pending}>
            {pending ? "Saving…" : "Save and publish"}
          </Button>
        </>
      ) : (
        <SubmitButton size="lg" pendingLabel="Saving…">
          Save changes
        </SubmitButton>
      )}
    </div>
  );
}

function SlugField({ defaultValue, origin, warnOnChange }: { defaultValue: string; origin: string; warnOnChange: boolean }) {
  const [slug, setSlug] = useState(defaultValue);
  const host = origin.replace(/^https?:\/\//, "");
  const changed = warnOnChange && slug !== defaultValue;
  return (
    <TextField
      name="slug"
      label="Page link"
      value={slug}
      onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
      spellCheck={false}
      autoCapitalize="none"
      hint={
        changed ? (
          <span className="text-warning">Changing the link of a published page breaks links you&rsquo;ve already shared.</span>
        ) : (
          <span className="break-all">
            {host}/p/<strong className="font-medium text-ink">{slug || "your-link"}</strong>
          </span>
        )
      }
      required
    />
  );
}

function HeroField({ currentUrl }: { currentUrl?: string | null }) {
  const id = useId();
  const error = useFieldError("hero");
  const [preview, setPreview] = useState<string | null>(null);
  const [remove, setRemove] = useState(false);
  const shown = remove ? null : (preview ?? currentUrl ?? null);
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium">
        Hero image <span className="font-normal text-ink-muted">· optional</span>
      </span>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex aspect-[16/9] w-full shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-sunken sm:w-56">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageUp aria-hidden className="size-6 text-ink-muted" />
          )}
        </div>
        <div className="space-y-1.5 text-sm">
          <label
            htmlFor={id}
            className="inline-flex h-8 cursor-pointer items-center rounded-lg border border-line-strong bg-surface px-3 font-medium shadow-sm hover:bg-sunken/60 focus-within:ring-2 focus-within:ring-accent/30"
          >
            {shown ? "Replace image" : "Upload image"}
            <input
              id={id}
              type="file"
              name="hero"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                setPreview(file ? URL.createObjectURL(file) : null);
                if (file) setRemove(false);
              }}
            />
          </label>
          <p className="text-[13px] text-ink-muted">
            A photo you own or have rights to use – your own listing or neighborhood shot works well. Without one, the
            page uses a clean branded header.
          </p>
          {currentUrl ? (
            <label className="flex items-center gap-2 text-[13px] text-ink-muted">
              <input
                type="checkbox"
                name="remove_hero"
                checked={remove}
                onChange={(e) => setRemove(e.target.checked)}
                className="size-4 accent-[var(--color-accent)]"
              />
              Remove current image
            </label>
          ) : null}
        </div>
      </div>
      {error ? <p className="mt-1.5 text-[13px] font-medium text-danger">{error}</p> : null}
    </div>
  );
}
