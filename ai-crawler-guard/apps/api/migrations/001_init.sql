-- Accounts and the sites they own.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  email_lower   text GENERATED ALWAYS AS (lower(email)) STORED,
  password_hash text NOT NULL,
  name          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_key ON users (email_lower);

CREATE TABLE sites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  domain      text,
  -- Where licensing inquiries are emailed; falls back to the owner account.
  notify_email text,
  -- Only the hash is stored. The key itself is shown once, at creation.
  key_hash    text NOT NULL,
  key_prefix  text NOT NULL,
  policy      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  key_rotated_at timestamptz
);
CREATE UNIQUE INDEX sites_key_hash_key ON sites (key_hash);
CREATE INDEX sites_user_id_idx ON sites (user_id);

CREATE TABLE bot_events (
  id                  bigserial PRIMARY KEY,
  site_id             uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  ts                  timestamptz NOT NULL,
  bot_id              text NOT NULL,
  bot_name            text,
  operator            text,
  purpose             text,
  path                text NOT NULL,
  method              text,
  host                text,
  referrer            text,
  user_agent          text,
  -- Text, not inet: the middleware may send a salted hash instead of an
  -- address when the operator configures logIp: 'hash'.
  client_ip           text,
  verification        text NOT NULL,
  verification_method text,
  verification_reason text,
  action              text NOT NULL,
  rule_source         text,
  response_status     integer,
  received_at         timestamptz NOT NULL DEFAULT now(),
  -- The middleware retries a failed batch, so the same event can arrive
  -- twice. A content fingerprint makes ingest idempotent without asking the
  -- client to invent ids.
  fingerprint         text NOT NULL
);
CREATE UNIQUE INDEX bot_events_fingerprint_key ON bot_events (fingerprint);
CREATE INDEX bot_events_site_ts_idx  ON bot_events (site_id, ts DESC);
CREATE INDEX bot_events_site_bot_idx ON bot_events (site_id, bot_id, ts DESC);
CREATE INDEX bot_events_site_path_idx ON bot_events (site_id, path, ts DESC);

CREATE TABLE licensing_inquiries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id        uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name           text NOT NULL,
  email          text NOT NULL,
  organization   text,
  intended_use   text,
  message        text,
  crawler_id     text,
  requested_path text,
  client_ip      text,
  user_agent     text,
  status         text NOT NULL DEFAULT 'new',
  notes          text,
  notified_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT licensing_inquiries_status_check CHECK (status IN ('new', 'contacted', 'agreed', 'declined'))
);
CREATE INDEX licensing_inquiries_site_idx ON licensing_inquiries (site_id, created_at DESC);
