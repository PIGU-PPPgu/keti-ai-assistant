/**
 * SQLite 数据库模块
 * 
 * 用户系统 + 历史记录
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据库文件路径
const dbPath = path.join(__dirname, 'data', 'keti.db');

// 初始化数据库
const db = new Database(dbPath);

// 启用外键约束
db.pragma('foreign_keys = ON');

// 创建表
db.exec(`
  -- 用户表
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- 历史记录表
  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subject TEXT NOT NULL,
    level TEXT NOT NULL,
    document_type TEXT NOT NULL,
    content TEXT NOT NULL,
    word_count INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- 创建索引
  CREATE INDEX IF NOT EXISTS idx_history_user_id ON history(user_id);
  CREATE INDEX IF NOT EXISTS idx_history_created_at ON history(created_at DESC);
`);

console.log('✅ 数据库初始化完成:', dbPath);

// ========== 用户操作 ==========

/**
 * 创建用户
 */
export function createUser(username, email, passwordHash) {
  const stmt = db.prepare(`
    INSERT INTO users (username, email, password_hash)
    VALUES (?, ?, ?)
  `);
  
  try {
    const result = stmt.run(username, email, passwordHash);
    return { success: true, userId: result.lastInsertRowid };
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      if (error.message.includes('username')) {
        return { success: false, error: '用户名已存在' };
      } else if (error.message.includes('email')) {
        return { success: false, error: '邮箱已被注册' };
      }
    }
    return { success: false, error: '注册失败' };
  }
}

/**
 * 通过用户名查找用户
 */
export function findUserByUsername(username) {
  const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
  return stmt.get(username);
}

/**
 * 通过邮箱查找用户
 */
export function findUserByEmail(email) {
  const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
  return stmt.get(email);
}

/**
 * 通过 ID 查找用户
 */
export function findUserById(id) {
  const stmt = db.prepare('SELECT id, username, email, created_at FROM users WHERE id = ?');
  return stmt.get(id);
}

// ========== 历史记录操作 ==========

/**
 * 创建历史记录
 */
export function createHistory(userId, subject, level, documentType, content, wordCount) {
  const stmt = db.prepare(`
    INSERT INTO history (user_id, subject, level, document_type, content, word_count)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  try {
    const result = stmt.run(userId, subject, level, documentType, content, wordCount);
    return { success: true, historyId: result.lastInsertRowid };
  } catch (error) {
    console.error('创建历史记录失败:', error);
    return { success: false, error: '保存失败' };
  }
}

/**
 * 获取用户历史记录列表
 */
export function getHistoryList(userId, limit = 50, offset = 0) {
  const stmt = db.prepare(`
    SELECT 
      id, 
      subject, 
      level, 
      document_type, 
      word_count, 
      created_at
    FROM history
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `);
  
  return stmt.all(userId, limit, offset);
}

/**
 * 获取单条历史记录详情
 */
export function getHistoryDetail(userId, historyId) {
  const stmt = db.prepare(`
    SELECT *
    FROM history
    WHERE id = ? AND user_id = ?
  `);
  
  return stmt.get(historyId, userId);
}

/**
 * 删除历史记录
 */
export function deleteHistory(userId, historyId) {
  const stmt = db.prepare('DELETE FROM history WHERE id = ? AND user_id = ?');
  
  try {
    const result = stmt.run(historyId, userId);
    return { success: result.changes > 0 };
  } catch (error) {
    console.error('删除历史记录失败:', error);
    return { success: false, error: '删除失败' };
  }
}

/**
 * 获取用户历史记录总数
 */
export function getHistoryCount(userId) {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM history WHERE user_id = ?');
  return stmt.get(userId).count;
}

// 导出数据库实例（用于事务等高级操作）
export { db };
