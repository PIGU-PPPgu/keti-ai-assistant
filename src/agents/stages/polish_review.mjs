/**
 * PolishReviewAgent v2 - 润色审校阶段
 * 去AI化、润色、最终审校
 */

import { BaseAgentV2, PipelineStage } from '../base/BaseAgent.mjs';
import { getModelRouter } from '../base/ModelRouter.mjs';

export class PolishReviewAgent extends BaseAgentV2 {
  constructor() {
    super({
      stage: PipelineStage.POLISH_REVIEW,
      stageName: '润色审校',
      model: 'claude-opus-4-6',
      qualityThreshold: 0.88,
    });
  }

  async run(context) {
    const { previousOutputs } = context;
    const qa = previousOutputs.QUALITY_ASSURANCE || {};
    const figures = previousOutputs.FIGURE_TABLE_GEN || {};
    const topic = previousOutputs.TOPIC_DISCOVERY || {};
    const router = getModelRouter();

    const docContent = qa.fullContent || '';
    const figureContent = figures.figures || '';

    const resp = await router.call(context.projectId, this.stage, [
      { role: 'system', content: `你是学术论文润色专家。你的任务是：
1. 去除AI生成痕迹（排比句过多、空洞套话、"首先...其次...最后"等模式化表述）
2. 润色语言（学术化、精炼、有力量感）
3. 检查前后一致性（概念、数据、引用）
4. 确保格式规范

输出完整的润色后文档。保持原有结构不变。` },
      { role: 'user', content: `润色以下课题文档：

课题：${topic.title}

${docContent}

---

附图表：
${figureContent}` },
    ], { maxTokens: 8000, temperature: 0.2 });

    const polished = resp.choices?.[0]?.message?.content || docContent;

    return this.buildOutput({
      data: { finalDocument: polished, wordCount: polished.length },
      modelUsed: this.model,
    });
  }

  async score(output, context) {
    const data = output.data;
    let value = 0;
    const failureReasons = [];

    const doc = data.finalDocument || '';
    const wordCount = data.wordCount || 0;

    // 去AI化检测
    const aiPatterns = [/首先[，,].+其次[，,].+最后/g, /不仅.+而且.+更/g, /深入[地]?研究/g];
    const aiHitCount = aiPatterns.reduce((n, p) => n + (doc.match(p) || []).length, 0);
    const aiFreeScore = Math.max(0, 1 - aiHitCount * 0.1);

    // 长度检查
    const lengthScore = wordCount > 8000 ? 1 : wordCount / 8000;

    // 结构检查
    const hasStructure = (doc.match(/## /g) || []).length >= 5;

    value = aiFreeScore * 0.4 + lengthScore * 0.3 + (hasStructure ? 0.3 : 0.1);

    if (aiHitCount > 5) failureReasons.push(`检测到 ${aiHitCount} 处AI痕迹`);
    if (wordCount < 5000) failureReasons.push(`文档长度不足（${wordCount}字）`);
    if (!hasStructure) failureReasons.push('文档结构不完整');

    return this.buildScore({ value, failureReasons });
  }
}
