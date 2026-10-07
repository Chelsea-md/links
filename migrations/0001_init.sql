-- See Links schema

-- One row per short link. A link can also carry a QR code, which gets its own slug
-- so scans and clicks are counted separately (channel = 'qr' vs 'link').
CREATE TABLE links (
  id           TEXT PRIMARY KEY,
  domain       TEXT NOT NULL,
  slug         TEXT NOT NULL,
  destination  TEXT NOT NULL,
  title        TEXT,
  tags         TEXT NOT NULL DEFAULT '[]',   -- JSON string[]
  utm          TEXT,                          -- JSON {source,medium,campaign,term,content}
  rules        TEXT NOT NULL DEFAULT '[]',    -- JSON [{type:'device'|'country', value, destination}]
  expires_at   INTEGER,                       -- epoch ms
  expired_url  TEXT,
  show_link    INTEGER NOT NULL DEFAULT 1,    -- 0 = QR-only (hidden from Links list)
  qr_slug      TEXT,                          -- NULL = no QR code
  qr_design    TEXT,                          -- JSON design options
  archived     INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

-- Slug namespace per domain (both link slugs and QR slugs live here).
CREATE TABLE slugs (
  domain   TEXT NOT NULL,
  slug     TEXT NOT NULL,
  link_id  TEXT NOT NULL,
  channel  TEXT NOT NULL,                     -- 'link' | 'qr'
  PRIMARY KEY (domain, slug)
);
CREATE INDEX idx_slugs_link ON slugs(link_id);

-- One row per click / scan.
CREATE TABLE events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id   TEXT NOT NULL,
  channel   TEXT NOT NULL,                    -- 'link' | 'qr'
  ts        INTEGER NOT NULL,                 -- epoch ms
  day       TEXT NOT NULL,                    -- YYYY-MM-DD in configured TZ
  country   TEXT,
  region    TEXT,
  city      TEXT,
  referrer  TEXT NOT NULL DEFAULT 'direct',   -- referring host or 'direct'
  device    TEXT,                             -- mobile | tablet | desktop
  os        TEXT,
  browser   TEXT,
  ai        TEXT,                             -- AI assistant/crawler name, if any
  bot       INTEGER NOT NULL DEFAULT 0,       -- 1 = automated (excluded from engagement counts)
  visitor   TEXT                              -- daily-rotating anonymous hash (no IPs stored)
);
CREATE INDEX idx_events_link_day ON events(link_id, day);
CREATE INDEX idx_events_day ON events(day);
