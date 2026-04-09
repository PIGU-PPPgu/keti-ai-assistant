/**
 * ModelRouter - 多模型路由
 * 按阶段路由到不同模型，统一走 sub2api
 */

import { PipelineStage } from './BaseAgent.mjs';
import { getCheckpointManager } from './CheckpointManager.mjs';

// ── 路由表 ──────────────────────────────────────────────
const MODEL_ROUTING = {
  [PipelineStage.TOPIC_DISCOVERY]:       { primary: 'gpt-5.4',        fallback: 'gpt-4o' },
  [PipelineStage.LITERATURE_REVIEW]:     { primary: 'gpt-4o',         fallback: 'gpt-5.4' },
  [PipelineStage.RESEARCH_DESIGN]:       { primary: 'claude-sonnet-4-6', fallback: 'gpt-5.4' },
  [PipelineStage.THEORETICAL_FRAMEWORK]: { primary: 'claude-sonnet-4-6', fallback: 'gpt-5.4' },
  [PipelineStage.METHOD_PLANNING]:       { primary: 'claude-sonnet-4-6', fallback: 'gpt-5.4' },
  [PipelineStage.CONTENT_GENERATION]:    { primary: 'claude-sonnet-4-6', fallback: 'gpt-5.4' },
  [PipelineStage.QUALITY_ASSURANCE]:     { primary: 'claude-opus-4-6',  fallback: 'claude-sonnet-4-6' },
  [PipelineStage.FIGURE_TABLE_GEN]:      { primary: 'gpt-4o',         fallback: 'gpt-5.4' },
  [PipelineStage.POLISH_REVIEW]:         { primary: 'claude-opus-4-6',  fallback: 'claude-sonnet-4-6' },
};

export class ModelRouter {
  constructor() {
    this.baseUrl = process.env.SUB2API_BASE_URL || 'https://api.intellicode.top/v1';
    this.apiKey = process.env.SUB2API_API_KEY;
    this._cpm = null;
  }

  _getCheckpointManager() {
    if (!this._cpm) this._cpm = getCheckpointManager();
    return this._cpm;
  }

  /**
   * 获取阶段对应的模型
   */
  getModelForStage(stage) {
    return MODEL_ROUTING[stage]?.primary || 'gpt-4o';
  }

  /**
   * 调用 AI 模型（自动路由 + 降级）
   * @param {string} projectId
   * @param {string} stage
   * @param {Array} messages - OpenAI 格式 messages
   * @param {object} options - { maxTokens, temperature }
   */
  async call(projectId, stage, messages, options = {}) {
    const routing = MODEL_ROUTING[stage] || { primary: 'gpt-4o', fallback: 'gpt-4o' };
    const models = [routing.primary, routing.fallback];

    let lastError;
    for (const model of models) {
      try {
        const result = await this._doCall(model, messages, options);
        // 记录调用
        if (projectId) {
          this._getCheckpointManager().logModelCall(
            projectId, stage, model,
            result.usage?.prompt_tokens || 0,
            result.usage?.completion_tokens || 0,
            result._latencyMs || 0
          );
        }
        return result;
      } catch (err) {
        console.warn(`[ModelRouter] ${model} 失败: ${err.message}, 尝试降级...`);
        lastError = err;
      }
    }
    throw lastError;
  }

  /**
   * 实际 HTTP 调用
   */
  async _doCall(model, messages, options = {}) {
    const start = Date.now();
    const body = {
      model,
      messages,
      max_tokens: options.maxTokens || 8000,
      temperature: options.temperature ?? 0.7,
    };

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API [${res.status}]: ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    data._latencyMs = Date.now() - start;
    return data;
  }

  /**
   * 简单调用（不记录日志）
   */
  async simpleCall(model, messages, options = {}) {
    return this._doCall(model, messages, options);
  }
}

// 单例
let _instance;
export function getModelRouter() {
  if (!_instance) _instance = new ModelRouter();
  return _instance;
}
