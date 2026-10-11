-- 0002_harden_set_updated_at.sql
-- Supabase security advisor (function_search_path_mutable): pin the search_path of trigger functions.
-- The function only uses now() and NEW, so an empty search_path is safe.
alter function public.set_updated_at() set search_path = '';
