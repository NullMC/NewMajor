-- Portfolio dei progetti realizzati: post social in cui le squadre mostrano divise e kit
-- personalizzati, caricati dal backoffice e mostrati in home.
-- Migration additiva: nessuna tabella esistente viene modificata o eliminata.

create table public.portfolio_posts (
  id            uuid primary key default gen_random_uuid(),
  team_name     text not null check (char_length(team_name) between 1 and 120),
  title         text check (char_length(title) <= 160),
  caption       text check (char_length(caption) <= 1000),
  image_path    text not null check (char_length(image_path) between 1 and 300),
  image_alt     text check (char_length(image_alt) <= 200),
  post_url      text check (post_url ~ '^https://' and char_length(post_url) <= 500),
  platform      text check (platform in ('instagram', 'facebook', 'tiktok', 'altro')),
  posted_on     date,
  is_published  boolean not null default false,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index portfolio_posts_published_idx on public.portfolio_posts (is_published, sort_order);

create trigger portfolio_posts_updated_at before update on public.portfolio_posts
  for each row execute function public.set_updated_at();
create trigger portfolio_posts_audit after insert or update or delete on public.portfolio_posts
  for each row execute function public.audit_trigger();

-- Accessi: gli admin gestiscono tutto, i visitatori leggono solo i post pubblicati
alter table public.portfolio_posts enable row level security;
create policy "admin_all_portfolio_posts" on public.portfolio_posts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "portfolio_public" on public.portfolio_posts
  for select to anon, authenticated using (is_published);

grant select on public.portfolio_posts to anon, authenticated;
grant insert, update, delete on public.portfolio_posts to authenticated;

-- Home: la sezione "qualità grafiche" lascia il posto al portfolio. Le soglie DPI restano
-- nelle impostazioni (settings.quality) e continuano a guidare l'avviso nel configuratore.
update public.site_content
set value = (value - 'quality')
  || case when value ? 'portfolio' then '{}'::jsonb
          else jsonb_build_object('portfolio', jsonb_build_object('title', 'Progetti realizzati', 'text', '')) end
where key = 'home.sections';
