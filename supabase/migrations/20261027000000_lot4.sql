-- Lot 4 : réponses enregistrées, codes des joueurs, programmation des questions,
-- scores par jour, cumul et classement.
-- À exécuter une fois dans Supabase (SQL Editor), après les scripts précédents.
-- Il peut être relancé sans risque.

-- ---------------------------------------------------------------------------
-- Date du jour à Paris (les jours de série suivent l'heure française)
-- ---------------------------------------------------------------------------
create or replace function public.today_paris()
returns date
language sql
stable
as $$
  select (now() at time zone 'Europe/Paris')::date;
$$;
grant execute on function public.today_paris() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Programmation des questions
--   scheduled_on : jour d'ouverture = jour de série des points
--   hidden_on    : jour où la question a été masquée
-- Une question est ouverte si sa date est atteinte et qu'elle n'a pas été
-- masquée depuis son ouverture (un masquage antérieur à la date est ignoré).
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'questions' and column_name = 'scheduled_on') then
    alter table public.questions add column scheduled_on date;
    alter table public.questions add column hidden_on date;
    -- Installation : les questions visibles aujourd'hui sont rattachées à aujourd'hui,
    -- les questions masquées restent sans date.
    update public.questions set scheduled_on = public.today_paris() where not is_hidden;
  end if;
end $$;

create index if not exists questions_schedule_idx on public.questions (quiz_id, scheduled_on);

create or replace function public.question_is_open(q public.questions)
returns boolean
language sql
stable
as $$
  select q.scheduled_on is not null
     and q.scheduled_on <= public.today_paris()
     and (not q.is_hidden or coalesce(q.hidden_on, '-infinity'::date) < q.scheduled_on);
$$;

-- ---------------------------------------------------------------------------
-- Codes personnels des joueurs (4 chiffres, attribués par l'admin)
-- ---------------------------------------------------------------------------
alter table public.players
  add column if not exists code text not null
    default lpad((floor(random() * 10000))::int::text, 4, '0')
    check (code ~ '^[0-9]{4}$');
alter table public.players add column if not exists failed_attempts int not null default 0;
alter table public.players add column if not exists locked_until timestamptz;

-- ---------------------------------------------------------------------------
-- Réponses des joueurs : une seule par joueur et par question
-- ---------------------------------------------------------------------------
create table if not exists public.responses (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  player_id   uuid not null references public.players (id) on delete cascade,
  answer      jsonb not null,
  points      numeric(5, 4) check (points between 0 and 1),
  answered_at timestamptz not null default now(),
  unique (question_id, player_id)
);
create index if not exists responses_player_idx on public.responses (player_id);

alter table public.responses enable row level security;
drop policy if exists admin_all on public.responses;
create policy admin_all on public.responses
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.responses to authenticated;

-- ---------------------------------------------------------------------------
-- Vérification du code d'un joueur (5 erreurs = 5 minutes d'attente).
-- Ne lève pas d'erreur : le compteur d'erreurs doit être enregistré.
-- ---------------------------------------------------------------------------
create or replace function public.check_player_code(p_player uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pl public.players%rowtype;
begin
  select * into pl from public.players where id = p_player for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown');
  end if;
  if pl.locked_until is not null and pl.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked',
      'wait', ceil(extract(epoch from pl.locked_until - now())));
  end if;
  if pl.code = coalesce(p_code, '') then
    if pl.failed_attempts <> 0 or pl.locked_until is not null then
      update public.players set failed_attempts = 0, locked_until = null where id = p_player;
    end if;
    return jsonb_build_object('ok', true, 'quiz_id', pl.quiz_id);
  end if;
  if pl.failed_attempts + 1 >= 5 then
    update public.players set failed_attempts = 0, locked_until = now() + interval '5 minutes' where id = p_player;
    return jsonb_build_object('ok', false, 'reason', 'locked', 'wait', 300);
  end if;
  update public.players set failed_attempts = failed_attempts + 1 where id = p_player;
  return jsonb_build_object('ok', false, 'reason', 'wrong', 'left', 4 - pl.failed_attempts);
