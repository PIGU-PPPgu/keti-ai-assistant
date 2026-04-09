/**
 * 数据库迁移 v2 - 新增流水线相关表
 */

import { getDb } from './index.mjs';

export function migrateV2() {
  const db = getDb();

  db.exec(`
    -- 阶段检查点
    CREATE TABLE IF NOT EXISTS stage_checkpoints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      status TEXT NOT NULL,
      output_data TEXT NOT NULL DEFAULT '{}',
      quality_score REAL NOT NULL DEFAULT 0,
      retry_count INTEGER NOT NULL DEFAULT 0,
      model_used TEXT NOT NULL DEFAULT '',
      created_at INTEGER DEFAULT (unixepoch()),
      UNIQUE(project_id, stage)
    );
    CREATE INDEX IF NOT EXISTS idx_checkpoints_project ON stage_checkpoints(project_id);

    -- 模型调用日志
    CREATE TABLE IF NOT EXISTS model_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT,
      stage TEXT,
      model TEXT NOT NULL,
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      latency_ms INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_model_calls_project ON model_calls(project_id);

    -- 人工介入记录
    CREATE TABLE IF NOT EXISTS human_interventions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      original_data TEXT,
      modified_data TEXT,
      reason TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_interventions_project ON human_interventions(project_id);
  `);

  console.log('✅ migrate_v2: stage_checkpoints, model_calls, human_interventions tables ready');
}
