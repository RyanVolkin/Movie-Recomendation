-- Run this in Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.movies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  overview text not null default '',
  poster_url text not null default '',
  likes_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.movies enable row level security;

-- Read-only access for authenticated users.
drop policy if exists "authenticated users can read profiles" on public.profiles;
create policy "authenticated users can read profiles"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "authenticated users can read movies" on public.movies;
create policy "authenticated users can read movies"
  on public.movies for select
  to authenticated
  using (true);

-- Service role key in backend bypasses RLS for write operations.
