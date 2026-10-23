-- Plans are configuration; enrollments and tasks keep immutable copies of their text.
create table public.follow_up_plans (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agent_profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  is_active boolean not null default false,
  position int not null default 0 check (position >= 0),
  timelines text[] not null check (cardinality(timelines) between 1 and 4
    and timelines <@ array['soon','3_6_months','6_12_months','exploring']::text[]
    and array_position(timelines, null) is null),
  campaign_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, agent_id),
  foreign key(campaign_id, agent_id) references public.campaigns(id, agent_id)
);
create index follow_up_plans_priority_idx on public.follow_up_plans(agent_id, position, id);
create trigger follow_up_plans_updated_at before update on public.follow_up_plans
  for each row execute function public.set_updated_at();

create table public.follow_up_plan_steps (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  agent_id uuid not null references public.agent_profiles(id) on delete cascade,
  day_offset int not null check (day_offset between 0 and 365),
  kind text not null check (kind in ('call','email','text')),
  title text check (char_length(btrim(title)) between 1 and 200),
  text_message text check (char_length(text_message) <= 2000),
  email_subject text check (char_length(btrim(email_subject)) between 1 and 200),
  email_body text check (char_length(btrim(email_body)) between 1 and 5000),
  unique(id, agent_id),
  foreign key(plan_id, agent_id) references public.follow_up_plans(id, agent_id) on delete cascade,
  check ((kind = 'email' and email_subject is not null and email_body is not null
          and title is null and text_message is null)
      or (kind in ('call','text') and title is not null and email_subject is null and email_body is null
          and (kind = 'text' or text_message is null)))
);
create index follow_up_steps_plan_idx on public.follow_up_plan_steps(plan_id, day_offset, kind, id);

create table public.follow_up_enrollments (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agent_profiles(id) on delete cascade,
  contact_id uuid not null,
  inquiry_id uuid,
  plan_id uuid,
  plan_name text not null check (char_length(plan_name) between 1 and 80),
  status text not null default 'active' check (status in ('active','completed','stopped')),
  stop_reason text check (stop_reason in ('consultation_booked','won','lost','unsubscribed','repeat_inquiry','agent_stopped')),
  stop_actor text not null default 'agent' check (stop_actor in ('agent','system')),
  -- Skips are snapshots, not open tasks, so they survive plan edits and deletion.
  skipped_steps jsonb not null default '[]'::jsonb check (jsonb_typeof(skipped_steps) = 'array'),
  started_at timestamptz not null default now(),
  stopped_at timestamptz,
  unique(id, agent_id),
  unique(id, contact_id, agent_id),
  foreign key(contact_id, agent_id) references public.contacts(id, agent_id) on delete cascade,
  foreign key(inquiry_id, agent_id) references public.inquiries(id, agent_id) on delete set null(inquiry_id),
  foreign key(plan_id, agent_id) references public.follow_up_plans(id, agent_id) on delete set null(plan_id),
  check ((status = 'stopped') = (stop_reason is not null and stopped_at is not null))
);
create unique index one_active_follow_up_plan on public.follow_up_enrollments(contact_id) where status = 'active';
create unique index one_plan_per_inquiry on public.follow_up_enrollments(inquiry_id) where inquiry_id is not null;
create index follow_up_enrollments_contact_idx on public.follow_up_enrollments(agent_id, contact_id, started_at desc);

alter table public.outbound_emails add constraint outbound_emails_id_agent_unique unique(id, agent_id);
alter table public.follow_up_tasks
  add column kind text not null default 'reminder' check (kind in ('reminder','call','email','text')),
  add column enrollment_id uuid,
  add column plan_step_id uuid,
  add column email_subject text check (char_length(email_subject) <= 200),
  add column email_body text check (char_length(email_body) <= 5000),
  add column text_message text check (char_length(text_message) <= 2000),
  add column email_id uuid,
  add column canceled_at timestamptz,
  add column cancel_reason text,
  add constraint task_enrollment_fk foreign key(enrollment_id, contact_id, agent_id)
    references public.follow_up_enrollments(id, contact_id, agent_id) on delete cascade,
  add constraint task_plan_step_fk foreign key(plan_step_id, agent_id)
    references public.follow_up_plan_steps(id, agent_id) on delete set null(plan_step_id),
  add constraint task_email_fk foreign key(email_id, agent_id)
    references public.outbound_emails(id, agent_id) on delete set null(email_id);
create index follow_up_tasks_enrollment_idx on public.follow_up_tasks(enrollment_id);
create index follow_up_tasks_due_idx on public.follow_up_tasks(agent_id, due_at)
  where completed_at is null and canceled_at is null;
grant update(email_id) on public.follow_up_tasks to authenticated;

