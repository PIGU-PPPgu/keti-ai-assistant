/**
 * 数据库层 - SQLite
 * 统一的数据库初始化和操作
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { cfg } from '../config.mjs';

let db;

export function getDb() {
  if (!db) {
    mkdirSync(dirname(cfg.db.path), { recursive: true });
    db = new Database(cfg.db.path);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      state TEXT NOT NULL DEFAULT 'idle',
      doc_type TEXT,
      data TEXT NOT NULL DEFAULT '{}',
      field_index INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      session_id TEXT,
      doc_type TEXT NOT NULL,
      title TEXT,
      content TEXT NOT NULL,
      params TEXT,
      word_count INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id);

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      title TEXT NOT NULL,
      level TEXT, subject TEXT, grade TEXT, direction TEXT,
      params TEXT DEFAULT "{}",
      status TEXT DEFAULT "active",
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
  `);
}

// ---- Users ----

export function createUser(username, email, passwordHash) {
  try {
    const stmt = getDb().prepare(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
    );
    const result = stmt.run(username, email, passwordHash);
    return { success: true, userId: result.lastInsertRowid };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export function findUserByUsername(username) {
  return getDb().prepare('SELECT * FROM users WHERE username = ?').get(username);
}

export function findUserByEmail(email) {
  return getDb().prepare('SELECT * FROM users WHERE email = ?').get(email);
}

export function findUserById(id) {
  return getDb().prepare('SELECT id, username, email, created_at FROM users WHERE id = ?').get(id);
}

// ---- Sessions ----

export function upsertSession(id, data) {
  const stmt = getDb().prepare(`
    INSERT INTO sessions (id, user_id, state, doc_type, data, field_index)
    VALUES (@id, @userId, @state, @docType, @data, @fieldIndex)
    ON CONFLICT(id) DO UPDATE SET
      state = excluded.state,
      doc_type = excluded.doc_type,
      data = excluded.data,
      field_index = excluded.field_index,
      updated_at = unixepoch()
  `);
  stmt.run({
    id,
    userId: data.userId ?? null,
    state: data.state,
    docType: data.docType ?? null,
    data: JSON.stringify(data.collectedData ?? {}),
    fieldIndex: data.fieldIndex ?? 0,
  });
}

export function loadSession(id) {
  const row = getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    state: row.state,
    docType: row.doc_type,
    collectedData: JSON.parse(row.data),
    fieldIndex: row.field_index,
  };
}

export function deleteSession(id) {
  getDb().prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

// ---- History ----

export function saveHistory(userId, sessionId, docType, title, content, params) {
  const stmt = getDb().prepare(`
    INSERT INTO history (user_id, session_id, doc_type, title, content, params, word_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    userId, sessionId, docType, title, content,
    JSON.stringify(params), content.length
  );
  return result.lastInsertRowid;
}

export function getHistory(userId, limit = 20) {
  return getDb().prepare(`
    SELECT id, doc_type, title, word_count, created_at
    FROM history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
  `).all(userId, limit);
}

export function getHistoryItem(id, userId) {
  return getDb().prepare(
    'SELECT * FROM history WHERE id = ? AND user_id = ?'
  ).get(id, userId);
}

// ---- Projects ----

export function createProject(userId, title, params = {}) {
  const { level, subject, grade, direction } = params;
  const stmt = getDb().prepare(`INSERT INTO projects (user_id, title, level, subject, grade, direction, params) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const result = stmt.run(userId, title, level ?? null, subject ?? null, grade ?? null, direction ?? null, JSON.stringify(params));
  return result.lastInsertRowid;
}

export function getProjectsByUser(userId) {
  return getDb().prepare(`SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC`).all(userId);
}

export function getProject(projectId, userId) {
  return getDb().prepare(`SELECT * FROM projects WHERE id = ? AND user_id = ?`).get(projectId, userId);
}

export function updateProjectStatus(projectId, status) {
  getDb().prepare(`UPDATE projects SET status = ?, updated_at = unixepoch() WHERE id = ?`).run(status, projectId);
}
