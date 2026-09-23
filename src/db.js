const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT, cnpj TEXT, city TEXT, uf TEXT, sector TEXT, size TEXT, track TEXT,
  stage TEXT NOT NULL DEFAULT 'a_contatar',
  source TEXT, notes TEXT,
  next_date TEXT, next_action TEXT,
  close_reason TEXT, close_note TEXT, closed_at TEXT, reactivate_on TEXT,
  do_not_contact INTEGER NOT NULL DEFAULT 0,
  reactivated INTEGER NOT NULL DEFAULT 0,
  rc_hours TEXT NOT NULL DEFAULT '',
  rc_asked_name INTEGER NOT NULL DEFAULT 0,
  rc_asked_it INTEGER NOT NULL DEFAULT 0,
  rc_extension INTEGER NOT NULL DEFAULT 0,
  rc_whatsapp INTEGER NOT NULL DEFAULT 0,
  rc_linkedin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS accounts_next ON accounts(next_date);
CREATE INDEX IF NOT EXISTS accounts_domain ON accounts(domain);
CREATE INDEX IF NOT EXISTS accounts_cnpj ON accounts(cnpj);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT, role TEXT, phone TEXT, email TEXT, channel TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS contacts_account ON contacts(account_id);

CREATE TABLE IF NOT EXISTS findings (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  source TEXT, found_on TEXT, credentials INTEGER, severity TEXT,
  published INTEGER NOT NULL DEFAULT 0, note TEXT
);
CREATE INDEX IF NOT EXISTS findings_account ON findings(account_id);

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  at TEXT NOT NULL, channel TEXT, result TEXT, note TEXT, objection TEXT
);
CREATE INDEX IF NOT EXISTS activities_account ON activities(account_id, at);
CREATE INDEX IF NOT EXISTS activities_at ON activities(at);

-- Eventos do sistema: mudança de estágio, encerramento, reativação, no-show.
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  at TEXT NOT NULL, type TEXT NOT NULL,
  from_stage TEXT, to_stage TEXT, data TEXT
);
CREATE INDEX IF NOT EXISTS events_account ON events(account_id, at);
CREATE INDEX IF NOT EXISTS events_type ON events(type, at);
`;

function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

module.exports = { openDb };
