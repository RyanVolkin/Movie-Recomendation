-- Run this in Supabase SQL editor.

create extension if not exists pgcrypto;
create extension if not exists vector;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.movies (
  tconst text primary key,
  title text not null,
  release_year integer not null,
  runtime integer not null,
  rating float not null,
  numratings integer not null,
  genre1 text not null,
  genre2 text,
  genre3 text,
  like_count integer not null default 0
);

create table if not exists public.user_movie_likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  movie_id text not null references public.movies(tconst) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, movie_id)
);

create table if not exists public.move_vectors (
  tconst text primary key references public.movies(tconst) on delete cascade,
  genre_vector vector(28) not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.movies enable row level security;
alter table public.user_movie_likes enable row level security;
alter table public.move_vectors enable row level security;

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

drop policy if exists "users can read their own likes" on public.user_movie_likes;
create policy "users can read their own likes"
  on public.user_movie_likes for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "authenticated users can read move vectors" on public.move_vectors;
create policy "authenticated users can read movie vectors"
  on public.move_vectors for select
  to authenticated
  using (true);

-- Service role key in backend bypasses RLS for write operations.
