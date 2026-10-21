-- Narrow, audited entry points for public (unauthenticated) traffic.
--
-- get_public_campaign / get_public_asset return only what a published landing
-- page displays and may be called by anyone.
--
-- submit_inquiry / record_booking_click write data, so they are callable only
-- by service_role, i.e. by the ListingFlow server after it has validated the
-- request, checked the spam trap and computed the rate-limit key. They are not
-- reachable with the public anon key.

create or replace function public.get_public_campaign(p_slug text)
returns table (
  campaign_id uuid,
  slug text,
  headline text,
  description text,
  hero_asset_id uuid,
  cta_text text,
  thank_you_message text,
  booking_url text,
  agent_name text,
  brokerage text,
  license_number text,
  contact_email text,
  phone text,
  headshot_asset_id uuid,
  logo_asset_id uuid,
  primary_color text,
  service_areas text[],
  intro text,
  privacy_policy_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id, c.slug, c.headline, c.description, c.hero_asset_id, c.cta_text, c.thank_you_message,
    coalesce(c.booking_url, p.booking_url),
    p.full_name, p.brokerage, p.license_number, p.contact_email, p.phone,
    p.headshot_asset_id, p.logo_asset_id, p.primary_color, p.service_areas, p.intro, p.privacy_policy_url
  from public.campaigns c
  join public.agent_profiles p on p.id = c.agent_id
  where c.slug = lower(p_slug)
    and c.status = 'published'
$$;

create or replace function public.get_public_asset(p_id uuid)
returns table (content_type text, data bytea)
language sql
stable
security definer
set search_path = ''
as $$
  select a.content_type, a.data from public.assets a where a.id = p_id
$$;

create or replace function public.submit_inquiry(
  p_slug text,
  p_payload jsonb,
  p_idempotency_key text,
  p_rate_key text default null,
  p_rate_limit integer default 6,
  p_rate_window_seconds integer default 600,
  p_consent_wording text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_campaign_id uuid;
  v_agent_id uuid;
  v_campaign_name text;
  v_existing_id uuid;
  v_existing_token uuid;
  v_recent integer;
  v_email text := btrim(p_payload ->> 'email');
  v_phone text := nullif(btrim(coalesce(p_payload ->> 'phone', '')), '');
  v_consent boolean := coalesce((p_payload ->> 'marketing_consent')::boolean, false);
  v_source text := coalesce(nullif(p_payload ->> 'source', ''), 'direct');
  v_contact_id uuid;
  v_is_new_contact boolean;
  v_inquiry_id uuid;
  v_public_token uuid;
begin
  select c.id, c.agent_id, c.name
    into v_campaign_id, v_agent_id, v_campaign_name
  from public.campaigns c
  where c.slug = p_slug and c.status = 'published';

  if v_campaign_id is null then
    return jsonb_build_object('status', 'campaign_unavailable');
  end if;

  -- A retry of the exact same submission returns the original result.
  select i.id, i.public_token into v_existing_id, v_existing_token
  from public.inquiries i
  where i.idempotency_key = p_idempotency_key;

  if v_existing_id is not null then
    return jsonb_build_object('status', 'duplicate', 'inquiry_id', v_existing_id, 'public_token', v_existing_token);
  end if;

  if p_rate_key is not null then
    delete from app_private.submission_throttle where created_at < v_now - interval '1 day';

    select count(*) into v_recent
    from app_private.submission_throttle t
    where t.key_hash = p_rate_key
      and t.created_at > v_now - make_interval(secs => p_rate_window_seconds);

    if v_recent >= p_rate_limit then
      return jsonb_build_object('status', 'rate_limited');
    end if;

    insert into app_private.submission_throttle (key_hash) values (p_rate_key);
  end if;

  if v_consent and coalesce(char_length(p_consent_wording), 0) < 10 then
    raise exception 'consent wording is required when marketing consent is granted' using errcode = '22023';
  end if;

  begin
    -- One contact per homeowner email for this agent. A repeat inquiry updates
    -- the contact's latest details but never overwrites earlier inquiries.
    insert into public.contacts as ct (
      agent_id, email, email_normalized, full_name, phone, preferred_contact,
      marketing_consent, first_inquiry_at, last_inquiry_at, inquiry_count
    )
    values (
      v_agent_id, v_email, lower(v_email), btrim(p_payload ->> 'full_name'), v_phone,
      p_payload ->> 'preferred_contact', v_consent, v_now, v_now, 1
    )
    on conflict (agent_id, email_normalized) do update set
      email = excluded.email,
      full_name = excluded.full_name,
      phone = coalesce(excluded.phone, ct.phone),
      preferred_contact = excluded.preferred_contact,
      marketing_consent = ct.marketing_consent or excluded.marketing_consent,
      last_inquiry_at = excluded.last_inquiry_at,
      inquiry_count = ct.inquiry_count + 1
    returning ct.id, (xmax = 0) into v_contact_id, v_is_new_contact;

    insert into public.inquiries (
      agent_id, contact_id, campaign_id, idempotency_key, full_name, email, phone,
      property_address, timeline, message, preferred_contact, marketing_consent, is_repeat,
      source, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer_host, created_at
    )
    values (
      v_agent_id, v_contact_id, v_campaign_id, p_idempotency_key,
      btrim(p_payload ->> 'full_name'), v_email, v_phone,
      btrim(p_payload ->> 'property_address'), p_payload ->> 'timeline',
      nullif(btrim(coalesce(p_payload ->> 'message', '')), ''),
      p_payload ->> 'preferred_contact', v_consent, not v_is_new_contact,
      v_source,
      nullif(p_payload ->> 'utm_source', ''), nullif(p_payload ->> 'utm_medium', ''),
      nullif(p_payload ->> 'utm_campaign', ''), nullif(p_payload ->> 'utm_content', ''),
      nullif(p_payload ->> 'utm_term', ''), nullif(p_payload ->> 'referrer_host', ''),
      v_now
    )
    returning id, public_token into v_inquiry_id, v_public_token;

    if v_consent then
      insert into public.consent_records (
        agent_id, contact_id, inquiry_id, campaign_id, wording, source_page, source_utm, captured_at
      )
      values (
        v_agent_id, v_contact_id, v_inquiry_id, v_campaign_id, p_consent_wording,
        '/p/' || p_slug, nullif(p_payload ->> 'utm_source', ''), v_now
      );
    end if;

    insert into public.activity_events (agent_id, contact_id, inquiry_id, campaign_id, type, actor, data)
    values (
      v_agent_id, v_contact_id, v_inquiry_id, v_campaign_id,
      case when v_is_new_contact then 'inquiry_submitted' else 'repeat_inquiry_submitted' end,
      'visitor',
      jsonb_build_object(
        'campaign_name', v_campaign_name,
        'source', v_source,
        'timeline', p_payload ->> 'timeline',
        'marketing_consent', v_consent
      )
    );

    -- A returning homeowner should not get lost in a later pipeline stage:
    -- create a reminder that is due immediately.
    if not v_is_new_contact then
      insert into public.follow_up_tasks (agent_id, contact_id, title, due_at)
      values (v_agent_id, v_contact_id, 'Respond to new inquiry (' || left(v_campaign_name, 120) || ')', v_now);
    end if;
  exception when unique_violation then
    -- A concurrent retry with the same idempotency key committed first.
    select i.id, i.public_token into v_existing_id, v_existing_token
    from public.inquiries i
    where i.idempotency_key = p_idempotency_key;

    if v_existing_id is not null then
      return jsonb_build_object('status', 'duplicate', 'inquiry_id', v_existing_id, 'public_token', v_existing_token);
    end if;
    raise;
  end;

  return jsonb_build_object(
    'status', 'created',
    'inquiry_id', v_inquiry_id,
    'public_token', v_public_token,
    'contact_id', v_contact_id,
    'agent_id', v_agent_id,
    'campaign_id', v_campaign_id,
    'is_repeat', not v_is_new_contact
  );
end;
$$;

create or replace function public.record_booking_click(p_slug text, p_public_token uuid default null)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_campaign_id uuid;
  v_agent_id uuid;
  v_url text;
  v_inquiry_id uuid;
  v_contact_id uuid;
begin
  select c.id, c.agent_id, coalesce(c.booking_url, p.booking_url)
    into v_campaign_id, v_agent_id, v_url
  from public.campaigns c
  join public.agent_profiles p on p.id = c.agent_id
  where c.slug = p_slug and c.status = 'published';

  if v_campaign_id is null or v_url is null then
    return null;
  end if;

  if p_public_token is not null then
    select i.id, i.contact_id into v_inquiry_id, v_contact_id
    from public.inquiries i
    where i.public_token = p_public_token
      and i.campaign_id = v_campaign_id
      and i.created_at > now() - interval '30 days';
  end if;

  -- Collapse rapid repeat clicks from the same inquiry (refreshes, double taps).
  if v_inquiry_id is not null and exists (
    select 1 from public.booking_clicks b
    where b.inquiry_id = v_inquiry_id and b.clicked_at > now() - interval '10 minutes'
  ) then
    return v_url;
  end if;

  insert into public.booking_clicks (agent_id, campaign_id, inquiry_id, contact_id)
  values (v_agent_id, v_campaign_id, v_inquiry_id, v_contact_id);

  if v_contact_id is not null then
    insert into public.activity_events (agent_id, contact_id, inquiry_id, campaign_id, type, actor, data)
    values (v_agent_id, v_contact_id, v_inquiry_id, v_campaign_id, 'booking_link_clicked', 'visitor', '{}'::jsonb);
  end if;

  return v_url;
end;
$$;

-- Privileges -----------------------------------------------------------------

revoke all on function public.set_updated_at() from public, anon, authenticated;

revoke all on function public.get_public_campaign(text) from public;
grant execute on function public.get_public_campaign(text) to anon, authenticated, service_role;

revoke all on function public.get_public_asset(uuid) from public;
grant execute on function public.get_public_asset(uuid) to anon, authenticated, service_role;

revoke all on function public.submit_inquiry(text, jsonb, text, text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.submit_inquiry(text, jsonb, text, text, integer, integer, text) to service_role;

revoke all on function public.record_booking_click(text, uuid) from public, anon, authenticated;
grant execute on function public.record_booking_click(text, uuid) to service_role;
