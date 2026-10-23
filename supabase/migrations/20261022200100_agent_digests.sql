alter table public.agent_profiles add column send_daily_digest boolean not null default true;
grant update(send_daily_digest) on public.agent_profiles to authenticated;
alter table public.outbound_emails drop constraint outbound_emails_kind_check;
alter table public.outbound_emails add constraint outbound_emails_kind_check
  check(kind in ('agent_notification','acknowledgment','follow_up','agent_digest'));
-- The existing follow_up-only insert policy is intentionally unchanged.
create table public.agent_digests (
  agent_id uuid not null references public.agent_profiles(id) on delete cascade,
  local_date date not null,
  email_id uuid,
  created_at timestamptz not null default now(),
  primary key(agent_id, local_date),
  foreign key(email_id, agent_id) references public.outbound_emails(id, agent_id) on delete cascade
);
alter table public.agent_digests enable row level security;
revoke all on public.agent_digests from public, anon, authenticated;
grant select, insert, update on public.agent_digests to service_role;
