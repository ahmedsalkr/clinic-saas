create extension if not exists pgcrypto;

create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  phone text not null default '',
  address text not null default '',
  logo_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  clinic_id uuid references public.clinics (id) on delete cascade,
  email text not null,
  username text,
  full_name text not null default '',
  role text not null default 'employee'
    check (role in ('admin', 'employee')),
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists clinic_id uuid references public.clinics (id) on delete cascade,
  add column if not exists username text;

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null unique references public.clinics (id) on delete cascade,
  plan_type text not null check (plan_type in ('monthly', 'yearly')),
  status text not null default 'pending',
  seat_count integer not null default 1 check (seat_count between 1 and 101),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.registration_attempts (
  ip_hash text not null,
  attempted_at timestamptz not null default now()
);
create index if not exists registration_attempts_ip_time_idx
  on public.registration_attempts (ip_hash, attempted_at desc);

create table if not exists public.clinic_records (
  clinic_id uuid references public.clinics (id) on delete cascade,
  collection text not null
    check (collection in ('patients', 'doctors', 'expenses')),
  record_id text not null,
  payload jsonb,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  updated_by uuid references auth.users (id),
  primary key (collection, record_id),
  check (
    (deleted_at is null and payload is not null)
    or (deleted_at is not null and payload is null)
  )
);

alter table public.clinic_records
  add column if not exists clinic_id uuid references public.clinics (id) on delete cascade;

do $$
declare
  legacy_clinic_id uuid;
begin
  if exists (select 1 from public.profiles where clinic_id is null)
    or exists (select 1 from public.clinic_records where clinic_id is null)
  then
    insert into public.clinics (code, name)
    values ('LEGACY-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)), 'المركز الحالي')
    returning id into legacy_clinic_id;

    update public.profiles set clinic_id = legacy_clinic_id where clinic_id is null;
    update public.clinic_records set clinic_id = legacy_clinic_id where clinic_id is null;

    insert into public.subscriptions (clinic_id, plan_type, status, seat_count)
    values (legacy_clinic_id, 'monthly', 'pending', 1)
    on conflict (clinic_id) do nothing;
  end if;
end;
$$;

alter table public.clinic_records alter column clinic_id set not null;

update public.profiles
set username = 'user-' || substr(replace(id::text, '-', ''), 1, 12)
where username is null or btrim(username) = '';

alter table public.profiles alter column username set not null;

create unique index if not exists profiles_clinic_username_unique
  on public.profiles (clinic_id, lower(username));
create index if not exists profiles_clinic_id_idx
  on public.profiles (clinic_id);
create index if not exists clinic_records_clinic_collection_idx
  on public.clinic_records (clinic_id, collection);

alter table public.clinic_records drop constraint if exists clinic_records_pkey;
alter table public.clinic_records
  add constraint clinic_records_pkey primary key (clinic_id, collection, record_id);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, username, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'username', 'user-' || substr(replace(new.id::text, '-', ''), 1, 12)),
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do update
  set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

create or replace function public.current_user_clinic_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select clinic_id
  from public.profiles
  where id = auth.uid()
    and is_active = true
  limit 1;
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid()
    and is_active = true
  limit 1;
$$;

create or replace function public.current_user_can_use_clinic()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.subscriptions s on s.clinic_id = p.clinic_id
    where p.id = auth.uid()
      and p.is_active = true
      and s.status in ('active', 'trialing')
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;

