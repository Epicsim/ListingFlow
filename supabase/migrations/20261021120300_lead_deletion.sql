-- Agents may permanently delete their own leads for privacy requests.
-- Existing foreign keys cascade deletion to the contact's related records.
-- Anonymous visitors retain no access to contacts or their child tables.
grant delete on public.contacts to authenticated;

create policy "contacts_delete_own" on public.contacts
  for delete to authenticated using (agent_id = (select auth.uid()));
