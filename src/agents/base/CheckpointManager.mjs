/**
 * CheckpointManager - 阶段检查点管理
 * 用 SQLite 持久化每个阶段的输入/输出，支持断点续跑
 */

import { getDb } from '../../db/index.mjs';
import { StageStatus } from './BaseAgent.mjs';

export class CheckpointManager {
  constructor() {
    this._initTable();
  }

  _initTable() {
    getDb().exec(`
      CREATE TABLE IF NOT EXISTS stage_checkpoints (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id   TEXT    NOT NULL,
        stage        TEXT    NOT NULL,
        status       TEXT    NOT NULL DEFAULT 'SUCCESS',
        output_data  TEXT    NOT NULL DEFAULT '{}',
        quality_score REAL,
        retry_count  INTEGER NOT NULL DEFAULT 0,
        model_used   TEXT,
        created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
        UNIQUE(project_id, stage)
      );

      CREATE TABLE IF NOT EXISTS model_calls (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id      TEXT    NOT NULL,
        stage           TEXT    NOT NULL,
        model           TEXT    NOT NULL,
        prompt_tokens   INTEGER,
        completion_tokens INTEGER,
        latency_ms      INTEGER,
        created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS human_interventions (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id    TEXT    NOT NULL,
        stage         TEXT    NOT NULL,
        original_data TEXT,
        modified_data TEXT,
        reason        TEXT,
        created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  /**
   * 保存检查点（upsert）
   */
  save(projectId, stage, output) {
    const db = getDb();
    const data = typeof output.data === 'string' ? output.data : JSON.stringify(output.data);
    const score = output.qualityScore?.value ?? null;

    db.prepare(`
      INSERT INTO stage_checkpoints (project_id, stage, status, output_data, quality_score, retry_count, model_used, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(project_id, stage) DO UPDATE SET
        status = excluded.status,
        output_data = excluded.output_data,
        quality_score = excluded.quality_score,
        retry_count = excluded.retry_count,
        model_used = excluded.model_used,
        updated_at = datetime('now')
    `).run(projectId, stage, output.status || StageStatus.SUCCESS, data, score, output.retryCount || 0, output.modelUsed || null);
  }

  /**
   * 加载指定项目的所有检查点
   * @returns {Object} { STAGE_NAME: { status, data, qualityScore, ... } }
   */
  load(projectId) {
    const rows = getDb().prepare(
      `SELECT stage, status, output_data, quality_score, retry_count, model_used, updated_at
       FROM stage_checkpoints WHERE project_id = ? ORDER BY id`
    ).all(projectId);

    const result = {};
    for (const row of rows) {
      result[row.stage] = {
        stage: row.stage,
        status: row.status,
        data: JSON.parse(row.output_data || '{}'),
        qualityScore: row.quality_score,
        retryCount: row.retry_count,
        modelUsed: row.model_used,
        updatedAt: row.updated_at,
      };
    }
    return result;
  }

  /**
   * 加载单个阶段
   */
  loadStage(projectId, stage) {
    const row = getDb().prepare(
      `SELECT * FROM stage_checkpoints WHERE project_id = ? AND stage = ?`
    ).get(projectId, stage);
    if (!row) return null;
    return {
      ...row,
      data: JSON.parse(row.output_data || '{}'),
    };
  }

  /**
   * 是否可以从某个阶段恢复
   */
  canResume(projectId, stage) {
    const row = getDb().prepare(
      `SELECT status FROM stage_checkpoints WHERE project_id = ? AND stage = ?`
    ).get(projectId, stage);
    return row?.status === StageStatus.SUCCESS || row?.status === StageStatus.PAUSED;
  }

  /**
   * 获取项目当前进度（最新完成的阶段）
   */
  getCurrentStage(projectId) {
    const rows = getDb().prepare(
      `SELECT stage, status FROM stage_checkpoints WHERE project_id = ? ORDER BY id`
    ).all(projectId);
    if (rows.length === 0) return null;
    // 返回最后一个成功的阶段
    const last = rows[rows.length - 1];
    return last.status === StageStatus.SUCCESS ? last.stage : null;
  }

  /**
   * 标记阶段为 OVERRIDDEN（人工修改后）
   */
  markOverridden(projectId, stage, originalData, modifiedData, reason) {
    const db = getDb();
    db.prepare(
      `UPDATE stage_checkpoints SET status = ?, updated_at = datetime('now') WHERE project_id = ? AND stage = ?`
    ).run(StageStatus.OVERRIDDEN, projectId, stage);

    db.prepare(
      `INSERT INTO human_interventions (project_id, stage, original_data, modified_data, reason) VALUES (?, ?, ?, ?, ?)`
    ).run(projectId, stage, JSON.stringify(originalData), JSON.stringify(modifiedData), reason);
  }

  /**
   * 清除某个阶段及之后所有阶段的检查点（用于重跑）
   */
  clearFromStage(projectId, fromStage) {
    const stages = ['TOPIC_DISCOVERY','LITERATURE_REVIEW','RESEARCH_DESIGN','THEORETICAL_FRAMEWORK',
                    'METHOD_PLANNING','CONTENT_GENERATION','QUALITY_ASSURANCE','FIGURE_TABLE_GEN','POLISH_REVIEW'];
    const idx = stages.indexOf(fromStage);
    if (idx < 0) return;
    const toDelete = stages.slice(idx);
    const placeholders = toDelete.map(() => '?').join(',');
    getDb().prepare(
      `DELETE FROM stage_checkpoints WHERE project_id = ? AND stage IN (${placeholders})`
    ).run(projectId, ...toDelete);
  }

  /**
   * 记录模型调用
   */
  logModelCall(projectId, stage, model, promptTokens, completionTokens, latencyMs) {
    getDb().prepare(
      `INSERT INTO model_calls (project_id, stage, model, prompt_tokens, completion_tokens, latency_ms) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(projectId, stage, model, promptTokens, completionTokens, latencyMs);
  }
}

// 单例
let _instance;
export function getCheckpointManager() {
  if (!_instance) _instance = new CheckpointManager();
  return _instance;
}
