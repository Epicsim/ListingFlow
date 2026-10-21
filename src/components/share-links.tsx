"use client";

import { useId, useState } from "react";
import { buildCampaignUrl, SHARE_PRESETS } from "@/lib/utm";
import { CopyButton } from "./ui/copy-button";

/**
 * Ready-made tracked links so inquiries can be grouped by where the visitor
 * came from (Instagram, website, …), plus a builder for anything else.
 */
export function ShareLinks({ origin, slug }: { origin: string; slug: string }) {
  const plain = buildCampaignUrl(origin, slug);
  return (
    <div className="space-y-5">
      <LinkRow label="Main link" hint="Untracked – inquiries show as “Direct / unknown”." url={plain} />
      <div>
        <h3 className="mb-2 text-sm font-semibold">Tracked links by channel</h3>
        <ul className="divide-y divide-line rounded-lg border border-line">
          {SHARE_PRESETS.map((p) => (
            <li key={p.id} className="px-3 py-3 sm:px-4">
              <LinkRow
                label={p.label}
                hint={p.hint}
                url={buildCampaignUrl(origin, slug, { source: p.source, medium: p.medium, campaign: slug })}
                compact
              />
            </li>
          ))}
        </ul>
      </div>
      <CustomLink origin={origin} slug={slug} />
    </div>
  );
}

function LinkRow({ label, hint, url, compact = false }: { label: string; hint?: string; url: string; compact?: boolean }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className={`${compact ? "text-sm" : "text-sm font-semibold"}`}>
          {label}
          {hint ? <span className="ml-2 font-normal text-ink-muted">{hint}</span> : null}
        </p>
        <input
          readOnly
          value={url}
          aria-label={`${label} link`}
          onFocus={(e) => e.currentTarget.select()}
          className="mt-1 w-full truncate rounded-md border border-transparent bg-sunken/60 px-2 py-1 font-mono text-xs text-ink-muted focus:border-line-strong focus:bg-surface focus:outline-none"
        />
      </div>
      <CopyButton value={url} label="Copy" className="shrink-0 self-start sm:self-auto" />
    </div>
  );
}

function CustomLink({ origin, slug }: { origin: string; slug: string }) {
  const [source, setSource] = useState("");
  const [medium, setMedium] = useState("");
  const [content, setContent] = useState("");
  const sourceId = useId();
  const mediumId = useId();
  const contentId = useId();
  const clean = (v: string) => v.toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").slice(0, 40);
  const url = buildCampaignUrl(origin, slug, {
    source: clean(source),
    medium: clean(medium),
    campaign: slug,
    content: clean(content),
  });
  return (
    <div className="rounded-lg border border-dashed border-line-strong p-3 sm:p-4">
      <h3 className="text-sm font-semibold">Custom source</h3>
      <p className="mt-0.5 mb-3 text-[13px] text-ink-muted">
        For anything else – a flyer QR code, a podcast, a partner&rsquo;s website.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={sourceId} className="mb-1 block text-xs font-medium">
            Source
          </label>
          <input id={sourceId} className="input-base py-2 text-sm" placeholder="flyer" value={source} onChange={(e) => setSource(e.target.value)} />
        </div>
        <div>
          <label htmlFor={mediumId} className="mb-1 block text-xs font-medium">
            Medium <span className="font-normal text-ink-muted">· optional</span>
          </label>
          <input id={mediumId} className="input-base py-2 text-sm" placeholder="print" value={medium} onChange={(e) => setMedium(e.target.value)} />
        </div>
        <div>
          <label htmlFor={contentId} className="mb-1 block text-xs font-medium">
            Detail <span className="font-normal text-ink-muted">· optional</span>
          </label>
          <input id={contentId} className="input-base py-2 text-sm" placeholder="open-house" value={content} onChange={(e) => setContent(e.target.value)} />
        </div>
      </div>
      <div className="mt-3">
        {source.trim() ? (
          <LinkRow label="Your link" url={url} compact />
        ) : (
          <p className="text-[13px] text-ink-muted">Enter a source to generate a link.</p>
        )}
      </div>
    </div>
  );
}
