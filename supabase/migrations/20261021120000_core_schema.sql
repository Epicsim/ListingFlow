-- ListingFlow core schema.
--
-- Every agent-owned table carries agent_id. Child rows reference their parents
-- through composite (id, agent_id) foreign keys, so the database itself refuses
-- to link one agent's records to another agent's contacts, campaigns or
-- inquiries, independently of row-level security.

-- Internal tables that must never be reachable through Supabase's REST API.
create schema if not exists app_private;
revoke all on schema app_private from public;

create or replace function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Agent profiles -------------------------------------------------------------

create table public.agent_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  brokerage text check (char_length(brokerage) <= 120),
  license_number text check (char_length(license_number) <= 60),
  contact_email text not null check (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(contact_email) <= 254),
  phone text check (char_length(phone) <= 40),
  headshot_asset_id uuid,
  logo_asset_id uuid,
  primary_color text not null default '#1F5F4A' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  service_areas text[] not null default '{}' check (cardinality(service_areas) <= 20),
  intro text check (char_length(intro) <= 700),
  booking_url text check (booking_url ~ '^https://[^\s]+$' and char_length(booking_url) <= 500),
  privacy_policy_url text check (privacy_policy_url ~ '^https://[^\s]+$' and char_length(privacy_policy_url) <= 500),
  notification_email text check (notification_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(notification_email) <= 254),
  notify_new_inquiry boolean not null default true,
  send_acknowledgment boolean not null default true,
  timezone text not null default 'America/New_York' check (char_length(timezone) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger agent_profiles_updated_at before update on public.agent_profiles
  for each row execute function public.set_updated_at();

-- Branding images (headshot, logo, campaign hero) ----------------------------
-- Stored in Postgres so local mode and Supabase behave identically. Images are
-- capped at 2 MB and served with immutable cache headers.

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agent_profiles (id) on delete cascade,
  kind text not null check (kind in ('headshot', 'logo', 'hero')),
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer not null check (byte_size > 0 and byte_size <= 2097152),
  data bytea not null,
  created_at timestamptz not null default now(),
  unique (id, agent_id)
);

create index assets_agent_id_idx on public.assets (agent_id);

alter table public.agent_profiles
  add constraint agent_profiles_headshot_fk foreign key (headshot_asset_id, id)
    references public.assets (id, agent_id) on delete set null (headshot_asset_id),
  add constraint agent_profiles_logo_fk foreign key (logo_asset_id, id)
    references public.assets (id, agent_id) on delete set null (logo_asset_id);

-- Campaigns ------------------------------------------------------------------

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agent_profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 80),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  headline text not null check (char_length(btrim(headline)) between 1 and 160),
  description text not null check (char_length(btrim(description)) between 1 and 1200),
  hero_asset_id uuid,
  cta_text text not null check (char_length(btrim(cta_text)) between 1 and 60),
  thank_you_message text not null check (char_length(btrim(thank_you_message)) between 1 and 800),
  booking_url text check (booking_url ~ '^https://[^\s]+$' and char_length(booking_url) <= 500),
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, agent_id),
  constraint campaigns_hero_fk foreign key (hero_asset_id, agent_id)
    references public.assets (id, agent_id) on delete set null (hero_asset_id)
);

create index campaigns_agent_id_idx on public.campaigns (agent_id, created_at desc);

create trigger campaigns_updated_at before update on public.campaigns
  for each row execute function public.set_updated_at();

-- Contacts (one per homeowner email, per agent) ------------------------------
-- The "lead" an agent works is the contact. Each submission is preserved as
-- its own inquiry row with its own campaign attribution.

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agent_profiles (id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  email_normalized text not null,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  phone text check (char_length(phone) <= 40),
  preferred_contact text not null check (preferred_contact in ('email', 'phone', 'text')),
  status text not null default 'new'
    check (status in ('new', 'contacted', 'consultation_booked', 'nurturing', 'won', 'lost')),
  outcome_note text check (char_length(outcome_note) <= 1000),
  outcome_at timestamptz,
  marketing_consent boolean not null default false,
  first_inquiry_at timestamptz not null default now(),
  last_inquiry_at timestamptz not null default now(),
  inquiry_count integer not null default 1 check (inquiry_count >= 1),
  last_contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, email_normalized),
  unique (id, agent_id),
  check (email_normalized = lower(btrim(email)))
);

create index contacts_agent_last_inquiry_idx on public.contacts (agent_id, last_inquiry_at desc);
create index contacts_agent_status_idx on public.contacts (agent_id, status);

create trigger contacts_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

