/**
 * QualityAssuranceAgent v2 - 质量保证阶段
 * 评分、优化、交叉评审
 */

import { BaseAgentV2, PipelineStage } from '../base/BaseAgent.mjs';
import { getModelRouter } from '../base/ModelRouter.mjs';

export class QualityAssuranceAgent extends BaseAgentV2 {
  constructor() {
    super({
      stage: PipelineStage.QUALITY_ASSURANCE,
      stageName: '质量保证',
      model: 'claude-opus-4-6',
      qualityThreshold: 0.85,
      maxRetries: 2,
    });
  }

  async run(context) {
    const { previousOutputs } = context;
    const content = previousOutputs.CONTENT_GENERATION || {};
    const topic = previousOutputs.TOPIC_DISCOVERY || {};
    const router = getModelRouter();

    const sections = content.sections || [];
    const issues = [];
    const improved = [];

    for (const section of sections) {
      if (!section.content || section.content.length < 100) continue;

      const resp = await router.call(context.projectId, this.stage, [
        { role: 'system', content: `你是严格的教育科研评审专家。评审标准：
- 内容完整性：是否覆盖所有要素
- 学术规范性：引用格式、术语、逻辑
- 实质深度：数据、案例、政策依据
- 去AI化：是否有过度的排比、套话、空洞表述

评分 1-10，输出格式：
SCORE: [数字]
ISSUES: [具体问题]
IMPROVED: [改进后的完整章节内容]` },
        { role: 'user', content: `评审并优化以下章节：\n\n## ${section.name}\n${section.content}\n\n课题方向：${topic.direction || '教育研究'}` },
      ], { maxTokens: 2000, temperature: 0.3 });

      const text = resp.choices?.[0]?.message?.content || '';
      const scoreMatch = text.match(/SCORE:\s*(\d+)/);
      const score = scoreMatch ? parseInt(scoreMatch[1]) : 7;

      // 提取改进后的内容
      const improvedMatch = text.match(/IMPROVED:\s*([\s\S]+?)(?=$|SCORE:)/);
      const improvedContent = improvedMatch ? improvedMatch[1].trim() : section.content;

      const issueMatch = text.match(/ISSUES:\s*(.+?)(?=\nIMPROVED:|\nSCORE:|$)/s);
      if (issueMatch && score < 8) issues.push({ section: section.name, issues: issueMatch[1].trim(), score });

      improved.push({ ...section, content: improvedContent, scores: { composite: score / 10 } });
    }

    const avgScore = improved.length > 0 ? improved.reduce((s, x) => s + (x.scores?.composite || 0.7), 0) / improved.length : 0.7;
    const fullContent = improved.map(s => `## ${s.name}\n\n${s.content}`).join('\n\n');

    return this.buildOutput({
      data: { sections: improved, fullContent, avgScore, issues, wordCount: fullContent.length },
      modelUsed: this.model,
    });
  }

  async score(output, context) {
    const data = output.data;
    const value = Math.min(data.avgScore || 0.7, 1);
    const failureReasons = [];

    if (value < 0.7) failureReasons.push(`平均评分过低（${(value * 10).toFixed(1)}/10）`);
    if ((data.issues?.length || 0) > 3) failureReasons.push(`仍有 ${data.issues.length} 个章节存在问题`);

    return this.buildScore({ value, failureReasons });
  }
}
