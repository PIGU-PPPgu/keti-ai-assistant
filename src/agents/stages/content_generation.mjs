/**
 * ContentGenerationAgent v2 - 内容生成阶段
 * 基于所有前序阶段的输出，生成完整文档各章节
 */

import { BaseAgentV2, PipelineStage, DocType } from '../base/BaseAgent.mjs';
import { getModelRouter } from '../base/ModelRouter.mjs';

// 章节定义（各文档类型）
const SECTIONS = {
  [DocType.SHENBAO]: [
    { id: 'title', name: '基本信息', promptKey: 'basic' },
    { id: 'background', name: '研究背景与意义', promptKey: 'background' },
    { id: 'literature', name: '研究现状述评', promptKey: 'literature' },
    { id: 'objectives', name: '研究目标与内容', promptKey: 'objectives' },
    { id: 'framework', name: '研究框架与理论基础', promptKey: 'framework' },
    { id: 'innovation', name: '研究重难点与创新', promptKey: 'innovation' },
    { id: 'methodology', name: '研究方法与计划', promptKey: 'methodology' },
    { id: 'results', name: '预期成果', promptKey: 'results' },
    { id: 'budget', name: '经费预算', promptKey: 'budget' },
    { id: 'references', name: '参考文献', promptKey: 'references' },
  ],
  [DocType.KAITI]: [
    { id: 'plan', name: '研究方案', promptKey: 'plan' },
    { id: 'literature', name: '文献综述', promptKey: 'literature' },
    { id: 'methodology', name: '研究方法', promptKey: 'methodology' },
    { id: 'timeline', name: '时间安排', promptKey: 'timeline' },
    { id: 'results', name: '预期成果', promptKey: 'results' },
    { id: 'budget', name: '经费预算', promptKey: 'budget' },
    { id: 'references', name: '参考文献', promptKey: 'references' },
  ],
  [DocType.ZHONGQI]: [
    { id: 'progress', name: '研究进展', promptKey: 'progress' },
    { id: 'achievements', name: '阶段成果', promptKey: 'achievements' },
    { id: 'issues', name: '问题与对策', promptKey: 'issues' },
    { id: 'next', name: '下一步计划', promptKey: 'next' },
    { id: 'budget', name: '经费使用', promptKey: 'budget' },
  ],
  [DocType.JIETI]: [
    { id: 'summary', name: '工作总结', promptKey: 'summary' },
    { id: 'results', name: '研究成果', promptKey: 'results' },
    { id: 'innovation', name: '创新点', promptKey: 'innovation' },
    { id: 'value', name: '应用价值', promptKey: 'value' },
    { id: 'issues', name: '问题建议', promptKey: 'issues' },
    { id: 'list', name: '成果清单', promptKey: 'list' },
    { id: 'budget', name: '经费决算', promptKey: 'budget' },
    { id: 'references', name: '参考文献', promptKey: 'references' },
  ],
};

export class ContentGenerationAgent extends BaseAgentV2 {
  constructor() {
    super({
      stage: PipelineStage.CONTENT_GENERATION,
      stageName: '内容生成',
      model: 'claude-sonnet-4-6',
      qualityThreshold: 0.82,
    });
  }

  async run(context) {
    const { previousOutputs, metadata, docType } = context;
    const router = getModelRouter();
    const sections = SECTIONS[docType] || SECTIONS[DocType.SHENBAO];

    // 构建全局上下文
    const topic = previousOutputs.TOPIC_DISCOVERY || {};
    const literature = previousOutputs.LITERATURE_REVIEW || {};
    const research = previousOutputs.RESEARCH_DESIGN || {};
    const theory = previousOutputs.THEORETICAL_FRAMEWORK || {};
    const method = previousOutputs.METHOD_PLANNING || {};

    const globalContext = `课题：${topic.title || metadata.title}
学科：${topic.subject || metadata.subject}  学段：${topic.grade || metadata.grade}  级别：${topic.level || metadata.level}
研究方向：${topic.direction || metadata.direction}

研究设计：${(research.researchDesign || '').slice(0, 400)}
理论框架：${(theory.theory || '').slice(0, 400)}
方法规划：${(method.methodPlan || '').slice(0, 400)}
文献要点：${(literature.summary || '').slice(0, 600)}`;

    const generated = [];
    const placeholders = [];

    for (const section of sections) {
      const resp = await router.call(context.projectId, this.stage, [
        { role: 'system', content: `你是一位教育科研写作专家，正在撰写${docType === 'shenbao' ? '课题申报书' : docType === 'kaiti' ? '开题报告' : docType === 'zhongqi' ? '中期检查报告' : '结题报告'}。\n\n全局上下文：\n${globalContext}\n\n个人信息字段用占位符：【待填写：申请人姓名】等。` },
        { role: 'user', content: `请生成"${section.name}"章节。要求内容充实、逻辑严密、引用规范。` },
      ], { maxTokens: 2000, temperature: 0.6 });

      const content = resp.choices?.[0]?.message?.content || '';

      // 提取占位符
      const phs = content.match(/【待填写：.+?】/g) || [];
      if (phs.length) placeholders.push(...phs.map(p => ({ section: section.id, placeholder: p })));

      generated.push({ id: section.id, name: section.name, content, score: null });
    }

    // 拼接完整文档
    const fullContent = generated.map(s => `## ${s.name}\n\n${s.content}`).join('\n\n');

    return this.buildOutput({
      data: { sections: generated, fullContent, wordCount: fullContent.length, placeholders, title: topic.title },
      modelUsed: this.model,
    });
  }

  async score(output, context) {
    const data = output.data;
    let value = 0;
    const failureReasons = [];

    const sectionCount = data.sections?.length || 0;
    const totalWords = data.wordCount || 0;
    const hasAllSections = sectionCount >= (SECTIONS[context.docType]?.length || 8) - 1;
    const avgWordsPerSection = totalWords / Math.max(sectionCount, 1);

    const completeness = hasAllSections ? 0.35 : (sectionCount / 10) * 0.35;
    const lengthScore = Math.min(avgWordsPerSection / 300, 1) * 0.35;
    const coherenceScore = totalWords > 5000 ? 0.3 : (totalWords / 5000) * 0.3;

    value = completeness + lengthScore + coherenceScore;

    if (!hasAllSections) failureReasons.push(`章节不完整（${sectionCount}/${SECTIONS[context.docType]?.length || 10}）`);
    if (totalWords < 5000) failureReasons.push(`总字数不足（${totalWords}字）`);
    if (avgWordsPerSection < 200) failureReasons.push('部分章节内容过短');

    return this.buildScore({ value, failureReasons });
  }
}
