/**
 * FigureTableGenAgent v2 - 图表生成阶段
 * 研究框架图、时间线、预算表等
 */

import { BaseAgentV2, PipelineStage } from '../base/BaseAgent.mjs';
import { getModelRouter } from '../base/ModelRouter.mjs';

export class FigureTableGenAgent extends BaseAgentV2 {
  constructor() {
    super({
      stage: PipelineStage.FIGURE_TABLE_GEN,
      stageName: '图表生成',
      model: 'gpt-4o',
      qualityThreshold: 0.75,
    });
  }

  async run(context) {
    const { previousOutputs } = context;
    const content = previousOutputs.QUALITY_ASSURANCE || previousOutputs.CONTENT_GENERATION || {};
    const method = previousOutputs.METHOD_PLANNING || {};
    const topic = previousOutputs.TOPIC_DISCOVERY || {};
    const router = getModelRouter();

    const resp = await router.call(context.projectId, this.stage, [
      { role: 'system', content: '你是学术图表设计专家。用 Mermaid 或 Markdown 表格格式生成图表。' },
      { role: 'user', content: `为以下课题生成需要的图表：

课题：${topic.title}
方向：${topic.direction}

方法规划：
${(method.methodPlan || '').slice(0, 500)}

请生成：
1. 研究技术路线图（Mermaid flowchart 格式）
2. 研究时间安排表（Markdown 表格，按年度/学期）
3. 如果有预算章节，生成经费预算表（Markdown 表格）

每个图表前用 ### 标注名称。` },
    ], { maxTokens: 2000, temperature: 0.3 });

    const figures = resp.choices?.[0]?.message?.content || '';

    return this.buildOutput({
      data: { figures },
      modelUsed: this.model,
    });
  }

  async score(output, context) {
    const data = output.data;
    let value = 0;
    const failureReasons = [];

    const hasFlowchart = data.figures?.includes('flowchart') || data.figures?.includes('graph');
    const hasTable = data.figures?.includes('|');
    const longEnough = (data.figures?.length || 0) > 200;

    value = (hasFlowchart ? 0.35 : 0.1) + (hasTable ? 0.35 : 0.1) + (longEnough ? 0.3 : 0.1);
    if (!hasFlowchart) failureReasons.push('缺少技术路线图');
    if (!hasTable) failureReasons.push('缺少表格');

    return this.buildScore({ value, failureReasons });
  }
}
