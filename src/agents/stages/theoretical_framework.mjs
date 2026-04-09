/**
 * TheoreticalFrameworkAgent - 理论框架阶段（新增）
 * 理论基础、概念界定、模型构建
 */

import { BaseAgentV2, PipelineStage } from '../base/BaseAgent.mjs';
import { getModelRouter } from '../base/ModelRouter.mjs';

export class TheoreticalFrameworkAgent extends BaseAgentV2 {
  constructor() {
    super({
      stage: PipelineStage.THEORETICAL_FRAMEWORK,
      stageName: '理论框架',
      model: 'claude-sonnet-4-6',
      qualityThreshold: 0.78,
    });
  }

  async run(context) {
    const { previousOutputs, metadata } = context;
    const topic = previousOutputs.TOPIC_DISCOVERY || {};
    const research = previousOutputs.RESEARCH_DESIGN || {};
    const router = getModelRouter();

    const resp = await router.call(context.projectId, this.stage, [
      { role: 'system', content: '你是教育理论专家，精通建构主义、多元智能、核心素养等主流教育理论。' },
      { role: 'user', content: `为以下课题构建理论基础：

课题：${topic.title || metadata.title}
学科：${topic.subject || metadata.subject}
方向：${topic.direction || metadata.direction}

研究设计：
${(research.researchDesign || '').slice(0, 800)}

请输出：
1. 核心理论（2-3个，说明选择理由和与本研究的关联）
2. 核心概念界定（4-6个关键概念的操作性定义）
3. 理论模型（概念间关系说明，建议用文字描述逻辑链）

要求：理论选择有针对性，概念界定可操作，模型逻辑清晰。` },
    ], { maxTokens: 2000, temperature: 0.4 });

    const content = resp.choices?.[0]?.message?.content || '';

    return this.buildOutput({
      data: { theory: content },
      modelUsed: this.model,
    });
  }

  async score(output, context) {
    const data = output.data;
    let value = 0;
    const failureReasons = [];

    const hasTheory = data.theory?.length > 400;
    const hasConcepts = data.theory?.includes('界定') || data.theory?.includes('定义');
    const hasModel = data.theory?.includes('模型') || data.theory?.includes('关系');

    value = (hasTheory ? 0.4 : 0.1) + (hasConcepts ? 0.3 : 0.1) + (hasModel ? 0.3 : 0.1);
    if (!hasTheory) failureReasons.push('理论阐述不够充分');
    if (!hasConcepts) failureReasons.push('缺少概念界定');
    if (!hasModel) failureReasons.push('缺少理论模型描述');

    return this.buildScore({ value, failureReasons });
  }
}
