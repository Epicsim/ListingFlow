-- No broad UPDATE grant on cancellation fields: the only agent cancellation
-- operation is this authenticated, ownership-scoped skip of one open plan task.
create function public.skip_plan_task(p_task_id uuid) returns uuid
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
      and exists(select 1 from public.follow_up_enrollments e
        where e.id = t.enrollment_id and e.agent_id = owner_id and e.contact_id = t.contact_id and e.status = 'active')
    returning t.contact_id into contact;
  return contact;
end $$;
revoke all on function public.skip_plan_task(uuid) from public, anon, authenticated, service_role;
grant execute on function public.skip_plan_task(uuid) to authenticated;

-- Invoker security deliberately observes the role doing the UPDATE. Private
-- definer completion/stop triggers execute as their owner, whereas a direct
-- authenticated API call may only stop its active enrollment as the agent.
create function app_private.guard_enrollment_transition() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    if old.status <> 'active' or new.status not in ('stopped', 'completed') then
      raise exception 'enrollment_transition_forbidden' using errcode = '23514';
    end if;
    if new.status = 'completed' and current_user in ('anon', 'authenticated', 'service_role') then
      raise exception 'enrollment_completion_requires_trigger' using errcode = '42501';
    end if;
    if current_user = 'authenticated' and (new.stop_reason is distinct from 'agent_stopped'
        or new.stop_actor <> 'agent' or new.agent_id is distinct from auth.uid()) then
      raise exception 'enrollment_stop_forbidden' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function app_private.guard_enrollment_transition() from public, anon, authenticated, service_role;
create trigger guard_enrollment_transition before update of status on public.follow_up_enrollments
  for each row execute function app_private.guard_enrollment_transition();

-- Resolving an old appointment's outcome does not book a new consultation.
drop trigger appointment_stops_plans on public.appointments;
create trigger appointment_insert_stops_plans after insert on public.appointments
  for each row when (new.status <> 'canceled') execute function app_private.appointment_stops_plans();
create trigger appointment_rebooking_stops_plans after update of status on public.appointments
  for each row when (new.status = 'scheduled' and old.status is distinct from new.status)
  execute function app_private.appointment_stops_plans();