end;
$$;
revoke all on function public.check_player_code(uuid, text) from public;

-- Connexion d'un joueur : vérifie son code et renvoie ses réponses déjà données.
create or replace function public.player_login(p_player uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  res jsonb := public.check_player_code(p_player, p_code);
begin
  if not (res ->> 'ok')::boolean then
    return res;
  end if;
  return jsonb_build_object('ok', true, 'responses', coalesce((
    select jsonb_agg(jsonb_build_object(
             'question_id', r.question_id, 'answer', r.answer, 'points', r.points))
    from public.responses r where r.player_id = p_player), '[]'::jsonb));
end;
$$;
revoke all on function public.player_login(uuid, text) from public;
grant execute on function public.player_login(uuid, text) to anon, authenticated;

-- Enregistre la réponse d'un joueur. Points vides pour les réponses en texte libre
-- tant que le joueur ne s'est pas auto-évalué.
create or replace function public.submit_answer(
  p_player uuid, p_code text, p_question uuid, p_answer jsonb, p_points numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  res  jsonb := public.check_player_code(p_player, p_code);
  q    public.questions%rowtype;
  open boolean;
begin
  if not (res ->> 'ok')::boolean then
    return res;
  end if;
  select * into q from public.questions where id = p_question;
  if not found or q.quiz_id <> (res ->> 'quiz_id')::uuid then
    return jsonb_build_object('ok', false, 'reason', 'question');
  end if;
  if not exists (select 1 from public.quizzes where id = q.quiz_id and is_published) or not public.question_is_open(q) then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;
  if p_points is null and q.type not in ('free_text', 'photo') then
    return jsonb_build_object('ok', false, 'reason', 'points');
  end if;
  if p_points is not null and (p_points < 0 or p_points > 1) then
    return jsonb_build_object('ok', false, 'reason', 'points');
  end if;

  insert into public.responses (question_id, player_id, answer, points)
  values (p_question, p_player, p_answer, p_points)
  on conflict (question_id, player_id) do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'already');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.submit_answer(uuid, text, uuid, jsonb, numeric) from public;
grant execute on function public.submit_answer(uuid, text, uuid, jsonb, numeric) to anon, authenticated;

-- Auto-évaluation d'une réponse en texte libre : une seule fois.
create or replace function public.self_evaluate(p_player uuid, p_code text, p_question uuid, p_correct boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  res jsonb := public.check_player_code(p_player, p_code);
begin
  if not (res ->> 'ok')::boolean then
    return res;
  end if;
  update public.responses
  set points = case when p_correct then 1 else 0 end
  where question_id = p_question and player_id = p_player and points is null;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'already');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.self_evaluate(uuid, text, uuid, boolean) from public;
grant execute on function public.self_evaluate(uuid, text, uuid, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Scores : par jour de série, cumul et classement (lecture publique)
-- Le maximum d'un jour compte toutes les questions ouvertes ce jour-là,
-- y compris celles masquées depuis (masquer suspend, n'annule pas).
-- ---------------------------------------------------------------------------
create or replace function public.get_scores(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with qz as (
    select * from public.quizzes where slug = p_slug and (is_published or public.is_admin())
  ),
  qs as (
    select qu.id, qu.scheduled_on as day
    from public.questions qu join qz on qz.id = qu.quiz_id
    where qu.scheduled_on is not null and qu.scheduled_on <= public.today_paris()
  ),
  days as (
    select day, count(*) as max from qs group by day
  ),
  pts as (
    select r.player_id, qs.day, sum(coalesce(r.points, 0)) as points, count(*) as answered
    from public.responses r join qs on qs.id = r.question_id
    group by r.player_id, qs.day
  )
  select case when not exists (select 1 from qz) then null else jsonb_build_object(
    'today', public.today_paris(),
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'max', max) order by day) from days), '[]'::jsonb),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'name', p.name,
               'total', coalesce((select sum(points) from pts where pts.player_id = p.id), 0),
               'answered', coalesce((select sum(answered) from pts where pts.player_id = p.id), 0),
               'days', coalesce((select jsonb_object_agg(pts.day, pts.points) from pts where pts.player_id = p.id), '{}'::jsonb))
             order by p.position, p.name)
      from public.players p join qz on qz.id = p.quiz_id), '[]'::jsonb)
  ) end;
