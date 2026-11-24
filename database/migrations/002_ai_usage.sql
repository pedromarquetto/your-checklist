create table if not exists qc_ai_usage (
 id uuid primary key,
 user_id text not null references "user"(id) on delete cascade,
 feature text not null check (feature in ('research', 'assistant')),
 provider text not null,
 model text not null,
 query text,
 status text not null default 'pending'
   check (status in ('pending', 'completed', 'empty', 'failed')),
 input_tokens integer,
 cached_input_tokens integer,
 output_tokens integer,
 web_calls integer,
 estimated_cost_usd numeric(18, 9),
 created_at timestamptz not null default now()
);
create index if not exists qc_ai_usage_user_date
 on qc_ai_usage(user_id, created_at desc, id desc);
