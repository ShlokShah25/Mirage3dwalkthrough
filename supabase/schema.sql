-- Mirage database schema. Run once in Supabase: SQL Editor → New query → paste → Run.
-- All writes happen from the server with the service-role key; signed-in users can only READ their own rows.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  persona text check (persona in ('own', 'pro')),
  created_at timestamptz not null default now()
);

-- One row per home (project). id is generated in the browser.
create table if not exists public.homes (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  plan_hash text,                       -- sha-256 of the floor plan image last read
  locked_hash text,                     -- plan the home is locked to once designed
  access text not null default 'none' check (access in ('none', 'pass', 'pro')),
  pass_id uuid,
  teaser_used boolean not null default false,
  designed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists homes_user on public.homes(user_id);

-- Home Pass: one-time purchase tied to one home / one floor plan.
create table if not exists public.passes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id text not null references public.homes(id) on delete cascade,
  razorpay_order_id text unique,
  razorpay_payment_id text,
  amount integer not null,
  designs_left integer not null,        -- first design + restyles
  changes_left integer not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists passes_user on public.passes(user_id);

-- One subscription per user (Pro or Pro Max).
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null check (plan in ('pro', 'max')),
  status text not null,                 -- created | authenticated | active | pending | halted | cancelled | completed
  razorpay_subscription_id text unique,
  current_start timestamptz,
  current_end timestamptz,
  homes_used integer not null default 0,
  changes_used integer not null default 0,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Razorpay orders we created (Home Pass, change top-ups).
create table if not exists public.orders (
  id text primary key,                  -- razorpay order id
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('pass', 'topup')),
  home_id text,
  amount integer not null,
  status text not null default 'created', -- created | paid
  payment_id text,
  created_at timestamptz not null default now()
);

-- A design run: a budget of AI calls, refunded if nothing was placed.
create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id text not null,
  source text not null,                 -- pass | pro_new | pro_restyle
  first boolean not null default false, -- first design of this home (unlock plan on refund)
  calls_left integer not null,
  items integer not null default 0,
  status text not null default 'running', -- running | done | refunded
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- A change request; may be followed by a few "redo this room" calls.
create table if not exists public.edits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id text not null,
  source text not null,                 -- pass | pro
  followups_left integer not null default 0,
  refunded boolean not null default false,
  created_at timestamptz not null default now()
);

-- Every Claude call, for limits and cost tracking.
create table if not exists public.usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id text,
  kind text not null,
  model text,
  in_tokens integer,
  out_tokens integer,
  created_at timestamptz not null default now()
);
create index if not exists usage_user_kind_time on public.usage(user_id, kind, created_at);

-- Collaborators: people a home is shared with, by email. Roles: viewer < commenter < editor (the owner is homes.user_id).
alter table public.homes add column if not exists owner_email text;
create table if not exists public.home_members (
  id uuid primary key default gen_random_uuid(),
  home_id text not null references public.homes(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  email text not null,                  -- lower-cased; matched to the account when they sign in
  user_id uuid references auth.users(id) on delete set null,
  role text not null check (role in ('viewer', 'commenter', 'editor')),
  invited_by uuid,
  created_at timestamptz not null default now(),
  unique (home_id, email)
);
create index if not exists home_members_email on public.home_members(email);
create index if not exists home_members_owner on public.home_members(owner_id);

-- The shared copy of a home's design (homes otherwise live in the owner's browser). version guards against overwrites.
create table if not exists public.home_data (
  home_id text primary key references public.homes(id) on delete cascade,
  name text,
  data jsonb not null,
  version integer not null default 1,
  updated_by text,
  updated_at timestamptz not null default now()
);

-- Comments pinned to a spot in the 3D home.
create table if not exists public.home_comments (
  id uuid primary key default gen_random_uuid(),
  home_id text not null references public.homes(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  author_email text,
  room text,
  x real, y real, z real,
  text text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists home_comments_home on public.home_comments(home_id, created_at);

-- Row-level security: read own rows only; no client writes.
alter table public.profiles enable row level security;
alter table public.homes enable row level security;
alter table public.passes enable row level security;
alter table public.subscriptions enable row level security;
alter table public.orders enable row level security;
alter table public.generations enable row level security;
alter table public.edits enable row level security;
alter table public.usage enable row level security;
alter table public.home_members enable row level security;
alter table public.home_data enable row level security;
alter table public.home_comments enable row level security;

do $$ begin
  create policy "own profile" on public.profiles for select using (auth.uid() = id);
  create policy "own homes" on public.homes for select using (auth.uid() = user_id);
  create policy "own passes" on public.passes for select using (auth.uid() = user_id);
  create policy "own subscription" on public.subscriptions for select using (auth.uid() = user_id);
  create policy "own orders" on public.orders for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
