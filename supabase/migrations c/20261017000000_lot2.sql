-- Lot 2 : publier ou fermer un quiz.
-- À exécuter une fois dans Supabase (SQL Editor), après les scripts précédents.
-- Il peut être relancé sans risque.

-- Les quiz existants restent publiés ; les nouveaux sont fermés jusqu'à leur publication.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'quizzes' and column_name = 'is_published'
  ) then
    alter table public.quizzes add column is_published boolean not null default true;
    alter table public.quizzes alter column is_published set default false;
  end if;
end $$;

-- Lecture d'un quiz : un quiz fermé n'est visible que par l'admin (aperçu).
-- Les visiteurs reçoivent seulement { closed: true, name } pour afficher un message clair.
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
grant execute on function public.is_admin() to anon;
