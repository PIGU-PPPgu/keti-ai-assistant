/**
 * Orchestrator v2 - 9阶段流水线调度
 * 支持断点续跑、SSE推送、人工介入
 */

import { PipelineStage, StageStatus, STAGE_ORDER } from './base/BaseAgent.mjs';
import { getCheckpointManager } from './base/CheckpointManager.mjs';
import { QualityGate } from './base/QualityGate.mjs';

const STAGE_NAMES = {
  [PipelineStage.TOPIC_DISCOVERY]:       '选题发现',
  [PipelineStage.LITERATURE_REVIEW]:     '文献综述',
  [PipelineStage.RESEARCH_DESIGN]:       '研究设计',
  [PipelineStage.THEORETICAL_FRAMEWORK]: '理论框架',
  [PipelineStage.METHOD_PLANNING]:       '方法规划',
  [PipelineStage.CONTENT_GENERATION]:    '内容生成',
  [PipelineStage.QUALITY_ASSURANCE]:     '质量保证',
  [PipelineStage.FIGURE_TABLE_GEN]:      '图表生成',
  [PipelineStage.POLISH_REVIEW]:         '润色审校',
};

export class OrchestratorV2 {
  constructor() {
    /** @type {Map<string, BaseAgentV2>} stage → agent 实例 */
    this.agents = new Map();
    this.cp = getCheckpointManager();
    this.gate = new QualityGate();
  }

  /**
   * 注册阶段 Agent
   * @param {BaseAgentV2} agent
   */
  register(agent) {
    this.agents.set(agent.stage, agent);
  }

  /**
   * 执行流水线
   * @param {object} params
   * @param {string} params.projectId
   * @param {string} params.docType
   * @param {object} params.metadata - 学科、年级、方向等
   * @param {string|null} params.fromStage - 从指定阶段重跑（null=从头或断点续跑）
   * @param {Function} params.onEvent - SSE 事件回调
   */
  async run({ projectId, docType, metadata, fromStage = null, onEvent, shouldPause }) {
    const emit = (type, data) => onEvent?.(type, data);

    // 加载已有检查点
    const checkpoints = this.cp.load(projectId);

    // 决定从哪个阶段开始
    let startIdx = 0;
    if (fromStage) {
      startIdx = STAGE_ORDER.indexOf(fromStage);
      this.cp.clearFromStage(projectId, fromStage);
    } else {
      // 断点续跑：找到最后一个成功的阶段，从下一个开始
      const lastDone = this.cp.getCurrentStage(projectId);
      if (lastDone) {
        startIdx = STAGE_ORDER.indexOf(lastDone) + 1;
        emit('pipeline_resume', { fromStage: STAGE_ORDER[startIdx], completedStage: lastDone });
      }
    }

    emit('pipeline_start', {
      projectId,
      docType,
      totalStages: STAGE_ORDER.length,
      startFrom: STAGE_ORDER[startIdx],
      resuming: startIdx > 0,
    });

    // 逐阶段执行
    for (let i = startIdx; i < STAGE_ORDER.length; i++) {
      const stage = STAGE_ORDER[i];
      const agent = this.agents.get(stage);
      if (!agent) {
        console.warn(`[OrchestratorV2] 未注册 agent: ${stage}, 跳过`);
        continue;
      }

      const stageName = STAGE_NAMES[stage] || stage;

      emit('stage_start', {
        stage,
        stageName,
        step: i + 1,
        total: STAGE_ORDER.length,
        model: agent.model,
      });

      // 构建上下文（包含所有前序输出）
      const context = {
        projectId,
        docType,
        stage,
        previousOutputs: this._collectPreviousOutputs(checkpoints),
        userOverrides: {},
        metadata,
        retryHint: null,
        retryCount: 0,
      };

      const startTime = Date.now();

      // 执行 + 质量门控
      const output = await this.gate.checkAndRetry(agent, context, (type, data) => {
        emit(type, { ...data, stage, stageName });
      });

      // 保存检查点
      this.cp.save(projectId, stage, output);
      checkpoints[stage] = output;

      const durationMs = Date.now() - startTime;
      const score = output.qualityScore?.value ?? 0;

      emit('stage_complete', {
        stage,
        stageName,
        step: i + 1,
        total: STAGE_ORDER.length,
        status: output.status,
        score,
        durationMs,
        modelUsed: output.modelUsed,
      });

      // 如果暂停了（质量不达标 或 用户请求），停止流水线
      if (output.status === StageStatus.PAUSED) {
        emit('pipeline_paused', {
          stage,
          stageName,
          reason: 'quality_failed',
          score,
        });
        return { status: 'paused', completedStage: STAGE_ORDER[i - 1] || null, failedStage: stage };
      }

      // 用户请求暂停
      if (shouldPause?.()) {
        emit('pipeline_paused', {
          stage,
          stageName,
          reason: 'human_requested',
          completedStep: i + 1,
        });
        return { status: 'paused', completedStage: stage };
      }
    }

    // 全部完成
    emit('pipeline_complete', { projectId, totalStages: STAGE_ORDER.length });
    return { status: 'complete', projectId };
  }

  /**
   * 暂停当前流水线
   */
  pause(projectId) {
    // 由前端控制，orchestrator 在当前阶段完成后自然停止
    // 这里标记一个 flag，供外部查询
  }

  /**
   * 从指定阶段恢复
   */
  resume(projectId, overrides = {}) {
    // overrides: { stage, modifiedData }
    if (overrides.stage && overrides.modifiedData) {
      const original = this.cp.loadStage(projectId, overrides.stage);
      this.cp.markOverridden(projectId, overrides.stage, original?.data, overrides.modifiedData, overrides.reason || '人工修改');
      // 清除下游检查点
      const idx = STAGE_ORDER.indexOf(overrides.stage);
      if (idx >= 0 && idx < STAGE_ORDER.length - 1) {
        this.cp.clearFromStage(projectId, STAGE_ORDER[idx + 1]);
      }
    }
  }

  /**
   * 收集所有前序阶段的输出
   */
  _collectPreviousOutputs(checkpoints) {
    const outputs = {};
    for (const [stage, cp] of Object.entries(checkpoints)) {
      if (cp.status === StageStatus.SUCCESS || cp.status === StageStatus.OVERRIDDEN) {
        outputs[stage] = cp.data;
      }
    }
    return outputs;
  }
}
