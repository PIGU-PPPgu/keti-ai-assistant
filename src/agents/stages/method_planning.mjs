/**
 * MethodPlanningAgent - 方法规划阶段（新增）
 * 研究方法、技术路线、工具选择、时间规划
 */

import { BaseAgentV2, PipelineStage } from '../base/BaseAgent.mjs';
import { getModelRouter } from '../base/ModelRouter.mjs';

export class MethodPlanningAgent extends BaseAgentV2 {
  constructor() {
    super({
      stage: PipelineStage.METHOD_PLANNING,
      stageName: '方法规划',
      model: 'claude-sonnet-4-6',
      qualityThreshold: 0.80,
    });
  }

  async run(context) {
    const { previousOutputs, metadata } = context;
    const topic = previousOutputs.TOPIC_DISCOVERY || {};
    const research = previousOutputs.RESEARCH_DESIGN || {};
    const theory = previousOutputs.THEORETICAL_FRAMEWORK || {};
    const router = getModelRouter();

    const level = topic.level || metadata.level || '区级';

    const resp = await router.call(context.projectId, this.stage, [
      { role: 'system', content: '你是教育科研方法专家，精通量化、质性和混合研究方法。' },
      { role: 'user', content: `为以下课题设计研究方法与实施计划：

课题：${topic.title || metadata.title}
学科：${topic.subject || metadata.subject}
级别：${level}

研究设计：
${(research.researchDesign || '').slice(0, 600)}

理论框架：
${(theory.theory || '').slice(0, 600)}

请输出：
1. 研究方法（4-5种，每种说明用途和具体操作步骤）
2. 研究对象与样本（抽样方法、样本量、伦理考虑）
3. 数据收集工具（问卷、访谈提纲、观察表等）
4. 数据分析方法（对应每种数据的分析手段）
5. 实施时间表（${level === '省级' ? '3年' : '2年'}周期，分阶段列出）
6. 技术路线图（文字描述逻辑流程）

要求：方法具体可操作，时间节点明确，工具选择有依据。` },
    ], { maxTokens: 3000, temperature: 0.4 });

    const content = resp.choices?.[0]?.message?.content || '';

    return this.buildOutput({
      data: { methodPlan: content },
      modelUsed: this.model,
    });
  }

  async score(output, context) {
    const data = output.data;
    let value = 0;
    const failureReasons = [];

    const hasMethods = (data.methodPlan?.match(/方法/g) || []).length >= 3;
    const hasTimeline = data.methodPlan?.includes('时间') || data.methodPlan?.includes('阶段');
    const hasTools = data.methodPlan?.includes('工具') || data.methodPlan?.includes('问卷');
    const longEnough = (data.methodPlan?.length || 0) > 800;

    value = (hasMethods ? 0.3 : 0.1) + (hasTimeline ? 0.25 : 0.1) + (hasTools ? 0.2 : 0.1) + (longEnough ? 0.25 : 0.1);
    if (!hasMethods) failureReasons.push('研究方法描述不足');
    if (!hasTimeline) failureReasons.push('缺少时间规划');
    if (!hasTools) failureReasons.push('缺少数据收集工具说明');

    return this.buildScore({ value, failureReasons });
  }
}
