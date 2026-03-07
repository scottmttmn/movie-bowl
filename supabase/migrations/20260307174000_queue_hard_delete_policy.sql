-- Normalize queue removal to hard delete.
-- Keep removed_at for backward compatibility but do not rely on UPDATE for user removals.

drop policy if exists "Queue users can update own pending rows" on public.bowl_movie_queue;

drop policy if exists "Queue users can delete own pending rows" on public.bowl_movie_queue;
create policy "Queue users can delete own pending rows"
on public.bowl_movie_queue
for delete
to authenticated
using (
  queued_by = auth.uid()
  and promoted_at is null
  and removed_at is null
);
