const Database = require('better-sqlite3');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'subscriber' CHECK (role IN ('subscriber','content_manager','admin')),
  active INTEGER NOT NULL DEFAULT 1,
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
  kind TEXT NOT NULL DEFAULT 'subscription' CHECK (kind IN ('subscription','upgrade','renewal','retry')),
  description TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS watchlist (
  user_id INTEGER NOT NULL REFERENCES users(id),
  title_id INTEGER NOT NULL REFERENCES titles(id),
  added_at TEXT NOT NULL,
  PRIMARY KEY (user_id, title_id)
);
CREATE TABLE IF NOT EXISTS watch_history (
  user_id INTEGER NOT NULL REFERENCES users(id),
  title_id INTEGER NOT NULL REFERENCES titles(id),
  position_seconds INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, title_id)
);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title_id INTEGER NOT NULL REFERENCES titles(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, title_id)
);
CREATE TABLE IF NOT EXISTS email_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  to_email TEXT NOT NULL,
  template TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title_id INTEGER NOT NULL REFERENCES titles(id),
  season INTEGER NOT NULL CHECK (season BETWEEN 1 AND 99),
  episode INTEGER NOT NULL CHECK (episode BETWEEN 1 AND 99),
  name TEXT NOT NULL,
  runtime INTEGER NOT NULL DEFAULT 45,
  synopsis TEXT NOT NULL DEFAULT '',
  UNIQUE (title_id, season, episode)
);
CREATE TABLE IF NOT EXISTS episode_progress (
  user_id INTEGER NOT NULL REFERENCES users(id),
  episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  position_seconds INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, episode_id)
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
  const paymentColumns = db.prepare('PRAGMA table_info(payments)').all();
  if (!paymentColumns.some((column) => column.name === 'kind')) {
    db.exec("ALTER TABLE payments ADD COLUMN kind TEXT NOT NULL DEFAULT 'subscription' CHECK (kind IN ('subscription','upgrade','renewal','retry'))");
  }
  const userColumns = db.prepare('PRAGMA table_info(users)').all();
  if (!userColumns.some((column) => column.name === 'active')) {
    db.exec('ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
  }
  const subscriptionColumns = db.prepare('PRAGMA table_info(subscriptions)').all();
  if (!subscriptionColumns.some((column) => column.name === 'reminder_sent_for')) {
    db.exec('ALTER TABLE subscriptions ADD COLUMN reminder_sent_for TEXT');
  }
  const historyColumns = db.prepare('PRAGMA table_info(watch_history)').all();
  if (!historyColumns.some((column) => column.name === 'last_episode_id')) {
    db.exec('ALTER TABLE watch_history ADD COLUMN last_episode_id INTEGER REFERENCES episodes(id) ON DELETE SET NULL');
  }
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
