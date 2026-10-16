-- Lot 1 : réorganisation des questions et duplication d'un quiz.
-- À exécuter une fois dans Supabase (SQL Editor), après le script initial.
-- Il peut être relancé sans risque.

-- ---------------------------------------------------------------------------
-- Réordonner les questions d'un quiz
-- ---------------------------------------------------------------------------
create or replace function public.reorder_questions(p_quiz_id uuid, p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Accès réservé à l''administrateur';
  end if;

  update public.questions q
  set position = (t.ord - 1)::int
  from unnest(p_ids) with ordinality as t(id, ord)
  where q.id = t.id and q.quiz_id = p_quiz_id;
end;
$$;

revoke all on function public.reorder_questions(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_questions(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Dupliquer un quiz : joueurs, questions et réponses.
-- Les photos ne sont pas copiées : la copie pointe vers les mêmes fichiers.
-- ---------------------------------------------------------------------------
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
    insert into public.questions (quiz_id, position, type, prompt, image_path, more_info)
    values (new_quiz, q.position, q.type, q.prompt, q.image_path, q.more_info)
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

-- Droits nécessaires à l'envoi des photos (certains projets récents ne les accordent plus par défaut).
grant usage on schema storage to authenticated, anon;