$$;
revoke all on function public.get_scores(text) from public;
grant execute on function public.get_scores(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Lecture d'un quiz pour les joueurs : uniquement les questions ouvertes,
-- avec leur jour de série. L'aperçu admin peut demander toutes les questions.
-- Les codes des joueurs ne sont jamais envoyés.
-- ---------------------------------------------------------------------------
drop function if exists public.get_quiz(text);
create or replace function public.get_quiz(p_slug text, p_preview boolean default false)
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
      'today', public.today_paris(),
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
                 'day', qu.scheduled_on,
                 'answers', coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'id', a.id, 'text', a.text, 'is_correct', a.is_correct,
                            'position', a.position, 'side', a.side,
                            'pair_key', a.pair_key, 'date_label', a.date_label)
                          order by a.position)
                   from public.answers a where a.question_id = qu.id), '[]'::jsonb))
               order by qu.scheduled_on nulls last, qu.position, qu.created_at)
        from public.questions qu
        where qu.quiz_id = q.id
          and (public.question_is_open(qu) or (p_preview and public.is_admin() and not qu.is_hidden))), '[]'::jsonb)
    )
  end
  from public.quizzes q
  where q.slug = p_slug;
$$;
revoke all on function public.get_quiz(text, boolean) from public;
grant execute on function public.get_quiz(text, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin : joueurs (on garde leurs identifiants pour ne pas perdre leurs scores)
-- ---------------------------------------------------------------------------
create or replace function public.save_players(p_quiz_id uuid, p jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Accès réservé à l''administrateur';
  end if;

  -- Joueurs retirés de la liste (leurs réponses sont supprimées avec eux).
  delete from public.players
  where quiz_id = p_quiz_id
    and id not in (
      select (e ->> 'id')::uuid from jsonb_array_elements(p) e where coalesce(e ->> 'id', '') <> '');

  -- Joueurs existants : nom, ordre, code.
  update public.players pl set
    name = t.e ->> 'name',
    position = (t.ord - 1)::int,
    code = coalesce(nullif(t.e ->> 'code', ''), pl.code)
  from jsonb_array_elements(p) with ordinality as t(e, ord)
  where coalesce(t.e ->> 'id', '') <> '' and pl.id = (t.e ->> 'id')::uuid and pl.quiz_id = p_quiz_id;

  -- Nouveaux joueurs (code tiré au hasard s'il n'est pas fourni).
  insert into public.players (quiz_id, name, position, code)
  select p_quiz_id, t.e ->> 'name', (t.ord - 1)::int,
         coalesce(nullif(t.e ->> 'code', ''), lpad((floor(random() * 10000))::int::text, 4, '0'))
  from jsonb_array_elements(p) with ordinality as t(e, ord)
  where coalesce(t.e ->> 'id', '') = '';
end;
$$;
revoke all on function public.save_players(uuid, jsonb) from public, anon;
grant execute on function public.save_players(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin : ouvrir ou masquer une question (date du jour calculée par la base)
-- ---------------------------------------------------------------------------
create or replace function public.set_question_open(p_question uuid, p_open boolean)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Accès réservé à l''administrateur';
  end if;
  if p_open then
    update public.questions
    set scheduled_on = coalesce(scheduled_on, public.today_paris()), is_hidden = false, hidden_on = null
    where id = p_question;
  else
    update public.questions
    set is_hidden = true, hidden_on = public.today_paris()
    where id = p_question;
  end if;
end;
$$;
revoke all on function public.set_question_open(uuid, boolean) from public, anon;
grant execute on function public.set_question_open(uuid, boolean) to authenticated;

-- Admin : programmer une date (ou l'enlever). Programmer rend la question ouvrable à sa date.
create or replace function public.set_question_date(p_question uuid, p_day date)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Accès réservé à l''administrateur';
  end if;
  update public.questions
  set scheduled_on = p_day, is_hidden = false, hidden_on = null
  where id = p_question and scheduled_on is distinct from p_day;
end;
$$;
revoke all on function public.set_question_date(uuid, date) from public, anon;
grant execute on function public.set_question_date(uuid, date) to authenticated;

-- Admin : programmer en série les questions sans date, dans l'ordre du quiz,
-- N par jour à partir d'une date. Renvoie le nombre de questions programmées.
create or replace function public.schedule_questions(p_quiz_id uuid, p_start date, p_per_day int)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  n int;
begin
  if not public.is_admin() then
    raise exception 'Accès réservé à l''administrateur';
  end if;
  if p_per_day < 1 or p_per_day > 50 then
    raise exception 'Nombre de questions par jour invalide';
  end if;
  with todo as (
    select id, row_number() over (order by position, created_at) - 1 as rn
    from public.questions
    where quiz_id = p_quiz_id and scheduled_on is null
  )
  update public.questions q
  set scheduled_on = p_start + (todo.rn / p_per_day)::int, is_hidden = false, hidden_on = null
  from todo where q.id = todo.id;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.schedule_questions(uuid, date, int) from public, anon;
grant execute on function public.schedule_questions(uuid, date, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Enregistrer une question : la date se règle aussi depuis l'éditeur.
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
  day date := nullif(p ->> 'scheduled_on', '')::date;
begin
  if not public.is_admin() then
    raise exception 'Accès réservé à l''administrateur';
  end if;

  if qid is null then
    insert into public.questions (quiz_id, position, type, prompt, image_path, more_info, background_color, scheduled_on)
    values (
      quiz,
      coalesce((select max(position) + 1 from public.questions where quiz_id = quiz), 0),
      (p ->> 'type')::public.question_type,
      p ->> 'prompt',
      nullif(p ->> 'image_path', ''),
      nullif(p ->> 'more_info', ''),
      nullif(p ->> 'background_color', ''),
      day)
    returning id into qid;
  else
    update public.questions set
      type       = (p ->> 'type')::public.question_type,
      prompt     = p ->> 'prompt',
      image_path = nullif(p ->> 'image_path', ''),
      more_info  = nullif(p ->> 'more_info', ''),
      background_color = nullif(p ->> 'background_color', '')
    where id = qid;
    perform public.set_question_date(qid, day);
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
-- Dupliquer un quiz : joueurs (avec leurs codes), questions et programmation.
-- Les réponses des joueurs ne sont pas copiées.
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

  base := rtrim(left(regexp_replace(src.slug, '-copie(-[0-9]+)?$', ''), 30), '-');
  candidate := base || '-copie';
  while exists (select 1 from public.quizzes where slug = candidate) loop
    candidate := base || '-copie-' || n;
    n := n + 1;
  end loop;

  insert into public.quizzes (slug, name, description)
  values (candidate, left(regexp_replace(src.name, ' \(copie\)$', '') || ' (copie)', 200), src.description)
  returning id into new_quiz;

  insert into public.players (quiz_id, name, position, code)
  select new_quiz, name, position, code from public.players where quiz_id = p_quiz_id;

  for q in
    select * from public.questions where quiz_id = p_quiz_id order by position, created_at
  loop
    insert into public.questions (quiz_id, position, type, prompt, image_path, more_info, background_color,
                                  is_hidden, scheduled_on, hidden_on)
    values (new_quiz, q.position, q.type, q.prompt, q.image_path, q.more_info, q.background_color,
            q.is_hidden, q.scheduled_on, q.hidden_on)
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
