create table public.reface_catalogue_publishers (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  code_hash text not null unique check (code_hash ~ '^[a-f0-9]{64}$'),
  revoked_at timestamptz
);

create table public.reface_catalogue_themes (
  id text primary key,
  page_url text not null,
  css_hash text not null check (css_hash ~ '^[a-f0-9]{64}$'),
  entry jsonb not null,
  publisher_id uuid not null references public.reface_catalogue_publishers (id),
  created_at timestamptz not null default now(),
  unique (page_url, css_hash)
);

create index reface_catalogue_latest on public.reface_catalogue_themes (created_at desc, id desc);
create index reface_catalogue_publisher_history on public.reface_catalogue_themes (publisher_id, created_at);

alter table public.reface_catalogue_publishers enable row level security;
alter table public.reface_catalogue_themes enable row level security;
revoke all on public.reface_catalogue_publishers, public.reface_catalogue_themes from public, anon, authenticated;
grant select, update (revoked_at) on public.reface_catalogue_publishers to service_role;
grant select, insert on public.reface_catalogue_themes to service_role;

create function public.reface_publish_catalogue_theme(p_code_hash text, p_css_hash text, p_entry jsonb)
returns text
language plpgsql
set search_path = ''
as $$
declare
  publisher uuid;
  inserted_id text;
begin
  -- Serialize publishing and revocation for the same code.
  select id into publisher
  from public.reface_catalogue_publishers
  where code_hash = p_code_hash and revoked_at is null
  for update;

  if publisher is null then
    return 'forbidden';
  end if;

  if exists (
    select 1 from public.reface_catalogue_themes
    where page_url = p_entry->>'pageUrl' and css_hash = p_css_hash
  ) then
    return 'duplicate';
  end if;

  if (
    select count(*) from public.reface_catalogue_themes
    where publisher_id = publisher and created_at >= now() - interval '1 hour'
  ) >= 20 then
    return 'rate_limited';
  end if;

  insert into public.reface_catalogue_themes (id, page_url, css_hash, entry, publisher_id)
  values (p_entry->>'id', p_entry->>'pageUrl', p_css_hash, p_entry, publisher)
  on conflict (page_url, css_hash) do nothing
  returning id into inserted_id;
  return case when inserted_id is null then 'duplicate' else 'published' end;
end;
$$;

revoke all on function public.reface_publish_catalogue_theme(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.reface_publish_catalogue_theme(text, text, jsonb) to service_role;