create or replace function public.get_workspace_context()
returns table (
  clinic_id uuid,
  clinic_code text,
  clinic_name text,
  clinic_phone text,
  clinic_address text,
  clinic_logo_url text,
  subscription_status text,
  plan_type text,
  seat_count integer,
  subscription_period_end timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.code, c.name, c.phone, c.address, c.logo_url,
         case
           when s.current_period_end is not null
             and s.current_period_end <= now()
             and s.status in ('active', 'trialing')
           then 'expired'
           else s.status
         end,
         s.plan_type, s.seat_count, s.current_period_end
  from public.profiles p
  join public.clinics c on c.id = p.clinic_id
  join public.subscriptions s on s.clinic_id = c.id
  where p.id = auth.uid()
    and p.is_active = true
  limit 1;
$$;

revoke all on function public.current_user_clinic_id() from public, anon;
revoke all on function public.current_user_role() from public, anon;
revoke all on function public.current_user_can_use_clinic() from public, anon;
revoke all on function public.get_workspace_context() from public, anon;
grant execute on function public.current_user_clinic_id() to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.current_user_can_use_clinic() to authenticated;
grant execute on function public.get_workspace_context() to authenticated;

alter table public.clinics enable row level security;
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.clinic_records enable row level security;

drop policy if exists "Users can read permitted profiles" on public.profiles;
drop policy if exists "Admins can update profiles" on public.profiles;
drop policy if exists "Clinic members can read profiles" on public.profiles;
create policy "Clinic members can read profiles"
  on public.profiles for select to authenticated
  using (id = auth.uid());

drop policy if exists "Clinic members can read clinic" on public.clinics;
create policy "Clinic members can read clinic"
  on public.clinics for select to authenticated
  using (id = public.current_user_clinic_id());

drop policy if exists "Clinic admins can update clinic" on public.clinics;
create policy "Clinic admins can update clinic"
  on public.clinics for update to authenticated
  using (id = public.current_user_clinic_id() and public.current_user_role() = 'admin')
  with check (id = public.current_user_clinic_id() and public.current_user_role() = 'admin');

drop policy if exists "Clinic members can read subscription" on public.subscriptions;
create policy "Clinic members can read subscription"
  on public.subscriptions for select to authenticated
  using (
    clinic_id = public.current_user_clinic_id()
    and public.current_user_role() = 'admin'
  );

drop policy if exists "Active clinic users can read records" on public.clinic_records;
drop policy if exists "Active clinic users can insert records" on public.clinic_records;
drop policy if exists "Active clinic users can update records" on public.clinic_records;
drop policy if exists "Subscribed clinic members can read records" on public.clinic_records;
create policy "Subscribed clinic members can read records"
  on public.clinic_records for select to authenticated
  using (
    clinic_id = public.current_user_clinic_id()
    and public.current_user_can_use_clinic()
  );

drop policy if exists "Subscribed clinic members can insert records" on public.clinic_records;
create policy "Subscribed clinic members can insert records"
  on public.clinic_records for insert to authenticated
  with check (
    clinic_id = public.current_user_clinic_id()
    and public.current_user_can_use_clinic()
  );

drop policy if exists "Subscribed clinic members can update records" on public.clinic_records;
create policy "Subscribed clinic members can update records"
  on public.clinic_records for update to authenticated
  using (
    clinic_id = public.current_user_clinic_id()
    and public.current_user_can_use_clinic()
  )
  with check (
    clinic_id = public.current_user_clinic_id()
    and public.current_user_can_use_clinic()
  );

revoke all on public.profiles, public.clinics, public.subscriptions,
  public.clinic_records from anon, authenticated;
grant select on public.profiles, public.clinics, public.subscriptions to authenticated;
grant select on public.clinic_records to authenticated;

create or replace function public.sync_clinic_records(p_records jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_clinic_id uuid := public.current_user_clinic_id();
begin
  if caller_clinic_id is null or not public.current_user_can_use_clinic() then
    raise exception 'An active clinic subscription is required.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_records) as incoming_check (
      updated_at timestamptz
    )
    where incoming_check.updated_at > now() + interval '5 minutes'
  ) then
    raise exception 'A record update time cannot be in the future.';
  end if;

  insert into public.clinic_records as current_record (
    clinic_id,
    collection,
    record_id,
    payload,
    updated_at,
    deleted_at,
    updated_by
  )
  select
    caller_clinic_id,
    incoming.collection,
    incoming.record_id,
    incoming.payload,
    incoming.updated_at,
    incoming.deleted_at,
    auth.uid()
  from jsonb_to_recordset(p_records) as incoming (
    collection text,
    record_id text,
    payload jsonb,
    updated_at timestamptz,
    deleted_at timestamptz
  )
  where incoming.collection in ('patients', 'doctors', 'expenses')
    and incoming.record_id is not null
  on conflict (clinic_id, collection, record_id) do update
  set
    payload = excluded.payload,
    updated_at = excluded.updated_at,
    deleted_at = excluded.deleted_at,
    updated_by = auth.uid()
  where current_record.updated_at < excluded.updated_at;
end;
$$;

revoke all on function public.sync_clinic_records(jsonb) from public, anon;
grant execute on function public.sync_clinic_records(jsonb) to authenticated;

create or replace function public.create_clinic_workspace(
  p_owner_id uuid,
  p_code text,
  p_name text,
  p_phone text,
  p_address text,
  p_username text,
  p_plan_type text,
  p_seat_count integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_clinic_id uuid;
begin
  if p_plan_type not in ('monthly', 'yearly')
    or p_seat_count < 1
    or p_seat_count > 101
  then
    raise exception 'Invalid subscription plan or seat count.';
  end if;

  insert into public.clinics (code, name, phone, address)
  values (p_code, p_name, p_phone, p_address)
  returning id into new_clinic_id;

  update public.profiles
  set clinic_id = new_clinic_id,
      username = lower(p_username),
      role = 'admin',
      is_active = true
  where id = p_owner_id;

  if not found then
    raise exception 'The owner profile could not be found.';
  end if;

  insert into public.subscriptions (clinic_id, plan_type, status, seat_count)
  values (new_clinic_id, p_plan_type, 'pending', p_seat_count);

  return new_clinic_id;
end;
$$;

revoke all on function public.create_clinic_workspace(uuid, text, text, text, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.create_clinic_workspace(uuid, text, text, text, text, text, text, integer)
  to service_role;

create or replace function public.claim_registration_slot(p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_attempts integer;
begin
  if p_ip_hash is null or length(p_ip_hash) < 32 then
    raise exception 'Invalid registration request.';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_ip_hash));

  delete from public.registration_attempts
  where attempted_at < now() - interval '1 hour';

  select count(*) into recent_attempts
  from public.registration_attempts
  where ip_hash = p_ip_hash
    and attempted_at >= now() - interval '1 hour';

  if recent_attempts >= 3 then
    return false;
  end if;

  insert into public.registration_attempts (ip_hash) values (p_ip_hash);
  return true;
end;
$$;

alter table public.registration_attempts enable row level security;
revoke all on public.registration_attempts from public, anon, authenticated;
revoke all on function public.claim_registration_slot(text)
  from public, anon, authenticated;
grant execute on function public.claim_registration_slot(text) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clinic-logos', 'clinic-logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
