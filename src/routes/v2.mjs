/**
 * v2 路由 - 9阶段流水线 API
 * Phase 3: 质量控制 + 人工介入
 */

import { Router } from 'express';
import { OrchestratorV2 } from '../agents/orchestrator_v2.mjs';
import { getCheckpointManager } from '../agents/base/CheckpointManager.mjs';
import { STAGE_ORDER } from '../agents/base/BaseAgent.mjs';

const router = Router();

// 活跃的 orchestrator 实例（projectId → OrchestratorV2）
const activeOrchestrators = new Map();
// 暂停标志（projectId → true）
const pauseFlags = new Map();

/**
 * POST /api/v2/generate
 * 启动 9 阶段流水线（SSE）
 * body: { projectId, docType, metadata, fromStage? }
 */
router.post('/generate', async (req, res) => {
  const { projectId, docType, metadata, fromStage } = req.body;
  if (!projectId || !docType || !metadata) {
    return res.status(400).json({ error: '缺少 projectId / docType / metadata' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event, data) => {
    if (!res.writableEnded) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };

  // 动态注册所有 stage agents
  const orch = new OrchestratorV2();
  await _registerAgents(orch, docType);
  activeOrchestrators.set(projectId, orch);
  pauseFlags.delete(projectId);

  // 注入暂停检查
  const origRun = orch.run.bind(orch);
  orch.run = async (params) => {
    params.shouldPause = () => pauseFlags.get(projectId) === true;
    return origRun(params);
  };

  try {
    await orch.run({ projectId, docType, metadata, fromStage: fromStage || null, onEvent: send });
  } catch (e) {
    send('error', { message: e.message });
  } finally {
    activeOrchestrators.delete(projectId);
    res.end();
  }
});

/**
 * POST /api/v2/pause
 * 暂停流水线（当前阶段完成后停止）
 */
router.post('/pause', (req, res) => {
  const { projectId } = req.body;
  if (!projectId) return res.status(400).json({ error: '缺少 projectId' });
  pauseFlags.set(projectId, true);
  res.json({ ok: true, message: '暂停信号已发送，当前阶段完成后停止' });
});

/**
 * POST /api/v2/resume
 * 从断点继续（或从指定阶段重跑）
 * body: { projectId, docType, metadata, fromStage? }
 */
router.post('/resume', async (req, res) => {
  const { projectId, docType, metadata, fromStage } = req.body;
  if (!projectId || !docType || !metadata) {
    return res.status(400).json({ error: '缺少必要参数' });
  }

  pauseFlags.delete(projectId);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event, data) => {
    if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const orch = new OrchestratorV2();
  await _registerAgents(orch, docType);
  activeOrchestrators.set(projectId, orch);

  try {
    await orch.run({ projectId, docType, metadata, fromStage: fromStage || null, onEvent: send });
  } catch (e) {
    send('error', { message: e.message });
  } finally {
    activeOrchestrators.delete(projectId);
    res.end();
  }
});

/**
 * POST /api/v2/rerun-stage
 * 重跑单个阶段（清除该阶段及下游检查点）
 * body: { projectId, docType, metadata, stage }
 */
router.post('/rerun-stage', async (req, res) => {
  const { projectId, docType, metadata, stage } = req.body;
  if (!projectId || !docType || !metadata || !stage) {
    return res.status(400).json({ error: '缺少必要参数' });
  }
  if (!STAGE_ORDER.includes(stage)) {
    return res.status(400).json({ error: `无效的 stage: ${stage}` });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event, data) => {
    if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const orch = new OrchestratorV2();
  await _registerAgents(orch, docType);
  activeOrchestrators.set(projectId, orch);

  try {
    // 清除该阶段及下游，然后从该阶段重跑
    await orch.run({ projectId, docType, metadata, fromStage: stage, onEvent: send });
  } catch (e) {
    send('error', { message: e.message });
  } finally {
    activeOrchestrators.delete(projectId);
    res.end();
  }
});

/**
 * POST /api/v2/override
 * 人工编辑某阶段输出（标记 OVERRIDDEN，下游自动重跑）
 * body: { projectId, docType, metadata, stage, modifiedData, reason? }
 */
router.post('/override', async (req, res) => {
  const { projectId, stage, modifiedData, reason, docType, metadata } = req.body;
  if (!projectId || !stage || !modifiedData) {
    return res.status(400).json({ error: '缺少必要参数' });
  }

  const cp = getCheckpointManager();
  const original = cp.loadStage(projectId, stage);
  if (!original) {
    return res.status(404).json({ error: `阶段 ${stage} 无检查点` });
  }

  // 标记 OVERRIDDEN
  cp.markOverridden(projectId, stage, original.data, modifiedData, reason || '人工修改');

  // 清除下游检查点
  const idx = STAGE_ORDER.indexOf(stage);
  if (idx >= 0 && idx < STAGE_ORDER.length - 1) {
    cp.clearFromStage(projectId, STAGE_ORDER[idx + 1]);
  }

  res.json({ ok: true, message: `${stage} 已标记为 OVERRIDDEN，下游检查点已清除` });
});

/**
 * GET /api/v2/status/:projectId
 * 查询项目当前进度
 */
router.get('/status/:projectId', (req, res) => {
  const { projectId } = req.params;
  const cp = getCheckpointManager();
  const checkpoints = cp.load(projectId);
  const isRunning = activeOrchestrators.has(projectId);
  const isPaused = pauseFlags.get(projectId) === true;

  const stages = STAGE_ORDER.map((stage, i) => {
    const cp_data = checkpoints[stage];
    return {
      stage,
      step: i + 1,
      status: cp_data?.status || 'pending',
      score: cp_data?.qualityScore ?? null,
      retryCount: cp_data?.retryCount ?? 0,
      modelUsed: cp_data?.modelUsed || null,
      updatedAt: cp_data?.updatedAt || null,
    };
  });

  res.json({ projectId, isRunning, isPaused, stages });
});

// ── 内部：注册所有 stage agents ──────────────────────────────
async function _registerAgents(orch, docType) {
  const { TopicDiscoveryAgent }       = await import('../agents/stages/topic_discovery.mjs');
  const { LiteratureReviewAgent }     = await import('../agents/stages/literature_review.mjs');
  const { ResearchDesignAgent }       = await import('../agents/stages/research_design.mjs');
  const { TheoreticalFrameworkAgent } = await import('../agents/stages/theoretical_framework.mjs');
  const { MethodPlanningAgent }       = await import('../agents/stages/method_planning.mjs');
  const { ContentGenerationAgent }    = await import('../agents/stages/content_generation.mjs');
  const { QualityAssuranceAgent }     = await import('../agents/stages/quality_assurance.mjs');
  const { FigureTableGenAgent }       = await import('../agents/stages/figure_table_gen.mjs');
  const { PolishReviewAgent }         = await import('../agents/stages/polish_review.mjs');

  orch.register(new TopicDiscoveryAgent());
  orch.register(new LiteratureReviewAgent());
  orch.register(new ResearchDesignAgent());
  orch.register(new TheoreticalFrameworkAgent());
  orch.register(new MethodPlanningAgent());
  orch.register(new ContentGenerationAgent({ docType }));
  orch.register(new QualityAssuranceAgent());
  orch.register(new FigureTableGenAgent());
  orch.register(new PolishReviewAgent());
}

export default router;
