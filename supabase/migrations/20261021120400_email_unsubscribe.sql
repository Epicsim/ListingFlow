-- Unsubscribe links in emails to homeowners.
--
-- The server verifies the signed link, then calls unsubscribe_contact as
-- service_role. Agents can read unsubscribed_at but can never set or clear it,
-- and the database refuses new follow-up emails to an unsubscribed contact.

alter table public.contacts add column unsubscribed_at timestamptz;

create or replace function public.unsubscribe_contact(p_contact_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_agent_id uuid;
begin
  update public.contacts
     set unsubscribed_at = now(), marketing_consent = false
   where id = p_contact_id and unsubscribed_at is null
  returning agent_id into v_agent_id;

  -- Log only the first unsubscribe; repeated clicks change nothing.
  if v_agent_id is not null then
    insert into public.activity_events (agent_id, contact_id, type, actor, data)
    values (v_agent_id, p_contact_id, 'email_unsubscribed', 'visitor', '{}'::jsonb);
    return true;
  end if;

  return exists (select 1 from public.contacts c where c.id = p_contact_id);
end;
$$;

revoke all on function public.unsubscribe_contact(uuid) from public, anon, authenticated;
grant execute on function public.unsubscribe_contact(uuid) to service_role;

drop policy "outbox_insert_own" on public.outbound_emails;
create policy "outbox_insert_own" on public.outbound_emails
  for insert to authenticated with check (
    agent_id = (select auth.uid())
    and kind = 'follow_up'
    and status in ('preview', 'queued')
    and sent_at is null
    and provider_message_id is null
    and not exists (
      select 1 from public.contacts c
      where c.id = outbound_emails.contact_id and c.unsubscribed_at is not null
    )
  );
