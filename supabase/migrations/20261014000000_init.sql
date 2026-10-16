-- Quiz des voisines : structure de la base, règles d'accès et fonctions.
-- À exécuter une fois dans Supabase (SQL Editor) ou avec `supabase db push`.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Administrateurs
-- ---------------------------------------------------------------------------
-- Seuls les comptes listés ici peuvent écrire. Les inscriptions doivent aussi
-- être désactivées dans Authentication > Providers > Email.
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.app_admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.question_type as enum
    ('free_text', 'mcq', 'true_false', 'matching', 'chronology', 'who_am_i', 'photo');
exception when duplicate_object then null; end $$;

create table if not exists public.quizzes (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique
              check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
                     and slug not in ('admin', 'assets', '404')),
  name        text not null check (char_length(name) between 1 and 200),
  description text check (char_length(description) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.players (
  id       uuid primary key default gen_random_uuid(),
  quiz_id  uuid not null references public.quizzes (id) on delete cascade,
  name     text not null check (char_length(name) between 1 and 60),
  position int  not null default 0
);
create index if not exists players_quiz_idx on public.players (quiz_id, position);

create table if not exists public.questions (
  id         uuid primary key default gen_random_uuid(),
  quiz_id    uuid not null references public.quizzes (id) on delete cascade,
  position   int  not null default 0,
  type       public.question_type not null,
  prompt     text not null check (char_length(prompt) between 1 and 500),
  image_path text,
  more_info  text check (char_length(more_info) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists questions_quiz_idx on public.questions (quiz_id, position);

create table if not exists public.answers (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  position    int  not null default 0,
  text        text not null check (char_length(text) between 1 and 500),
  is_correct  boolean not null default false,
  side        text check (side in ('left', 'right')),
  pair_key    int,
  date_label  text check (char_length(date_label) <= 100)
);
create index if not exists answers_question_idx on public.answers (question_id, position);

-- ---------------------------------------------------------------------------
-- Règles d'accès : aucun accès direct pour les visiteurs, tout pour l'admin.
-- ---------------------------------------------------------------------------
alter table public.quizzes   enable row level security;
alter table public.players   enable row level security;
alter table public.questions enable row level security;
alter table public.answers   enable row level security;

drop policy if exists admin_all on public.quizzes;
create policy admin_all on public.quizzes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_all on public.players;
create policy admin_all on public.players
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_all on public.questions;
create policy admin_all on public.questions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_all on public.answers;
create policy admin_all on public.answers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Lecture publique d'un quiz par son adresse
-- ---------------------------------------------------------------------------
create or replace function public.get_quiz(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', q.id,
    'slug', q.slug,
    'name', q.name,
    'description', q.description,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name)
                       order by p.position, p.name)
      from public.players p where p.quiz_id = q.id), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', qu.id,
               'type', qu.type,
               'prompt', qu.prompt,
               'image_path', qu.image_path,
               'more_info', qu.more_info,
               'answers', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', a.id, 'text', a.text, 'is_correct', a.is_correct,
                          'position', a.position, 'side', a.side,
                          'pair_key', a.pair_key, 'date_label', a.date_label)
                        order by a.position)
                 from public.answers a where a.question_id = qu.id), '[]'::jsonb))
             order by qu.position, qu.created_at)
      from public.questions qu where qu.quiz_id = q.id), '[]'::jsonb)
  )
  from public.quizzes q
  where q.slug = p_slug;
$$;

revoke all on function public.get_quiz(text) from public;
grant execute on function public.get_quiz(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enregistrement d'une question et de ses réponses en une seule transaction
-- ---------------------------------------------------------------------------
create or replace function public.save_question(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  qid uuid := nullif(p ->> 'id', '')::uuid;
  quiz uuid := (p ->> 'quiz_id')::uuid;
begin
  if not public.is_admin() then
    raise exception 'Accès réservé à l''administrateur';
  end if;

  if qid is null then
    insert into public.questions (quiz_id, position, type, prompt, image_path, more_info)
    values (
      quiz,
      coalesce((select max(position) + 1 from public.questions where quiz_id = quiz), 0),
      (p ->> 'type')::public.question_type,
      p ->> 'prompt',
      nullif(p ->> 'image_path', ''),
      nullif(p ->> 'more_info', ''))
    returning id into qid;
  else
    update public.questions set
      type       = (p ->> 'type')::public.question_type,
      prompt     = p ->> 'prompt',
      image_path = nullif(p ->> 'image_path', ''),
      more_info  = nullif(p ->> 'more_info', '')
    where id = qid;
  end if;

  delete from public.answers where question_id = qid;

  insert into public.answers (question_id, position, text, is_correct, side, pair_key, date_label)
  select qid,
         (t.ord - 1)::int,
         t.a ->> 'text',
         coalesce((t.a ->> 'is_correct')::boolean, false),
         t.a ->> 'side',
         (t.a ->> 'pair_key')::int,
         nullif(t.a ->> 'date_label', '')
  from jsonb_array_elements(coalesce(p -> 'answers', '[]'::jsonb)) with ordinality as t(a, ord);

  return qid;
end;
$$;

revoke all on function public.save_question(jsonb) from public, anon;
grant execute on function public.save_question(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Photos des questions (utilisées à partir du lot 1)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('question-images', 'question-images', true)
on conflict (id) do nothing;

drop policy if exists question_images_admin_insert on storage.objects;
create policy question_images_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'question-images' and public.is_admin());

drop policy if exists question_images_admin_update on storage.objects;
create policy question_images_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'question-images' and public.is_admin());

drop policy if exists question_images_admin_delete on storage.objects;
create policy question_images_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'question-images' and public.is_admin());
