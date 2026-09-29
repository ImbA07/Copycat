-- Bestenliste für COPYCAT (bereits im Supabase-Projekt "richia" eingespielt).
-- Die Tabelle ist für Besucher gesperrt; der Zugriff läuft nur über die Funktionen unten.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.copycat_scores (
  name_key text primary key,
  display_name text not null,
  score integer not null default 0,
  rounds integer not null default 0,
  headshots integer not null default 0,
  accuracy real not null default 0,
  hs_rate real not null default 0,
  secret_hashes text[] not null default '{}',
  pin_hash text,
  pin_fails integer not null default 0,
  pin_locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.copycat_scores enable row level security;
revoke all on public.copycat_scores from anon, authenticated;
create index if not exists copycat_scores_score_idx on public.copycat_scores (score desc);

create or replace function public.copycat_valid_name(p_name text) returns boolean
language sql immutable set search_path = '' as $$
  select p_name is not null and btrim(p_name) ~ '^[A-Za-z0-9ÄÖÜäöüß _.-]{2,16}$'
$$;

create or replace function public.copycat_hash(p text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(coalesce(p,''), 'sha256'), 'hex')
$$;

create or replace function public.copycat_top10()
returns table(display_name text, score integer, rounds integer, headshots integer, accuracy real, hs_rate real, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.display_name, s.score, s.rounds, s.headshots, s.accuracy, s.hs_rate, s.updated_at
  from public.copycat_scores s order by s.score desc, s.updated_at asc limit 10
$$;

-- 'free' | 'yours' | 'taken' | 'taken_pin' | 'invalid'
create or replace function public.copycat_check_name(p_name text, p_secret text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare r public.copycat_scores;
begin
  if not public.copycat_valid_name(p_name) then return 'invalid'; end if;
  select * into r from public.copycat_scores where name_key = lower(btrim(p_name));
  if not found then return 'free'; end if;
  if public.copycat_hash(p_secret) = any(r.secret_hashes) then return 'yours'; end if;
  if r.pin_hash is not null then return 'taken_pin'; end if;
  return 'taken';
end $$;

create or replace function public.copycat_submit(
  p_name text, p_secret text, p_score integer, p_rounds integer,
  p_headshots integer, p_accuracy real, p_hs_rate real)
returns json language plpgsql security definer set search_path = '' as $$
declare r public.copycat_scores; k text := lower(btrim(p_name)); st text; best integer; rnk integer;
begin
  if not public.copycat_valid_name(p_name) or p_secret is null or length(p_secret) < 16 then
    return json_build_object('status','invalid'); end if;
  if p_rounds < 0 or p_rounds > 1000 or p_score < 0 or p_score > p_rounds * 2200
     or p_headshots < 0 or p_accuracy < 0 or p_accuracy > 1 or p_hs_rate < 0 or p_hs_rate > 1 then
    return json_build_object('status','invalid'); end if;
  select * into r from public.copycat_scores where name_key = k for update;
  if not found then
    insert into public.copycat_scores(name_key, display_name, score, rounds, headshots, accuracy, hs_rate, secret_hashes)
    values (k, btrim(p_name), p_score, p_rounds, p_headshots, p_accuracy, p_hs_rate, array[public.copycat_hash(p_secret)]);
    st := 'new'; best := p_score;
  elsif not (public.copycat_hash(p_secret) = any(r.secret_hashes)) then
    return json_build_object('status', case when r.pin_hash is null then 'taken' else 'taken_pin' end);
  elsif p_score > r.score then
    update public.copycat_scores set score = p_score, rounds = p_rounds, headshots = p_headshots,
      accuracy = p_accuracy, hs_rate = p_hs_rate, display_name = btrim(p_name), updated_at = now()
    where name_key = k;
    st := 'improved'; best := p_score;
  else
    st := 'kept'; best := r.score;
  end if;
  select count(*) + 1 into rnk from public.copycat_scores where score > best;
  return json_build_object('status', st, 'best', best, 'rank', rnk);
end $$;

create or replace function public.copycat_set_pin(p_name text, p_secret text, p_pin text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare r public.copycat_scores;
begin
  if p_pin !~ '^[0-9]{4}$' then return false; end if;
  select * into r from public.copycat_scores where name_key = lower(btrim(p_name));
  if not found or not (public.copycat_hash(p_secret) = any(r.secret_hashes)) then return false; end if;
  update public.copycat_scores set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')), pin_fails = 0
  where name_key = r.name_key;
  return true;
end $$;

-- Auf einem neuen Gerät mit PIN anmelden: 'ok' | 'wrong' | 'locked' | 'no_pin'
create or replace function public.copycat_claim(p_name text, p_pin text, p_new_secret text)
returns text language plpgsql security definer set search_path = '' as $$
declare r public.copycat_scores; fails integer;
begin
  if p_new_secret is null or length(p_new_secret) < 16 then return 'wrong'; end if;
  select * into r from public.copycat_scores where name_key = lower(btrim(p_name)) for update;
  if not found or r.pin_hash is null then return 'no_pin'; end if;
  if r.pin_locked_until is not null and r.pin_locked_until > now() then return 'locked'; end if;
  if extensions.crypt(coalesce(p_pin,''), r.pin_hash) = r.pin_hash then
    update public.copycat_scores
      set secret_hashes = (array_append(r.secret_hashes, public.copycat_hash(p_new_secret)))[greatest(1, cardinality(r.secret_hashes) - 3):],
          pin_fails = 0, pin_locked_until = null
    where name_key = r.name_key;
    return 'ok';
  end if;
  fails := r.pin_fails + 1;
  update public.copycat_scores
    set pin_fails = case when fails >= 5 then 0 else fails end,
        pin_locked_until = case when fails >= 5 then now() + interval '30 minutes' else null end
    where name_key = r.name_key;
  return 'wrong';
end $$;

revoke all on function public.copycat_valid_name(text), public.copycat_hash(text) from public, anon, authenticated;
revoke all on function public.copycat_top10(), public.copycat_check_name(text,text),
  public.copycat_submit(text,text,integer,integer,integer,real,real),
  public.copycat_set_pin(text,text,text), public.copycat_claim(text,text,text) from public;
grant execute on function public.copycat_top10(), public.copycat_check_name(text,text),
  public.copycat_submit(text,text,integer,integer,integer,real,real),
  public.copycat_set_pin(text,text,text), public.copycat_claim(text,text,text) to anon, authenticated;
