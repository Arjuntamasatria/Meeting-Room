'use strict';

// node:sqlite tersedia built-in mulai Node.js v22.5.0 (user: v22.20.0)
const { DatabaseSync } = require('node:sqlite');
const path             = require('path');

// Lokasi file DB bisa di-override lewat env DB_PATH — dipakai saat deploy agar
// menunjuk ke volume persisten (mis. DB_PATH=/data/webrtc_app.db), supaya data
// tidak hilang tiap re-deploy. Tanpa env, default ke folder project (lokal).
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'webrtc_app.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS meetings (
    id           TEXT    PRIMARY KEY,
    title        TEXT    NOT NULL,
    host_name    TEXT    NOT NULL,
    scheduled_at TEXT    NOT NULL,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    link         TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id   TEXT    NOT NULL,
    peer_id   TEXT    NOT NULL,
    joined_at TEXT    NOT NULL DEFAULT (datetime('now')),
    left_at   TEXT
  );

  CREATE TABLE IF NOT EXISTS network_stats (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id      TEXT    NOT NULL,
    peer_id      TEXT    NOT NULL,
    timestamp    TEXT    NOT NULL DEFAULT (datetime('now')),
    rtt_ms       REAL,
    jitter_ms    REAL,
    packet_loss  REAL,
    bitrate_kbps REAL,
    fps          REAL,
    resolution   TEXT
  );

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,            -- format "salt:hash" (scrypt)
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS auth_tokens (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT
  );
`);

// Tambah kolom baru untuk migrasi database lama.
// ALTER akan error bila kolom sudah ada — abaikan saja agar idempotent.
// (user_id: menandai pemilik meeting; expires_at: masa berlaku token login.)
for (const ddl of [
  `ALTER TABLE meetings ADD COLUMN user_id INTEGER`,
  `ALTER TABLE auth_tokens ADD COLUMN expires_at TEXT`
]) {
  try { db.exec(ddl); } catch (e) { /* kolom sudah ada — lewati */ }
}

module.exports = db;
