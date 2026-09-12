-- seed_weekly_plan() is only ever invoked by the on_auth_user_created_seed_plan
-- trigger. PostgREST otherwise exposes it at /rest/v1/rpc/seed_weekly_plan to
-- anon and authenticated, so take EXECUTE away from the API roles. Trigger
-- firing does not consult EXECUTE privileges, so the seed still runs on signup.
revoke execute on function public.seed_weekly_plan() from public, anon, authenticated;
