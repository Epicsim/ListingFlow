"use client";
import { useState } from "react";
import { savePlanAction, saveStepAction } from "@/app/(app)/settings/follow-up-plans/actions";
import type { FollowUpPlan, PlanStep } from "@/lib/data/plans";
import { TIMELINES, TIMELINE_LABELS } from "@/lib/domain";
import { renderTemplate, TEMPLATE_VARIABLES, type TemplateValues } from "@/lib/email/templates";
import { ActionForm, SubmitButton } from "./ui/action-form";
import { CheckboxField, SelectField, TextArea, TextField } from "./ui/fields";
import { Button } from "./ui/button";

export const PLAN_SAMPLE: TemplateValues = { first_name: "Pat", full_name: "Pat Example (fictional)", property_address: "123 Example Street (fictional)", agent_name: "Jordan Example (fictional)", brokerage: "Example Realty (fictional)", agent_phone: "555-0100", agent_email: "jordan@example.test", booking_link: "https://scheduler.example.test/jordan" };

export function PlanForm({ plan, campaigns }: { plan?: FollowUpPlan; campaigns: { id: string; name: string }[] }) {
  return <ActionForm action={savePlanAction} className="space-y-5">
    {plan ? <input type="hidden" name="plan_id" value={plan.id} /> : null}
    <TextField name="name" label="Plan name" defaultValue={plan?.name} maxLength={80} required />
    <CheckboxField name="is_active" label="On – use this plan for matching new inquiries" defaultChecked={plan?.is_active ?? false} hint="Switching a plan off stops new enrollments. Existing steps continue." />
    <fieldset className="space-y-3"><legend className="mb-2 text-sm font-medium">Selling timelines (choose at least one)</legend>
      {TIMELINES.map((t) => <CheckboxField key={t} name="timelines" value={t} label={TIMELINE_LABELS[t]} defaultChecked={plan?.timelines.includes(t)} />)}
    </fieldset>
    <SelectField name="campaign_id" label="Campaign" defaultValue={plan?.campaign_id ?? ""}>
      <option value="">All campaigns</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </SelectField>
    <SubmitButton>{plan ? "Save plan" : "Create plan and add steps"}</SubmitButton>
  </ActionForm>;
}

export function PlanStepForm({ planId, step, template }: { planId: string; step?: PlanStep; template: { subject: string; body: string } }) {
  const [subject, setSubject] = useState(step?.email_subject ?? "");
  const [body, setBody] = useState(step?.email_body ?? "");
  const [title, setTitle] = useState(step?.title ?? "Call {{first_name}}");
  const [text, setText] = useState(step?.text_message ?? "");
  const [target, setTarget] = useState<"title" | "subject" | "body" | "text">("body");
  return <ActionForm action={saveStepAction} className="space-y-4">
    <input type="hidden" name="plan_id" value={planId} />
    {step ? <input type="hidden" name="step_id" value={step.id} /> : null}
    <div className="grid gap-4 sm:grid-cols-[110px_1fr]">
      <TextField name="day_offset" label="Day" type="number" min={0} max={365} step={1} defaultValue={step?.day_offset ?? 0} required hint="0–365" />
      <SelectField name="kind" label="Type" defaultValue={step?.kind ?? "call"}>
        <option value="call">Call reminder</option><option value="email">Email draft</option><option value="text">Text reminder (you send it yourself)</option>
      </SelectField>
    </div>
    <fieldset className="space-y-3 rounded-xl border border-line p-4"><legend className="px-1 text-sm font-medium">Call and text details</legend>
      <TextField name="title" label="Reminder title" value={title} onChange={(e) => setTitle(e.target.value)} onFocus={() => setTarget("title")} maxLength={200} />
      <TextArea name="text_message" label="Text message to copy" optional value={text} onChange={(e) => setText(e.target.value)} onFocus={() => setTarget("text")} maxLength={2000} hint="Used only for text reminders. You send it yourself." />
    </fieldset>
    <fieldset className="space-y-3 rounded-xl border border-line p-4"><legend className="px-1 text-sm font-medium">Email draft</legend>
      <p className="text-xs text-ink-muted">Used only for email steps. Leave at least 2 days between emails; up to 6 per plan. Emails after Day 30 require marketing consent.</p>
      <TextField name="email_subject" label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} onFocus={() => setTarget("subject")} maxLength={200} />
      <TextArea name="email_body" label="Email message" rows={7} value={body} onChange={(e) => setBody(e.target.value)} onFocus={() => setTarget("body")} maxLength={5000} />
      <Button size="sm" variant="secondary" onClick={() => { setSubject(template.subject); setBody(template.body); }}>Start from my follow-up template</Button>
      <noscript><p className="text-xs text-ink-muted">Your follow-up template is shown below. Copy it into the draft fields to use it.</p><pre className="whitespace-pre-wrap text-sm">{template.subject}{"\n\n"}{template.body}</pre></noscript>
    </fieldset>
    <div className="flex flex-wrap gap-2" aria-label="Template variables">
      {TEMPLATE_VARIABLES.map((v) => <Button key={v.key} size="sm" variant="ghost" title={v.description} onClick={() => {
        const token = `{{${v.key}}}`;
        if (target === "title") setTitle(title + token); else if (target === "subject") setSubject(subject + token); else if (target === "text") setText(text + token); else setBody(body + token);
      }}><code className="text-xs">{`{{${v.key}}}`}</code></Button>)}
    </div>
    <p className="text-xs text-ink-muted">Variables are added to the last field you selected. You can also type them.</p>
    <details className="rounded-xl bg-sunken/50 p-4" open><summary className="cursor-pointer text-sm font-medium">Preview with fictional details</summary>
      <p className="mt-2 text-sm">{renderTemplate(title, PLAN_SAMPLE)}</p>
      <p className="mt-2 text-sm font-medium">{renderTemplate(subject, PLAN_SAMPLE)}</p>
      <pre className="mt-2 font-sans text-sm whitespace-pre-wrap break-words text-ink-soft">{renderTemplate(body, PLAN_SAMPLE)}</pre>
      {text ? <p className="mt-3 text-sm whitespace-pre-wrap">Text: {renderTemplate(text, PLAN_SAMPLE)}</p> : null}
    </details>
    <SubmitButton size="sm">{step ? "Save step" : "Add step"}</SubmitButton>
  </ActionForm>;
}
