-- Renaming an add link's contributor label has never been able to save.
-- 20260406140000 replaced the old revoke policy with a DELETE policy and left
-- no UPDATE policy behind, so under RLS every label edit matched zero rows and
-- came back without an error. Bowl Settings took the empty success at its word.
--
-- The rule mirrors deletion: the bowl owner or the link's creator. Both are
-- also held to the SELECT policy, which requires current access to the bowl,
-- so a creator who has left cannot relabel what they can no longer see.
--
-- The label is the only column a client edits. Narrowing the table grant to it
-- keeps this policy from also opening max_adds, adds_used or the token, which
-- only consume_bowl_add_link (a definer) changes.

begin;

drop policy if exists "Bowl owners or creators can relabel add links" on public.bowl_add_links;
create policy "Bowl owners or creators can relabel add links"
on public.bowl_add_links
for update
to authenticated
using (
  exists (
    select 1
    from public.bowls b
    where b.id = bowl_add_links.bowl_id
      and b.owner_id = auth.uid()
  )
  or created_by = auth.uid()
)
with check (
  exists (
    select 1
    from public.bowls b
    where b.id = bowl_add_links.bowl_id
      and b.owner_id = auth.uid()
  )
  or created_by = auth.uid()
);

revoke update on public.bowl_add_links from anon, authenticated;
grant update (default_contributor_name) on public.bowl_add_links to authenticated;

commit;
