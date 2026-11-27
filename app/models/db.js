const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'reconecta.db'));
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

function initialize() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('establishment','organization','admin')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS institutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
      name TEXT NOT NULL,
      city TEXT NOT NULL,
      neighborhood TEXT NOT NULL,
      address TEXT NOT NULL,
      phone TEXT NOT NULL,
      responsible TEXT NOT NULL,
      accepted_types TEXT,
      capacity TEXT,
      transport TEXT,
      storage TEXT,
      receiving_hours TEXT
    );
    CREATE TABLE IF NOT EXISTS offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      establishment_id INTEGER NOT NULL REFERENCES institutions(id),
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      quantity REAL NOT NULL CHECK(quantity > 0),
      unit TEXT NOT NULL,
      conservation TEXT NOT NULL,
      expiration_info TEXT,
      deadline TEXT NOT NULL,
      city TEXT NOT NULL,
      neighborhood TEXT NOT NULL,
      pickup_instructions TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Disponível',
      published_at TEXT NOT NULL,
      eligible INTEGER NOT NULL DEFAULT 0,
      eligibility_reason TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      offer_id INTEGER NOT NULL REFERENCES offers(id),
      organization_id INTEGER NOT NULL REFERENCES institutions(id),
      status TEXT NOT NULL DEFAULT 'Pendente',
      reason TEXT,
      created_at TEXT NOT NULL,
      establishment_confirmed_at TEXT,
      organization_confirmed_at TEXT,
      actual_pickup_at TEXT,
      delivered_quantity REAL,
      within_deadline INTEGER
    );
    CREATE TABLE IF NOT EXISTS status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      from_status TEXT,
      to_status TEXT NOT NULL,
      actor_user_id INTEGER REFERENCES users(id),
      reason TEXT,
      created_at TEXT NOT NULL
    );
  `);
}

initialize();
module.exports = db;
