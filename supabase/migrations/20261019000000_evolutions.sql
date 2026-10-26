-- Évolutions : questions masquées, fusion de « Qui suis-je ? » dans « Quiz photo ».
-- À exécuter une fois dans Supabase (SQL Editor), après les scripts précédents.
-- Il peut être relancé sans risque.

-- 1. Statut d'une question : publiée (par défaut) ou masquée.
alter table public.questions
  add column if not exists is_hidden boolean not null default false;

-- 2. « Qui suis-je ? » devient « Quiz photo » (même fonctionnement).
update public.questions set type = 'photo' where type = 'who_am_i';
alter table public.questions drop constraint if exists questions_type_not_who_am_i;
alter table public.questions
  add constraint questions_type_not_who_am_i check (type <> 'who_am_i');

-- 3. La copie d'un quiz garde le statut de chaque question.
create or replace function public.duplicate_quiz(p_quiz_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  src       public.quizzes%rowtype;
  base      text;
  candidate text;
  n         int := 2;
  new_quiz  uuid;
  q         record;
  new_q     uuid;
begin
  if not public.is_admin() then
    raise exception 'Accès réservé à l''administrateur';
  end if;

  select * into src from public.quizzes where id = p_quiz_id;
  if not found then
    raise exception 'Quiz introuvable';
  end if;

  -- Adresse libre : voisines-copie, voisines-copie-2, ...
  base := rtrim(left(regexp_replace(src.slug, '-copie(-[0-9]+)?$', ''), 30), '-');
  candidate := base || '-copie';
  while exists (select 1 from public.quizzes where slug = candidate) loop
    candidate := base || '-copie-' || n;
    n := n + 1;
  end loop;

  insert into public.quizzes (slug, name, description)
  values (candidate, left(regexp_replace(src.name, ' \(copie\)$', '') || ' (copie)', 200), src.description)
  returning id into new_quiz;

  insert into public.players (quiz_id, name, position)
  select new_quiz, name, position from public.players where quiz_id = p_quiz_id;

  for q in
    select * from public.questions where quiz_id = p_quiz_id order by position, created_at
  loop
    insert into public.questions (quiz_id, position, type, prompt, image_path, more_info, background_color, is_hidden)
    values (new_quiz, q.position, q.type, q.prompt, q.image_path, q.more_info, q.background_color, q.is_hidden)
    returning id into new_q;

    insert into public.answers (question_id, position, text, is_correct, side, pair_key, date_label)
    select new_q, position, text, is_correct, side, pair_key, date_label
    from public.answers where question_id = q.id;
  end loop;

  return new_quiz;
end;
$$;

revoke all on function public.duplicate_quiz(uuid) from public, anon;
grant execute on function public.duplicate_quiz(uuid) to authenticated;

-- 4. Les joueurs (et l'aperçu) ne reçoivent que les questions publiées.
create or replace function public.get_quiz(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not q.is_published and not public.is_admin()
      then jsonb_build_object('closed', true, 'name', q.name)
    else jsonb_build_object(
      'id', q.id,
      'slug', q.slug,
      'name', q.name,
      'description', q.description,
      'is_published', q.is_published,
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
                 'background_color', qu.background_color,
                 'answers', coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'id', a.id, 'text', a.text, 'is_correct', a.is_correct,
                            'position', a.position, 'side', a.side,
                            'pair_key', a.pair_key, 'date_label', a.date_label)
                          order by a.position)
                   from public.answers a where a.question_id = qu.id), '[]'::jsonb))
               order by qu.position, qu.created_at)
        from public.questions qu where qu.quiz_id = q.id and not qu.is_hidden), '[]'::jsonb)
    )
  end
  from public.quizzes q
  where q.slug = p_slug;
$$;

revoke all on function public.get_quiz(text) from public;
grant execute on function public.get_quiz(text) to anon, authenticated;