-- Inquiries (every submission, never merged away) ----------------------------

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agent_profiles (id) on delete cascade,
  contact_id uuid not null,
  campaign_id uuid not null,
  -- Derived from the form instance and its exact contents, so a network retry
  -- or double-click of the same submission is recorded once.
  idempotency_key text not null unique check (char_length(idempotency_key) between 16 and 128),
  -- Opaque reference used on the thank-you page for booking-click attribution.
  public_token uuid not null unique default gen_random_uuid(),
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  phone text check (char_length(phone) <= 40),
  property_address text not null check (char_length(btrim(property_address)) between 5 and 300),
  timeline text not null check (timeline in ('soon', '3_6_months', '6_12_months', 'exploring')),
  message text check (char_length(message) <= 2000),
  preferred_contact text not null check (preferred_contact in ('email', 'phone', 'text')),
  marketing_consent boolean not null default false,
  is_repeat boolean not null default false,
  source text not null default 'direct' check (source ~ '^[a-z0-9_.-]{1,40}$'),
  utm_source text check (char_length(utm_source) <= 100),
  utm_medium text check (char_length(utm_medium) <= 100),
  utm_campaign text check (char_length(utm_campaign) <= 100),
  utm_content text check (char_length(utm_content) <= 100),
  utm_term text check (char_length(utm_term) <= 100),
  referrer_host text check (char_length(referrer_host) <= 255),
  created_at timestamptz not null default now(),
  unique (id, agent_id),
  constraint inquiries_contact_fk foreign key (contact_id, agent_id)
    references public.contacts (id, agent_id) on delete cascade,
  constraint inquiries_campaign_fk foreign key (campaign_id, agent_id)
    references public.campaigns (id, agent_id)
);

create index inquiries_agent_created_idx on public.inquiries (agent_id, created_at desc);
create index inquiries_contact_idx on public.inquiries (contact_id, created_at desc);
create index inquiries_campaign_idx on public.inquiries (campaign_id);

-- Marketing consent records --------------------------------------------------

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agent_profiles (id) on delete cascade,
  contact_id uuid not null,
  inquiry_id uuid not null,
  campaign_id uuid not null,
  consent_type text not null default 'marketing_email' check (consent_type in ('marketing_email')),
  -- The exact wording shown next to the checkbox when it was ticked.
  wording text not null check (char_length(wording) between 10 and 1000),
  -- Where consent was captured: the landing page path and traffic source.
  source_page text not null check (char_length(source_page) <= 300),
  source_utm text check (char_length(source_utm) <= 100),
  captured_at timestamptz not null default now(),
  constraint consent_contact_fk foreign key (contact_id, agent_id)
    references public.contacts (id, agent_id) on delete cascade,
  constraint consent_inquiry_fk foreign key (inquiry_id, agent_id)
    references public.inquiries (id, agent_id) on delete cascade,
  constraint consent_campaign_fk foreign key (campaign_id, agent_id)
    references public.campaigns (id, agent_id)
);

create index consent_records_contact_idx on public.consent_records (contact_id);

-- Booking-link clicks (NOT appointments) -------------------------------------

create table public.booking_clicks (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agent_profiles (id) on delete cascade,
  campaign_id uuid not null,
  inquiry_id uuid,
  contact_id uuid,
  clicked_at timestamptz not null default now(),
  constraint booking_clicks_campaign_fk foreign key (campaign_id, agent_id)
    references public.campaigns (id, agent_id),
  constraint booking_clicks_inquiry_fk foreign key (inquiry_id, agent_id)
    references public.inquiries (id, agent_id) on delete cascade,
  constraint booking_clicks_contact_fk foreign key (contact_id, agent_id)
    references public.contacts (id, agent_id) on delete cascade
);

create index booking_clicks_agent_idx on public.booking_clicks (agent_id, clicked_at desc);
create index booking_clicks_campaign_idx on public.booking_clicks (campaign_id);

-- Appointments (confirmed consultations) -------------------------------------
-- Recorded manually by the agent in this version. The source/external columns
-- let a future, signature-verified booking webhook upsert the same rows
-- idempotently; no such integration exists yet.

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agent_profiles (id) on delete cascade,
  contact_id uuid not null,
  inquiry_id uuid,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'attended', 'canceled', 'no_show')),
  source text not null default 'manual' check (source in ('manual', 'booking_webhook')),
  external_provider text check (char_length(external_provider) <= 40),
  external_event_id text check (char_length(external_event_id) <= 200),
  notes text check (char_length(notes) <= 1000),
  status_changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, external_provider, external_event_id),
  check ((source = 'manual') or (external_provider is not null and external_event_id is not null)),
  constraint appointments_contact_fk foreign key (contact_id, agent_id)
    references public.contacts (id, agent_id) on delete cascade,
  constraint appointments_inquiry_fk foreign key (inquiry_id, agent_id)
    references public.inquiries (id, agent_id) on delete set null (inquiry_id)
);

