import type { Tx } from "@/lib/db/types";
import { logAgentEvent } from "./activity";

export interface DueTask {
  id: string;
  contact_id: string;
  contact_name: string;
  title: string;
  due_at: Date;
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
     where id = $1::uuid and agent_id = $2::uuid
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
    `select t.id, t.contact_id, c.full_name as contact_name, t.title, t.due_at
     from public.follow_up_tasks t
     join public.contacts c on c.id = t.contact_id
     where t.agent_id = $1::uuid
       and t.completed_at is null
       and t.due_at < $2::timestamptz + make_interval(days => $3::int)
     order by t.due_at
     limit $4::int`,
    [agentId, now.toISOString(), days, limit],
  );
}
