-- Lock down profile updates so a non-admin cannot promote themselves to admin.
--
-- Background: the original `profiles_update_self_or_admin` policy allowed any
-- authenticated user to update their own profile row with no restriction on which
-- columns they could change. A signed-in client could run
--
--     update public.profiles set role = 'admin' where id = auth.uid()
--
-- from the browser via the Supabase JS client and walk straight into the admin
-- dashboard. This migration replaces the policy so that:
--
--   - Admins can still update any profile (any column).
--   - Non-admins can still update their own profile, but the `role` column must
--     stay equal to its current value. Any attempt to change role on a self-update
--     is rejected by the WITH CHECK clause.
--
-- We reuse the existing `public.current_user_role()` helper because it is
-- SECURITY DEFINER and avoids any RLS-recursion concerns when the policy
-- evaluates the subquery against the same table.

begin;

drop policy if exists "profiles_update_self_or_admin" on public.profiles;

create policy "profiles_update_self_or_admin"
on public.profiles for update
using (id = auth.uid() or public.is_admin())
with check (
  public.is_admin()
  or (
    id = auth.uid()
    and role = public.current_user_role()
  )
);

commit;
