-- Never expose billing_private in Supabase's Data API schema settings. It is
-- accessed only by our server's direct SQL connection, with per-agent RLS.
-- This keeps authenticated API clients from writing payment confirmations.
create schema billing_private;
revoke all on schema billing_private from public, anon, service_role;
grant usage on schema billing_private to authenticated;

create table billing_private.checkouts (
  agent_id uuid not null references public.agent_profiles(id) on delete cascade,
  idempotency_key uuid not null,
  price_id text not null,
  livemode boolean not null,
  site_url text not null,
  status text not null default 'creating' check (status in ('creating', 'open', 'complete', 'expired')),
  session_id text unique,
  customer_id text,
  subscription_id text unique,
  subscription_status text,
  cancel_at_period_end boolean not null default false,
  period_end timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default date_trunc('second', now() + interval '23 hours'),
  primary key (agent_id, idempotency_key)
);
create unique index one_unresolved_checkout_per_agent
  on billing_private.checkouts (agent_id, livemode)
  where status <> 'expired' and coalesce(subscription_status, '') not in ('canceled', 'incomplete_expired');

create table billing_private.receipts (
  invoice_id text primary key,
  agent_id uuid not null,
  checkout_key uuid not null,
  invoice_number text,
  amount_paid integer not null check (amount_paid >= 0),
  currency text not null check (currency = 'usd'),
  paid_at timestamptz not null,
  hosted_invoice_url text,
  invoice_pdf text,
  livemode boolean not null,
  foreign key (agent_id, checkout_key) references billing_private.checkouts(agent_id, idempotency_key) on delete cascade
);
create index billing_receipts_by_agent on billing_private.receipts (agent_id, livemode, paid_at desc);
create index billing_receipts_by_checkout on billing_private.receipts (agent_id, checkout_key, paid_at);

alter table billing_private.checkouts enable row level security;
alter table billing_private.receipts enable row level security;
revoke all on billing_private.checkouts, billing_private.receipts from public, anon, authenticated, service_role;
grant select, insert on billing_private.checkouts to authenticated;
grant update (status, session_id, customer_id, subscription_id, subscription_status, cancel_at_period_end, period_end)
  on billing_private.checkouts to authenticated;
grant select, insert on billing_private.receipts to authenticated;
create policy checkout_read on billing_private.checkouts for select to authenticated using (agent_id = (select auth.uid()));
create policy checkout_create on billing_private.checkouts for insert to authenticated with check (agent_id = (select auth.uid()));
create policy checkout_update on billing_private.checkouts for update to authenticated
  using (agent_id = (select auth.uid())) with check (agent_id = (select auth.uid()));
create policy receipt_read on billing_private.receipts for select to authenticated using (agent_id = (select auth.uid()));
create policy receipt_create on billing_private.receipts for insert to authenticated with check (agent_id = (select auth.uid()));

-- Do not orphan a chargeable subscription, or erase an ambiguous checkout key,
-- through the existing account-deletion RPC (including direct RPC calls).
create function billing_private.guard_account_deletion() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if exists (select 1 from billing_private.checkouts where agent_id = old.id
    and status <> 'expired' and coalesce(subscription_status, '') not in ('canceled', 'incomplete_expired')) then
    raise exception 'billing_must_be_closed' using errcode = '23514';
  end if;
  return old;
end;
$$;
revoke all on function billing_private.guard_account_deletion() from public, anon, authenticated, service_role;
create trigger guard_billing_before_account_deletion before delete on public.agent_profiles
  for each row execute function billing_private.guard_account_deletion();
