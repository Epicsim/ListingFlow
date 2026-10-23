import type { Tx } from "@/lib/db/types";
import { logAgentEvent } from "./activity";
import type { TaskKind } from "@/lib/follow-up-plans";
import type { EmailStatus } from "@/lib/domain";

/** The database derives ownership from auth.uid(); no cancellation fields are writable by agents. */
export async function skipPlanTask(tx: Tx, taskId: string): Promise<string | null> {
  const [row] = await tx.query<{ contact_id: string | null }>(
    `select public.skip_plan_task($1::uuid) as contact_id`, [taskId],
  );
  return row?.contact_id ?? null;
}

export async function lockEmailTask(tx: Tx, agentId: string, contactId: string, taskId: string): Promise<boolean> {
  const rows = await tx.query(`select t.id from public.follow_up_tasks t
    left join public.outbound_emails e on e.id = t.email_id and e.agent_id = t.agent_id
    where t.id = $1::uuid and t.agent_id = $2::uuid and t.contact_id = $3::uuid
      and t.kind = 'email' and t.completed_at is null and t.canceled_at is null
      and (t.email_id is null or e.status = 'failed')
      and exists(select 1 from public.follow_up_enrollments n where n.id = t.enrollment_id and n.status = 'active')
    for update of t`, [taskId, agentId, contactId]);
  return rows.length === 1;
}

export async function linkTaskEmail(tx: Tx, agentId: string, contactId: string, taskId: string, emailId: string): Promise<void> {
  await tx.query(`update public.follow_up_tasks t set email_id = e.id,
    completed_at = case when e.status = 'preview' then now() else null end
    from public.outbound_emails e where t.id = $1::uuid and t.agent_id = $2::uuid and t.contact_id = $3::uuid
      and e.id = $4::uuid and e.agent_id = t.agent_id and e.contact_id = t.contact_id and e.kind = 'follow_up'
      and t.completed_at is null and t.canceled_at is null`, [taskId, agentId, contactId, emailId]);
}

export interface DueTask {
  id: string;
  contact_id: string;
  contact_name: string;
  title: string;
  due_at: Date;
  kind: TaskKind;
  email_status: EmailStatus | null;
}

export async function createTask(
  tx: Tx,
  agentId: string,
  contactId: string,
  title: string,
  dueAt: Date,
): Promise<string | null> {
  const rows = await tx.query<{ id: string }>(
    `insert into public.follow_up_tasks (agent_id, contact_id, title, due_at)
     select $1::uuid, c.id, $3::text, $4::timestamptz from public.contacts c
     where c.id = $2::uuid and c.agent_id = $1::uuid
     returning id`,
    [agentId, contactId, title, dueAt.toISOString()],
  );
  if (!rows.length) return null;
  await logAgentEvent(tx, agentId, {
    type: "task_created",
    contactId,
    data: { title, due_at: dueAt.toISOString() },
  });
  return rows[0].id;
}

export async function setTaskCompleted(
  tx: Tx,
  agentId: string,
  taskId: string,
  completed: boolean,
): Promise<string | null> {
  const rows = await tx.query<{ contact_id: string; title: string }>(
    `update public.follow_up_tasks
     set completed_at = case when $3::boolean then coalesce(completed_at, now()) else null end
     where id = $1::uuid and agent_id = $2::uuid and canceled_at is null
       and kind <> 'email'
       and (enrollment_id is null or exists (select 1 from public.follow_up_enrollments e
         where e.id = enrollment_id and e.status = 'active'))
     returning contact_id, title`,
    [taskId, agentId, completed],
  );
  if (!rows.length) return null;
  await logAgentEvent(tx, agentId, {
    type: completed ? "task_completed" : "task_reopened",
    contactId: rows[0].contact_id,
    data: { title: rows[0].title },
  });
  return rows[0].contact_id;
}

export async function deleteTask(tx: Tx, agentId: string, taskId: string): Promise<string | null> {
  const rows = await tx.query<{ contact_id: string }>(
    `delete from public.follow_up_tasks where id = $1::uuid and agent_id = $2::uuid returning contact_id`,
    [taskId, agentId],
  );
  return rows[0]?.contact_id ?? null;
}

/** Open follow-ups that are overdue or due within the next `days` days. */
export async function listDueTasks(tx: Tx, agentId: string, now: Date, days = 7, limit = 10): Promise<DueTask[]> {
  return tx.query<DueTask>(
    `select t.id, t.contact_id, c.full_name as contact_name, t.title, t.due_at, t.kind, e.status as email_status
     from public.follow_up_tasks t
     join public.contacts c on c.id = t.contact_id
     left join public.outbound_emails e on e.id = t.email_id and e.agent_id = t.agent_id
     where t.agent_id = $1::uuid
       and t.completed_at is null
       and t.canceled_at is null
       and t.due_at < $2::timestamptz + make_interval(days => $3::int)
     order by t.due_at
     limit $4::int`,
    [agentId, now.toISOString(), days, limit],
  );
}
