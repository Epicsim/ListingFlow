-- A linked email may still be accepted after a provider timeout. Only an
-- unlinked draft or a failed attempt can be skipped, matching the resend rule.
create or replace function public.skip_plan_task(p_task_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); contact uuid;
begin
  if owner_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  -- Same contact-first lock order as plan starts, stops and email review.
  perform 1 from public.contacts c where c.agent_id = owner_id and exists (
    select 1 from public.follow_up_tasks t where t.id = p_task_id
      and t.agent_id = owner_id and t.contact_id = c.id
  ) for update;
  update public.follow_up_tasks t set canceled_at = now(), cancel_reason = 'skipped'
    where t.id = p_task_id and t.agent_id = owner_id and t.enrollment_id is not null
      and t.kind in ('call', 'email', 'text') and t.completed_at is null and t.canceled_at is null
      and (t.kind <> 'email' or t.email_id is null or exists (
        select 1 from public.outbound_emails m
        where m.id = t.email_id and m.agent_id = t.agent_id and m.status = 'failed'))
      and exists(select 1 from public.follow_up_enrollments e
        where e.id = t.enrollment_id and e.agent_id = owner_id and e.contact_id = t.contact_id and e.status = 'active')
    returning t.contact_id into contact;
  return contact;
end $$;
revoke all on function public.skip_plan_task(uuid) from public, anon, authenticated, service_role;
grant execute on function public.skip_plan_task(uuid) to authenticated;
