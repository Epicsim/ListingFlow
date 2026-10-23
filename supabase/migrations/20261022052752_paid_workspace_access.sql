alter table billing_private.checkouts add column latest_invoice_id text;
grant update (latest_invoice_id) on billing_private.checkouts to authenticated;

-- RLS still applies when agents call this private, invoker-security function.
create function billing_private.has_paid_access(p_agent_id uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from billing_private.checkouts c
    join billing_private.receipts r on r.invoice_id = c.latest_invoice_id
      and r.agent_id = c.agent_id and r.checkout_key = c.idempotency_key
    where c.agent_id = p_agent_id and c.livemode and r.livemode
      and c.subscription_status = 'active' and c.period_end > now()
  )
$$;
revoke all on function billing_private.has_paid_access(uuid) from public, anon, service_role;
grant execute on function billing_private.has_paid_access(uuid) to authenticated;

-- Intentionally public boolean availability check: anonymous visitors must not
-- read billing tables, identifiers, receipts, or an agent's private account state.
create function public.campaign_has_paid_access(p_slug text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.campaigns c where c.slug = lower(p_slug)
    and c.status = 'published' and billing_private.has_paid_access(c.agent_id))
$$;
revoke all on function public.campaign_has_paid_access(text) from public;
grant execute on function public.campaign_has_paid_access(text) to anon, authenticated, service_role;
