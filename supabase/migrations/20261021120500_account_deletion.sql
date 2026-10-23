-- Agents can permanently delete their own account.
--
-- Deleting the auth user cascades to agent_profiles and from there to every
-- agent-owned row (campaigns, contacts, inquiries, consent records, emails...).
-- Callable only by the signed-in agent, and only for themselves.

create or replace function public.delete_own_account()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return false;
  end if;
  delete from auth.users where id = v_uid;
  return found;
end;
$$;

revoke all on function public.delete_own_account() from public, anon, service_role;
grant execute on function public.delete_own_account() to authenticated;
