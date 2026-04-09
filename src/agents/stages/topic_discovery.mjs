/**
 * TopicDiscoveryAgent v2 - 选题发现阶段
 * 收集需求、发散选题、确定方向
 */

import { BaseAgentV2, PipelineStage } from '../base/BaseAgent.mjs';
import { getModelRouter } from '../base/ModelRouter.mjs';

export class TopicDiscoveryAgent extends BaseAgentV2 {
  constructor() {
    super({
      stage: PipelineStage.TOPIC_DISCOVERY,
      stageName: '选题发现',
      model: 'gpt-5.4',
      qualityThreshold: 0.75,
    });
  }

  async run(context) {
    const { metadata } = context;
    const router = getModelRouter();

    // 1. 发散选题（如果有方向但没标题）
    let titles = [];
    let recommended = '';

    if (!metadata.title) {
      const resp = await router.call(context.projectId, this.stage, [
        { role: 'system', content: '你是一位资深教育科研专家，擅长为各级课题命名。' },
        { role: 'user', content: `请为以下课题生成5个候选名称：\n\n级别：${metadata.level}\n学科：${metadata.subject}\n学段：${metadata.grade}\n研究方向：${metadata.direction}\n\n要求：20-35字，包含核心概念和研究对象，避免泛化词。每行一个，前面加序号。最后推荐一个并说明理由。` },
      ], { maxTokens: 800, temperature: 0.8 });

      const text = resp.choices?.[0]?.message?.content || '';
      titles = text.split('\n').filter(l => /^\d+\./.test(l.trim())).map(l => l.replace(/^\d+\.\s*/, '').trim());
      const recMatch = text.match(/推荐[：:]\s*(.+)/);
      recommended = titles[0] || '';
    } else {
      recommended = metadata.title;
    }

    // 2. 构建选题规格
    const topicSpec = {
      title: recommended,
      titleCandidates: titles,
      level: metadata.level,
      subject: metadata.subject,
      grade: metadata.grade,
      direction: metadata.direction,
      requirements: metadata.requirements || '',
    };

    return this.buildOutput({ data: topicSpec, modelUsed: this.model });
  }

  async score(output, context) {
    const data = output.data;
    let value = 0;
    const dimensions = [];
    const failureReasons = [];

    // 需求完整度
    const completeness = [data.title, data.level, data.subject, data.grade, data.direction].filter(Boolean).length / 5;
    dimensions.push({ name: '需求完整度', score: completeness });
    value += completeness * 0.3;

    // 选题可行性
    const feasible = data.title && data.title.length >= 10 && data.title.length <= 50;
    dimensions.push({ name: '选题可行性', score: feasible ? 0.9 : 0.4 });
    value += (feasible ? 0.9 : 0.4) * 0.4;

    // 候选数量
    const candidateScore = Math.min((data.titleCandidates?.length || 0) / 3, 1);
    dimensions.push({ name: '候选丰富度', score: candidateScore });
    value += candidateScore * 0.3;

    if (!data.title) failureReasons.push('未生成课题标题');
    if (!feasible) failureReasons.push('课题标题长度不合适');

    return this.buildScore({ value, dimensions, failureReasons });
  }
}
