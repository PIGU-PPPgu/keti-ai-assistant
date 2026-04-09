/**
 * LiteratureReviewAgent v2 - 文献综述阶段
 * 搜索文献、整理综述、提取关键论点
 */

import { BaseAgentV2, PipelineStage } from '../base/BaseAgent.mjs';
import { getModelRouter } from '../base/ModelRouter.mjs';

export class LiteratureReviewAgent extends BaseAgentV2 {
  constructor() {
    super({
      stage: PipelineStage.LITERATURE_REVIEW,
      stageName: '文献综述',
      model: 'gpt-4o',
      qualityThreshold: 0.80,
    });
  }

  async run(context) {
    const { previousOutputs, metadata } = context;
    const topic = previousOutputs.TOPIC_DISCOVERY || {};
    const router = getModelRouter();

    const subject = metadata.subject || topic.subject;
    const direction = metadata.direction || topic.direction;
    const grade = metadata.grade || topic.grade;

    // 搜索 + 生成综述
    const resp = await router.call(context.projectId, this.stage, [
      { role: 'system', content: '你是教育科研文献专家，熟悉中国教育类核心期刊和CSSCI。' },
      { role: 'user', content: `请为"${subject}学科${grade}${direction}"课题完成以下任务：

1. 搜索并列出30篇参考文献（近3年≥60%，核心期刊≥40%，外文≥20%）
2. 撰写800字文献综述摘要，包含：
   - 国内研究现状（3-4个研究方向）
   - 国外研究现状（2-3个方向）
   - 研究空白与不足
   - 本研究切入点

文献格式：[序号] 作者. 标题[J]. 期刊, 年份, 卷(期): 页码.` },
    ], { maxTokens: 4000, temperature: 0.3 });

    const content = resp.choices?.[0]?.message?.content || '';

    // 解析文献列表
    const papers = this._parsePapers(content);
    const summary = content;

    return this.buildOutput({ data: { papers, summary, source: 'ai', count: papers.length }, modelUsed: this.model });
  }

  async score(output, context) {
    const data = output.data;
    let value = 0;
    const dimensions = [];
    const failureReasons = [];

    // 文献数量
    const countScore = Math.min((data.count || 0) / 20, 1);
    dimensions.push({ name: '文献数量', score: countScore });
    value += countScore * 0.3;

    // 综述深度（简单判断长度）
    const depthScore = Math.min((data.summary?.length || 0) / 800, 1);
    dimensions.push({ name: '综述深度', score: depthScore });
    value += depthScore * 0.4;

    // 结构完整性
    const hasStructure = data.summary?.includes('研究现状') || data.summary?.includes('研究空白');
    dimensions.push({ name: '结构完整性', score: hasStructure ? 0.9 : 0.4 });
    value += (hasStructure ? 0.9 : 0.4) * 0.3;

    if (data.count < 10) failureReasons.push('文献数量不足');
    if (!hasStructure) failureReasons.push('综述缺少必要结构');

    return this.buildScore({ value, dimensions, failureReasons });
  }

  _parsePapers(content) {
    const papers = [];
    const lines = content.split('\n');
    for (const line of lines) {
      const match = line.match(/^\[?\d+\]?\s*(.+)/);
      if (match && (match[1].includes('.') || match[1].includes('，'))) {
        papers.push(match[1].trim());
      }
    }
    return papers;
  }
}
