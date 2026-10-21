const Database = require('better-sqlite3');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'subscriber' CHECK (role IN ('subscriber','content_manager','admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS titles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('movie','show')),
  genre TEXT NOT NULL,
  year INTEGER NOT NULL,
  rating REAL NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 10),
  runtime INTEGER,
  synopsis TEXT NOT NULL DEFAULT '',
  cast_list TEXT NOT NULL DEFAULT '',
  poster_url TEXT,
  trailer_url TEXT,
  tier TEXT NOT NULL DEFAULT 'basic' CHECK (tier IN ('basic','standard','premium')),
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS plans (
  code TEXT PRIMARY KEY CHECK (code IN ('basic','standard','premium')),
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  quality TEXT NOT NULL,
  screens INTEGER NOT NULL,
  rank INTEGER NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  plan_code TEXT NOT NULL REFERENCES plans(code),
  status TEXT NOT NULL CHECK (status IN ('active','cancelled','expired','past_due')),
  pending_plan_code TEXT REFERENCES plans(code),
  card_last4 TEXT NOT NULL,
  started_at TEXT NOT NULL,
  period_end TEXT NOT NULL,
  cancelled_at TEXT
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  subscription_id INTEGER REFERENCES subscriptions(id),
  plan_code TEXT NOT NULL REFERENCES plans(code),
  amount_cents INTEGER NOT NULL,
  card_last4 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('succeeded','declined')),
  description TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_titles_genre ON titles(genre);
CREATE INDEX IF NOT EXISTS idx_titles_year ON titles(year);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_current_sub
  ON subscriptions(user_id) WHERE status IN ('active','cancelled','past_due');
`;

function createDb(file = process.env.DB_FILE || 'streamhub.db') {
  const db = new Database(file);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  const addPlan = db.prepare(`INSERT OR IGNORE INTO plans
    (code, name, price_cents, quality, screens, rank) VALUES (?, ?, ?, ?, ?, ?)`);
  const seedPlans = db.transaction(() => {
    addPlan.run('basic', 'Basic', 899, '720p HD', 1, 1);
    addPlan.run('standard', 'Standard', 1399, '1080p Full HD', 2, 2);
    addPlan.run('premium', 'Premium', 1899, '4K Ultra HD', 4, 3);
  });
  seedPlans();
  return db;
}

module.exports = { createDb };
