-- Cliente (useSubscription): RPC has_role para detectar admin sin carrera con setLoading(false).
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