do $$ declare t text; begin
  foreach t in array array['follow_up_plans','follow_up_plan_steps','follow_up_enrollments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('create policy own_select on public.%I for select to authenticated using (agent_id = (select auth.uid()))', t);
    execute format('create policy own_insert on public.%I for insert to authenticated with check (agent_id = (select auth.uid()))', t);
    execute format('create policy own_update on public.%I for update to authenticated using (agent_id = (select auth.uid())) with check (agent_id = (select auth.uid()))', t);
  end loop;
end $$;
grant delete on public.follow_up_plans, public.follow_up_plan_steps to authenticated;
grant update(name, is_active, position, timelines, campaign_id) on public.follow_up_plans to authenticated;
grant update(day_offset, kind, title, text_message, email_subject, email_body) on public.follow_up_plan_steps to authenticated;
grant update(status, stop_reason, stopped_at) on public.follow_up_enrollments to authenticated;
revoke insert on public.follow_up_enrollments from authenticated;
grant insert(id, agent_id, contact_id, inquiry_id, plan_id, plan_name, status, stop_reason,
  skipped_steps, started_at, stopped_at) on public.follow_up_enrollments to authenticated;
create policy own_delete on public.follow_up_plans for delete to authenticated using(agent_id = (select auth.uid()));
create policy own_delete on public.follow_up_plan_steps for delete to authenticated using(agent_id = (select auth.uid()));

-- Trigger-only definers: needed to cancel immutable task fields and log system
-- events from unsubscribe_contact as well as agent actions. No API role can
-- execute these functions directly. Every write is scoped to the trigger row's
-- agent AND contact/enrollment; composite FKs and parent RLS protect that row.
create function app_private.enrollment_stopped() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'stopped' and old.status = 'active' then
    update public.follow_up_tasks set canceled_at = new.stopped_at, cancel_reason = new.stop_reason
      where enrollment_id = new.id and agent_id = new.agent_id and contact_id = new.contact_id
        and completed_at is null and canceled_at is null;
    insert into public.activity_events(agent_id, contact_id, type, actor, data)
      values(new.agent_id, new.contact_id, 'plan_stopped', new.stop_actor,
        jsonb_build_object('reason', new.stop_reason));
  end if;
  return new;
end $$;
revoke all on function app_private.enrollment_stopped() from public, anon, authenticated, service_role;
create trigger enrollment_stopped after update of status on public.follow_up_enrollments
  for each row execute function app_private.enrollment_stopped();

create function app_private.contact_stops_plans() returns trigger
language plpgsql security definer set search_path = '' as $$
declare reason text;
begin
  if new.unsubscribed_at is not null and old.unsubscribed_at is null then reason := 'unsubscribed';
  elsif new.status is distinct from old.status and new.status in ('consultation_booked','won','lost') then reason := new.status;
  else return new;
  end if;
  update public.follow_up_enrollments set status = 'stopped', stop_reason = reason,
    stopped_at = now(), stop_actor = 'system'
    where agent_id = new.agent_id and contact_id = new.id and status = 'active';
  return new;
end $$;
revoke all on function app_private.contact_stops_plans() from public, anon, authenticated, service_role;
create trigger contact_stops_plans after update of status, unsubscribed_at on public.contacts
  for each row execute function app_private.contact_stops_plans();

create function app_private.appointment_stops_plans() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Serialize with plan start (which locks this same contact).
  perform 1 from public.contacts where id = new.contact_id and agent_id = new.agent_id for update;
  update public.follow_up_enrollments set status = 'stopped', stop_reason = 'consultation_booked',
    stopped_at = now(), stop_actor = 'system'
    where agent_id = new.agent_id and contact_id = new.contact_id and status = 'active';
  return new;
end $$;
revoke all on function app_private.appointment_stops_plans() from public, anon, authenticated, service_role;
create trigger appointment_stops_plans after insert or update of contact_id, status on public.appointments
  for each row when (new.status <> 'canceled') execute function app_private.appointment_stops_plans();

create function app_private.complete_plan() returns trigger
language plpgsql security definer set search_path = '' as $$
declare enrollment uuid; owner_id uuid;
begin
  if tg_op = 'DELETE' then enrollment := old.enrollment_id; owner_id := old.agent_id;
  else enrollment := new.enrollment_id; owner_id := new.agent_id; end if;
  update public.follow_up_enrollments e set status = 'completed'
    where e.id = enrollment and e.agent_id = owner_id and e.status = 'active'
      and not exists(select 1 from public.follow_up_tasks t where t.enrollment_id = e.id
        and t.agent_id = owner_id and t.completed_at is null and t.canceled_at is null);
  return null;
end $$;
revoke all on function app_private.complete_plan() from public, anon, authenticated, service_role;
create trigger complete_plan after update of completed_at, canceled_at or delete on public.follow_up_tasks
  for each row execute function app_private.complete_plan();

-- Provider acceptance completes the linked step; a rejection leaves it open.
create function app_private.plan_email_accepted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'sent' and old.status = 'queued' and new.kind = 'follow_up' then
    update public.follow_up_tasks set completed_at = now()
      where email_id = new.id and agent_id = new.agent_id and contact_id = new.contact_id
        and kind = 'email' and completed_at is null and canceled_at is null;
  end if;
  return new;
end $$;
revoke all on function app_private.plan_email_accepted() from public, anon, authenticated, service_role;
create trigger plan_email_accepted after update of status on public.outbound_emails
  for each row execute function app_private.plan_email_accepted();
