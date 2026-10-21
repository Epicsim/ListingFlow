import type { Tx } from "@/lib/db/types";
import { TEMPLATE_KINDS, type TemplateKind } from "@/lib/domain";
import { DEFAULT_TEMPLATES } from "@/lib/email/templates";

export interface EmailTemplate {
  kind: TemplateKind;
  subject: string;
  body: string;
  customized: boolean;
  updated_at: Date | null;
}

export async function getTemplates(tx: Tx, agentId: string): Promise<Record<TemplateKind, EmailTemplate>> {
  const rows = await tx.query<{ kind: TemplateKind; subject: string; body: string; updated_at: Date }>(
    `select kind, subject, body, updated_at from public.email_templates where agent_id = $1::uuid`,
    [agentId],
  );
  const out = {} as Record<TemplateKind, EmailTemplate>;
  for (const kind of TEMPLATE_KINDS) {
    const saved = rows.find((r) => r.kind === kind);
    out[kind] = saved
      ? { kind, subject: saved.subject, body: saved.body, customized: true, updated_at: saved.updated_at }
      : { kind, subject: DEFAULT_TEMPLATES[kind].subject, body: DEFAULT_TEMPLATES[kind].body, customized: false, updated_at: null };
  }
  return out;
}

export async function saveTemplate(
  tx: Tx,
  agentId: string,
  kind: TemplateKind,
  subject: string,
  body: string,
): Promise<void> {
  await tx.query(
    `insert into public.email_templates (agent_id, kind, subject, body)
     values ($1::uuid, $2::text, $3::text, $4::text)
     on conflict (agent_id, kind) do update set subject = excluded.subject, body = excluded.body`,
    [agentId, kind, subject, body],
  );
}