create index appointments_agent_scheduled_idx on public.appointments (agent_id, scheduled_at);
create index appointments_agent_created_idx on public.appointments (agent_id, created_at);
create index appointments_contact_idx on public.appointments (contact_id);

create trigger appointments_updated_at before update on public.appointments
  for each row execute function public.set_updated_at();

-- Follow-up tasks (reminders) ------------------------------------------------

create table public.follow_up_tasks (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agent_profiles (id) on delete cascade,
  contact_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  due_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_contact_fk foreign key (contact_id, agent_id)
    references public.contacts (id, agent_id) on delete cascade
);

create index follow_up_tasks_open_idx on public.follow_up_tasks (agent_id, due_at) where completed_at is null;
create index follow_up_tasks_contact_idx on public.follow_up_tasks (contact_id);

create trigger follow_up_tasks_updated_at before update on public.follow_up_tasks
  for each row execute function public.set_updated_at();

-- Notes ----------------------------------------------------------------------

create table public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agent_profiles (id) on delete cascade,
  contact_id uuid not null,
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now(),
  constraint notes_contact_fk foreign key (contact_id, agent_id)
    references public.contacts (id, agent_id) on delete cascade
);

create index lead_notes_contact_idx on public.lead_notes (contact_id, created_at desc);

-- Activity history -----------------------------------------------------------

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agent_profiles (id) on delete cascade,
  contact_id uuid,
  inquiry_id uuid,
  campaign_id uuid,
  type text not null check (type ~ '^[a-z_]{3,48}$'),
  actor text not null check (actor in ('agent', 'visitor', 'system')),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint activity_contact_fk foreign key (contact_id, agent_id)
    references public.contacts (id, agent_id) on delete cascade,
  constraint activity_inquiry_fk foreign key (inquiry_id, agent_id)
    references public.inquiries (id, agent_id) on delete cascade,
  constraint activity_campaign_fk foreign key (campaign_id, agent_id)
    references public.campaigns (id, agent_id)
);

create index activity_events_agent_idx on public.activity_events (agent_id, created_at desc);
create index activity_events_contact_idx on public.activity_events (contact_id, created_at desc);

-- Email templates ------------------------------------------------------------

create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agent_profiles (id) on delete cascade,
  kind text not null check (kind in ('acknowledgment', 'follow_up')),
  subject text not null check (char_length(btrim(subject)) between 1 and 200),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, kind)
);

create trigger email_templates_updated_at before update on public.email_templates
  for each row execute function public.set_updated_at();

-- Email outbox ---------------------------------------------------------------
-- status meanings:
--   preview  - rendered and stored only; delivery is not configured, never sent
--   queued   - handed to the delivery step, provider not yet confirmed
--   sent     - accepted by the email provider (not proof of inbox delivery)
--   failed   - provider rejected it or was unreachable

create table public.outbound_emails (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agent_profiles (id) on delete cascade,
  contact_id uuid,
  inquiry_id uuid,
  kind text not null check (kind in ('agent_notification', 'acknowledgment', 'follow_up')),
  to_email text not null check (to_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(to_email) <= 254),
  reply_to text check (char_length(reply_to) <= 254),
  subject text not null check (char_length(subject) between 1 and 300),
  body_text text not null check (char_length(body_text) between 1 and 10000),
  status text not null check (status in ('preview', 'queued', 'sent', 'failed')),
  provider text check (char_length(provider) <= 40),
  provider_message_id text check (char_length(provider_message_id) <= 200),
  error_code text check (char_length(error_code) <= 200),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'sent') = (sent_at is not null)),
  constraint outbound_contact_fk foreign key (contact_id, agent_id)
    references public.contacts (id, agent_id) on delete cascade,
  constraint outbound_inquiry_fk foreign key (inquiry_id, agent_id)
    references public.inquiries (id, agent_id) on delete cascade
);

create index outbound_emails_agent_idx on public.outbound_emails (agent_id, created_at desc);
create index outbound_emails_contact_idx on public.outbound_emails (contact_id);

create trigger outbound_emails_updated_at before update on public.outbound_emails
  for each row execute function public.set_updated_at();

-- Submission throttle (private) ----------------------------------------------
-- Holds only a keyed hash of the submitter's IP address, never the address.

create table app_private.submission_throttle (
  id bigint generated always as identity primary key,
  key_hash text not null check (char_length(key_hash) between 16 and 128),
  created_at timestamptz not null default now()
);

create index submission_throttle_key_idx on app_private.submission_throttle (key_hash, created_at);
create index submission_throttle_created_idx on app_private.submission_throttle (created_at);
