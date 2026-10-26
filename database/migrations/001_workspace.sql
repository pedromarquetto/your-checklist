-- Runtime V1 storage. The earlier schema.sql remains a design reference only.
create table if not exists qc_workspaces (
 user_id text primary key references "user"(id) on delete cascade,
 data jsonb not null,
 revision integer not null default 0,
 updated_at timestamptz not null default now()
);
create table if not exists qc_galleries (
 user_id text not null references "user"(id) on delete cascade,
 project_id text not null,
 category_key text not null,
 record jsonb not null,
 primary key(user_id,project_id,category_key)
);
create table if not exists qc_media (
 id uuid primary key,
 user_id text not null references "user"(id) on delete cascade,
 sha256 text not null,
 bytes bytea not null,
 created_at timestamptz not null default now(),
 unique(user_id,sha256)
);
create table if not exists qc_usage (
 user_id text not null references "user"(id) on delete cascade,
 feature text not null,
 day date not null default current_date,
 count integer not null default 1,
 primary key(user_id,feature,day)
);
create index if not exists qc_media_user on qc_media(user_id);
create table if not exists qc_searches (
 id uuid primary key,
 user_id text not null references "user"(id) on delete cascade,
 item_id text not null,
 records jsonb not null,
 created_at timestamptz not null default now()
);
create index if not exists qc_searches_user on qc_searches(user_id,item_id);
