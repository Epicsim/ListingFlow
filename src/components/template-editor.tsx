"use client";

import { useState } from "react";
import { saveTemplateAction } from "@/app/(app)/settings/actions";
import type { TemplateKind } from "@/lib/domain";
import { DEFAULT_TEMPLATES, renderTemplate, TEMPLATE_VARIABLES, type TemplateValues } from "@/lib/email/templates";
import { ActionForm, SubmitButton } from "./ui/action-form";
import { Button } from "./ui/button";
import { TextArea, TextField } from "./ui/fields";

export function TemplateEditor({
  kind,
  subject: initialSubject,
  body: initialBody,
  sample,
}: {
  kind: TemplateKind;
  subject: string;
  body: string;
  sample: TemplateValues;
}) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const defaults = DEFAULT_TEMPLATES[kind];
  const isDefault = subject === defaults.subject && body === defaults.body;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ActionForm action={saveTemplateAction} className="space-y-4">
        <input type="hidden" name="kind" value={kind} />
        <TextField name="subject" label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
        <TextArea name="body" label="Message" rows={14} value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} className="font-mono text-[13px]" />
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton size="sm">Save template</SubmitButton>
          <Button
            variant="ghost"
            size="sm"
            disabled={isDefault}
            onClick={() => {
              setSubject(defaults.subject);
              setBody(defaults.body);
            }}
          >
            Restore starter text
          </Button>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-ink-muted">Available placeholders</summary>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {TEMPLATE_VARIABLES.map((v) => (
              <li key={v.key}>
                <code className="rounded bg-sunken px-1 py-0.5 text-xs">{`{{${v.key}}}`}</code>{" "}
                <span className="text-ink-muted">{v.description}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-muted">A line that uses a placeholder with no value (like a missing booking link) is left out.</p>
        </details>
      </ActionForm>
      <div>
        <p className="mb-1.5 text-sm font-medium">Preview with sample details</p>
        <div className="rounded-lg border border-line bg-sunken/40 p-4">
          <p className="text-sm">
            <span className="text-ink-muted">Subject: </span>
            <span className="font-medium">{renderTemplate(subject, sample) || "(empty)"}</span>
          </p>
          <pre className="mt-3 border-t border-line pt-3 font-sans text-sm whitespace-pre-wrap text-ink-soft">
            {renderTemplate(body, sample)}
          </pre>
        </div>
      </div>
    </div>
  );
}
