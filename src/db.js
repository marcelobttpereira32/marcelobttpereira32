const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS pipelines (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  position REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stages (
  id INTEGER PRIMARY KEY,
  pipeline_id INTEGER NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#DDE1E7',
  position REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS stages_pipeline ON stages(pipeline_id, position);

CREATE TABLE IF NOT EXISTS origins (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#DDE1E7',
  position REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY,
  pipeline_id INTEGER NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  stage_id INTEGER NOT NULL REFERENCES stages(id),
  position REAL NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  company TEXT, contact_name TEXT, role TEXT, phone TEXT, email TEXT,
  domain TEXT, cnpj TEXT, city TEXT, uf TEXT,
  value REAL,
  origin_id INTEGER REFERENCES origins(id) ON DELETE SET NULL,
  notes TEXT,
  task_date TEXT, task_title TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, stage_changed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS leads_board ON leads(pipeline_id, stage_id, position);
CREATE INDEX IF NOT EXISTS leads_task ON leads(task_date);

CREATE TABLE IF NOT EXISTS lead_activities (
  id INTEGER PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  at TEXT NOT NULL,
  type TEXT NOT NULL,
  note TEXT
);
CREATE INDEX IF NOT EXISTS lead_activities_lead ON lead_activities(lead_id, at);
`;

function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

module.exports = { openDb };
