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
CREATE INDEX IF NOT EXISTS idx_titles_genre ON titles(genre);
CREATE INDEX IF NOT EXISTS idx_titles_year ON titles(year);
`;

function createDb(file = process.env.DB_FILE || 'streamhub.db') {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  return db;
}

module.exports = { createDb };
