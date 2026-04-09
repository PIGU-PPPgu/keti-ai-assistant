/**
 * Pipeline v2 入口
 * 一键创建并运行9阶段流水线
 */

import { OrchestratorV2 } from '../orchestrator_v2.mjs';
import { TopicDiscoveryAgent } from './topic_discovery.mjs';
import { LiteratureReviewAgent } from './literature_review.mjs';
import { ResearchDesignAgent } from './research_design.mjs';
import { TheoreticalFrameworkAgent } from './theoretical_framework.mjs';
import { MethodPlanningAgent } from './method_planning.mjs';
import { ContentGenerationAgent } from './content_generation.mjs';
import { QualityAssuranceAgent } from './quality_assurance.mjs';
import { FigureTableGenAgent } from './figure_table_gen.mjs';
import { PolishReviewAgent } from './polish_review.mjs';

/**
 * 创建完整的 v2 流水线
 * @returns {OrchestratorV2}
 */
export function createPipeline() {
  const orch = new OrchestratorV2();

  orch.register(new TopicDiscoveryAgent());
  orch.register(new LiteratureReviewAgent());
  orch.register(new ResearchDesignAgent());
  orch.register(new TheoreticalFrameworkAgent());
  orch.register(new MethodPlanningAgent());
  orch.register(new ContentGenerationAgent());
  orch.register(new QualityAssuranceAgent());
  orch.register(new FigureTableGenAgent());
  orch.register(new PolishReviewAgent());

  return orch;
}

/**
 * 运行完整的 v2 流水线
 * @param {object} params
 * @param {string} params.projectId
 * @param {string} params.docType - shenbao | kaiti | zhongqi | jieti
 * @param {object} params.metadata - { level, subject, grade, direction, title, ... }
 * @param {string|null} params.fromStage - 从指定阶段重跑
 * @param {Function} params.onEvent - SSE 事件回调
 */
export async function executePipelineV2({ projectId, docType, metadata, fromStage = null, onEvent }) {
  const orch = createPipeline();
  return orch.run({ projectId, docType, metadata, fromStage, onEvent });
}
