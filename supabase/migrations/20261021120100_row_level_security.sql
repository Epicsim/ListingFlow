-- Row-level security and privileges.
--
-- Rules:
--   * Every table has RLS enabled.
--   * Anonymous visitors get no table access at all. They interact only through
--     the narrow SECURITY DEFINER functions in the next migration.
--   * Signed-in agents see and change only rows whose agent_id is their own
--     auth.uid(), and only the operations/columns each table needs.
--   * Records created by homeowners (inquiries, consent, booking clicks) are
--     read-only for agents so the original submission stays intact.

do $$
declare
  t text;
begin
  foreach t in array array[
    'agent_profiles', 'assets', 'campaigns', 'contacts', 'inquiries',
    'consent_records', 'booking_clicks', 'appointments', 'follow_up_tasks',
    'lead_notes', 'activity_events', 'email_templates', 'outbound_emails'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end
$$;

revoke all on all tables in schema app_private from anon, authenticated;
revoke all on schema app_private from anon, authenticated;

-- Helper expression used in every policy: (select auth.uid()) is evaluated
-- once per statement instead of once per row.

-- agent_profiles: an agent reads/creates/updates only their own profile.
grant select, insert on public.agent_profiles to authenticated;
grant update (full_name, brokerage, license_number, contact_email, phone, headshot_asset_id,
  logo_asset_id, primary_color, service_areas, intro, booking_url, privacy_policy_url,
  notification_email, notify_new_inquiry, send_acknowledgment, timezone) on public.agent_profiles to authenticated;
create policy "profiles_select_own" on public.agent_profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles_insert_own" on public.agent_profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy "profiles_update_own" on public.agent_profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- assets: own branding images.
grant select, insert, delete on public.assets to authenticated;
create policy "assets_select_own" on public.assets
  for select to authenticated using (agent_id = (select auth.uid()));
create policy "assets_insert_own" on public.assets
  for insert to authenticated with check (agent_id = (select auth.uid()));
create policy "assets_delete_own" on public.assets
  for delete to authenticated using (agent_id = (select auth.uid()));

-- campaigns: create/edit/publish/archive own campaigns (archive instead of delete).
grant select, insert on public.campaigns to authenticated;
grant update (name, slug, status, headline, description, hero_asset_id, cta_text,
  thank_you_message, booking_url, published_at, archived_at) on public.campaigns to authenticated;
create policy "campaigns_select_own" on public.campaigns
  for select to authenticated using (agent_id = (select auth.uid()));
create policy "campaigns_insert_own" on public.campaigns
  for insert to authenticated with check (agent_id = (select auth.uid()));
create policy "campaigns_update_own" on public.campaigns
  for update to authenticated using (agent_id = (select auth.uid())) with check (agent_id = (select auth.uid()));

-- contacts: created only by the public submission function; agents manage
-- pipeline fields but cannot rewrite who the homeowner is.
grant select on public.contacts to authenticated;
grant update (status, outcome_note, outcome_at, last_contacted_at) on public.contacts to authenticated;
create policy "contacts_select_own" on public.contacts
  for select to authenticated using (agent_id = (select auth.uid()));
create policy "contacts_update_own" on public.contacts
  for update to authenticated using (agent_id = (select auth.uid())) with check (agent_id = (select auth.uid()));

-- inquiries, consent records, booking clicks: read-only for the owning agent.
grant select on public.inquiries to authenticated;
create policy "inquiries_select_own" on public.inquiries
  for select to authenticated using (agent_id = (select auth.uid()));

grant select on public.consent_records to authenticated;
create policy "consent_select_own" on public.consent_records
  for select to authenticated using (agent_id = (select auth.uid()));

grant select on public.booking_clicks to authenticated;
create policy "booking_clicks_select_own" on public.booking_clicks
  for select to authenticated using (agent_id = (select auth.uid()));

-- appointments: recorded and updated manually by the agent.
grant select, insert on public.appointments to authenticated;
grant update (scheduled_at, status, status_changed_at, notes) on public.appointments to authenticated;
create policy "appointments_select_own" on public.appointments
  for select to authenticated using (agent_id = (select auth.uid()));
create policy "appointments_insert_own" on public.appointments
  for insert to authenticated with check (agent_id = (select auth.uid()) and source = 'manual');
create policy "appointments_update_own" on public.appointments
  for update to authenticated using (agent_id = (select auth.uid())) with check (agent_id = (select auth.uid()));

-- follow-up tasks.
grant select, insert, delete on public.follow_up_tasks to authenticated;
grant update (title, due_at, completed_at) on public.follow_up_tasks to authenticated;
create policy "tasks_select_own" on public.follow_up_tasks
  for select to authenticated using (agent_id = (select auth.uid()));
create policy "tasks_insert_own" on public.follow_up_tasks
  for insert to authenticated with check (agent_id = (select auth.uid()));
create policy "tasks_update_own" on public.follow_up_tasks
  for update to authenticated using (agent_id = (select auth.uid())) with check (agent_id = (select auth.uid()));
create policy "tasks_delete_own" on public.follow_up_tasks
  for delete to authenticated using (agent_id = (select auth.uid()));

-- notes.
grant select, insert, delete on public.lead_notes to authenticated;
create policy "notes_select_own" on public.lead_notes
  for select to authenticated using (agent_id = (select auth.uid()));
create policy "notes_insert_own" on public.lead_notes
  for insert to authenticated with check (agent_id = (select auth.uid()));
create policy "notes_delete_own" on public.lead_notes
  for delete to authenticated using (agent_id = (select auth.uid()));

-- activity: agents can read their history and append their own actions, but
-- cannot edit history or impersonate visitor/system events.
grant select, insert on public.activity_events to authenticated;
create policy "activity_select_own" on public.activity_events
  for select to authenticated using (agent_id = (select auth.uid()));
create policy "activity_insert_own" on public.activity_events
  for insert to authenticated with check (agent_id = (select auth.uid()) and actor = 'agent');

-- email templates.
grant select, insert on public.email_templates to authenticated;
grant update (subject, body) on public.email_templates to authenticated;
create policy "templates_select_own" on public.email_templates
  for select to authenticated using (agent_id = (select auth.uid()));
create policy "templates_insert_own" on public.email_templates
  for insert to authenticated with check (agent_id = (select auth.uid()));
create policy "templates_update_own" on public.email_templates
  for update to authenticated using (agent_id = (select auth.uid())) with check (agent_id = (select auth.uid()));

-- outbox: agents can read their messages and add follow-up drafts. Only the
-- server's delivery step (service role) can mark anything as sent or failed.
grant select, insert on public.outbound_emails to authenticated;
create policy "outbox_select_own" on public.outbound_emails
  for select to authenticated using (agent_id = (select auth.uid()));
create policy "outbox_insert_own" on public.outbound_emails
  for insert to authenticated with check (
    agent_id = (select auth.uid())
    and kind = 'follow_up'
    and status in ('preview', 'queued')
    and sent_at is null
    and provider_message_id is null
  );
