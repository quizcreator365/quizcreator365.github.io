-- Lot 3 : couleur de fond des questions.
-- À exécuter une fois dans Supabase (SQL Editor), après les scripts précédents.
-- Il peut être relancé sans risque.

alter table public.questions
  add column if not exists background_color text
  check (char_length(background_color) <= 40);

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
    insert into public.questions (quiz_id, position, type, prompt, image_path, more_info, background_color)
    values (
      quiz,
      coalesce((select max(position) + 1 from public.questions where quiz_id = quiz), 0),
      (p ->> 'type')::public.question_type,
      p ->> 'prompt',
      nullif(p ->> 'image_path', ''),
      nullif(p ->> 'more_info', ''),
      nullif(p ->> 'background_color', ''))
    returning id into qid;
  else
    update public.questions set
      type       = (p ->> 'type')::public.question_type,
      prompt     = p ->> 'prompt',
      image_path = nullif(p ->> 'image_path', ''),
      more_info  = nullif(p ->> 'more_info', ''),
      background_color = nullif(p ->> 'background_color', '')
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
    insert into public.questions (quiz_id, position, type, prompt, image_path, more_info, background_color)
    values (new_quiz, q.position, q.type, q.prompt, q.image_path, q.more_info, q.background_color)
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
        from public.questions qu where qu.quiz_id = q.id), '[]'::jsonb)
    )
  end
  from public.quizzes q
  where q.slug = p_slug;
$$;

revoke all on function public.get_quiz(text) from public;
grant execute on function public.get_quiz(text) to anon, authenticated;
