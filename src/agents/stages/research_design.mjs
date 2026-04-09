/**
 * ResearchDesignAgent - 研究设计阶段（新增）
 * 研究问题、假设、框架设计
 */

import { BaseAgentV2, PipelineStage } from '../base/BaseAgent.mjs';
import { getModelRouter } from '../base/ModelRouter.mjs';

export class ResearchDesignAgent extends BaseAgentV2 {
  constructor() {
    super({
      stage: PipelineStage.RESEARCH_DESIGN,
      stageName: '研究设计',
      model: 'claude-sonnet-4-6',
      qualityThreshold: 0.80,
    });
  }

  async run(context) {
    const { previousOutputs, metadata } = context;
    const topic = previousOutputs.TOPIC_DISCOVERY || {};
    const lit = previousOutputs.LITERATURE_REVIEW || {};
    const router = getModelRouter();

    const resp = await router.call(context.projectId, this.stage, [
      { role: 'system', content: '你是教育科研方法论专家，擅长设计严谨的研究方案。' },
      { role: 'user', content: `基于以下信息，设计完整的研究方案：

课题：${topic.title || metadata.title}
学科：${topic.subject || metadata.subject}
学段：${topic.grade || metadata.grade}
级别：${topic.level || metadata.level}
方向：${topic.direction || metadata.direction}

文献综述要点：
${(lit.summary || '').slice(0, 1000)}

请输出：
1. 核心研究问题（2-3个，具体可操作）
2. 研究假设（对应每个研究问题）
3. 研究框架（变量关系说明）
4. 预期创新点（理论创新+实践创新）

要求：问题具体、假设可验证、框架清晰。` },
    ], { maxTokens: 2000, temperature: 0.5 });

    const content = resp.choices?.[0]?.message?.content || '';

    return this.buildOutput({
      data: { researchDesign: content, questions: this._extractQuestions(content) },
      modelUsed: this.model,
    });
  }

  async score(output, context) {
    const data = output.data;
    let value = 0;
    const failureReasons = [];

    const hasQuestions = (data.questions?.length || 0) >= 2;
    const hasHypothesis = data.researchDesign?.includes('假设');
    const hasFramework = data.researchDesign?.includes('框架') || data.researchDesign?.includes('变量');
    const longEnough = (data.researchDesign?.length || 0) > 500;

    value = (hasQuestions ? 0.3 : 0) + (hasHypothesis ? 0.25 : 0) + (hasFramework ? 0.25 : 0) + (longEnough ? 0.2 : 0);
    if (!hasQuestions) failureReasons.push('缺少明确的研究问题');
    if (!hasHypothesis) failureReasons.push('缺少研究假设');
    if (!hasFramework) failureReasons.push('缺少研究框架');

    return this.buildScore({ value, failureReasons });
  }

  _extractQuestions(content) {
    const questions = [];
    for (const line of content.split('\n')) {
      if (/^\d+[.、）)]/.test(line.trim()) && line.includes('？')) {
        questions.push(line.replace(/^\d+[.、）)]\s*/, '').trim());
      }
    }
    return questions;
  }
}
