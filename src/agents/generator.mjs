/**
 * Generator Agent v2 - 并行章节生成 + Critic 循环
 *
 * 流程：
 * 1. 并行生成所有章节（Promise.all）
 * 2. Critic Agent 对每章打分（1-10）
 * 3. 低于阈值的章节重写，最多 2 轮
 * 4. 拼接最终文档
 */

import { BaseAgent } from './base.mjs';
import { callAI, EXPERT_SYSTEM_PROMPT } from '../services/ai.mjs';

// 每种文档的章节定义
const SECTIONS = {
  shenbao: [
    {
      id: 'title',
      name: '课题名称与基本信息',
      prompt: (p) => `生成课题申报书的"基本信息"部分，包括：课题名称（如未提供则自动生成一个符合${p.level}水平的课题名）、研究背景一句话概述、主持人信息表格。
参数：级别=${p.level}，学科=${p.subject}，学段=${p.grade}，方向=${p.direction}${p.title ? `，课题名=${p.title}` : ''}`,
    },
    {
      id: 'background',
      name: '研究背景与意义',
      prompt: (p) => `生成课题申报书的"研究背景与意义"章节（800-1200字）。
学科=${p.subject}，学段=${p.grade}，研究方向=${p.direction}，级别=${p.level}。
要求：从政策背景、学科现状、实践需求三个维度展开，引用近3年教育政策文件，逻辑严密。`,
    },
    {
      id: 'literature',
      name: '研究现状述评',
      prompt: (p) => `生成课题申报书的"研究现状述评"章节（800-1200字）。
学科=${p.subject}，研究方向=${p.direction}。
要求：梳理国内外研究现状，指出研究空白，引用真实文献（格式：作者. 标题[J]. 期刊, 年份），至少引用8篇，近3年文献占60%以上。`,
    },
    {
      id: 'objectives',
      name: '研究目标与内容',
      prompt: (p) => `生成课题申报书的"研究目标与内容"章节（600-800字）。
学科=${p.subject}，学段=${p.grade}，方向=${p.direction}。
要求：研究目标3-4条（可量化），研究内容4-5个子课题，层次清晰，目标与内容对应。`,
    },
    {
      id: 'framework',
      name: '研究框架与理论基础',
      prompt: (p) => `生成课题申报书的"研究框架与理论基础"章节（500-700字）。
学科=${p.subject}，方向=${p.direction}。
要求：列出2-3个支撑理论（如建构主义、核心素养理论等），说明理论与本研究的关联，可用框架图描述（用文字表格代替）。`,
    },
    {
      id: 'innovation',
      name: '研究重难点与创新之处',
      prompt: (p) => `生成课题申报书的"研究重难点与创新之处"章节（400-600字）。
学科=${p.subject}，方向=${p.direction}，级别=${p.level}。
要求：研究重点2-3条，研究难点2-3条，创新点2-3条（具体实在，不夸大，不用"国内首创"等表述）。`,
    },
    {
      id: 'methodology',
      name: '研究方法与实施计划',
      prompt: (p) => `生成课题申报书的"研究方法与实施计划"章节（600-800字）。
级别=${p.level}，研究周期=2年。
要求：研究方法4-5种（文献法、调查法、行动研究法等），实施计划按阶段列出（第一阶段/第二阶段/第三阶段），时间节点具体，任务可执行。`,
    },
    {
      id: 'results',
      name: '预期研究成果',
      prompt: (p) => `生成课题申报书的"预期研究成果"章节（300-400字）。
学科=${p.subject}，级别=${p.level}。
要求：成果分类列出（论文、案例集、资源包、报告等），数量具体（如"发表论文2-3篇"），成果与研究目标对应。`,
    },
    {
      id: 'budget',
      name: '经费预算',
      prompt: (p) => `生成课题申报书的"经费预算"章节。
级别=${p.level}。
要求：用表格列出经费明细（资料费、调研费、专家咨询费、成果出版费、其他），总额符合${p.level}课题惯例（区级1-3万，市级3-10万，省级10-30万），各项比例合理。`,
    },
    {
      id: 'references',
      name: '参考文献',
      prompt: (p) => `生成课题申报书的"参考文献"列表。
学科=${p.subject}，方向=${p.direction}。
要求：至少30篇，格式严格按照：[序号] 作者. 标题[J/M/C]. 期刊/出版社, 年份, 卷(期): 页码.
近3年文献≥60%，核心期刊≥40%，外文文献≥20%，不要杜撰不存在的文献。`,
    },
  ],

  kaiti: [
    { id: 'plan',        name: '课题研究方案',   prompt: (p) => `生成开题报告的"课题研究方案"（800字），课题：《${p.title}》，学科=${p.subject}，学段=${p.grade}` },
    { id: 'literature',  name: '文献综述',       prompt: (p) => `生成开题报告的"文献综述"（600字，引用15篇以上），课题：《${p.title}》` },
    { id: 'methodology', name: '研究方法详解',   prompt: (p) => `生成开题报告的"研究方法详解"（400字），课题：《${p.title}》` },
    { id: 'timeline',    name: '时间安排',       prompt: (p) => `生成开题报告的"时间安排"（甘特图形式，用Markdown表格），课题：《${p.title}》，研究周期2年` },
    { id: 'results',     name: '预期成果',       prompt: (p) => `生成开题报告的"预期成果"（300字），课题：《${p.title}》` },
    { id: 'budget',      name: '经费预算',       prompt: (p) => `生成开题报告的"经费预算"表格，课题：《${p.title}》` },
    { id: 'references',  name: '参考文献',       prompt: (p) => `生成开题报告的"参考文献"（20篇以上，格式规范），课题：《${p.title}》，学科=${p.subject}` },
  ],

  zhongqi: [
    { id: 'progress',     name: '研究进展情况',   prompt: (p) => `生成中期检查报告的"研究进展情况"（600字），课题：《${p.title}》，进展：${p.progress}` },
    { id: 'achievements', name: '阶段性成果',     prompt: (p) => `生成中期检查报告的"阶段性成果"（400字），课题：《${p.title}》` },
    { id: 'issues',       name: '存在问题与对策', prompt: (p) => `生成中期检查报告的"存在问题与对策"（400字），课题：《${p.title}》` },
    { id: 'next',         name: '下一步计划',     prompt: (p) => `生成中期检查报告的"下一步研究计划"（400字），课题：《${p.title}》` },
    { id: 'budget',       name: '经费使用情况',   prompt: (p) => `生成中期检查报告的"经费使用情况"表格，课题：《${p.title}》` },
  ],

  jieti: [
    { id: 'summary',      name: '研究工作总结',   prompt: (p) => `生成结题报告的"研究工作总结"（800字），课题：《${p.title}》，成果：${p.achievements}` },
    { id: 'results',      name: '主要研究成果',   prompt: (p) => `生成结题报告的"主要研究成果"（600字，详细描述），课题：《${p.title}》` },
    { id: 'innovation',   name: '研究创新点',     prompt: (p) => `生成结题报告的"研究创新点"（300字），课题：《${p.title}》` },
    { id: 'value',        name: '应用价值',       prompt: (p) => `生成结题报告的"应用价值"（300字），课题：《${p.title}》` },
    { id: 'issues',       name: '存在问题与建议', prompt: (p) => `生成结题报告的"存在问题与建议"（300字），课题：《${p.title}》` },
    { id: 'list',         name: '成果清单',       prompt: (p) => `生成结题报告的"成果清单"表格，课题：《${p.title}》，成果：${p.achievements}` },
    { id: 'budget',       name: '经费决算',       prompt: (p) => `生成结题报告的"经费决算"表格，课题：《${p.title}》` },
    { id: 'references',   name: '参考文献',       prompt: (p) => `生成结题报告的"参考文献"（20篇以上），课题：《${p.title}》` },
  ],
};

// Critic 评分 prompt
const CRITIC_PROMPT = `你是一位严格的教育科研评审专家。请对以下课题文档章节进行评分（1-10分）。

评分标准：
- 内容完整性（是否覆盖该章节应有的所有要素）
- 学术规范性（格式、引用、表述是否符合规范）
- 逻辑严密性（论证是否有说服力）
- 实用性（是否符合中国教育科研实际）

请严格按以下格式输出（不要输出其他内容）：
SCORE: [数字1-10]
ISSUES: [问题列表，每条一行，如果没有问题则写"无"]
SUGGESTION: [最重要的一条改进建议]`;

export class GeneratorAgent extends BaseAgent {
  constructor() {
    super('GeneratorAgent', '并行章节生成 + Critic 循环');
    this.criticThreshold = 7;  // 低于7分重写
    this.maxRetries = 2;
  }

  /**
   * @param {{ docType, params, literatureContext, onProgress }} task
   * onProgress(sectionId, status, score) - 进度回调
   */
  async run({ docType, params, literatureContext = null, onProgress }) {
    const sections = SECTIONS[docType];
    if (!sections) throw new Error(`未知文档类型: ${docType}`);

    // 第一轮：并行生成所有章节
    onProgress?.('__all__', 'generating', null);

    const results = await Promise.all(
      sections.map(async (section) => {
        onProgress?.(section.id, 'generating', null);
        const content = await this.#generateSection(section, params, literatureContext);
        onProgress?.(section.id, 'reviewing', null);
        return { section, content };
      })
    );

    // 第二轮：Critic 评分 + 重写低分章节
    const finalSections = await Promise.all(
      results.map(async ({ section, content }) => {
        let current = content;
        let score = 0;

        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
          const critique = await this.#critiqueSection(section.name, current);
          score = critique.score;
          onProgress?.(section.id, 'scored', score);

          if (score >= this.criticThreshold) break;

          // 重写
          onProgress?.(section.id, 'rewriting', score);
          current = await this.#rewriteSection(section, params, current, critique);
        }

        return { id: section.id, name: section.name, content: current, score };
      })
    );

    // 拼接最终文档
    const fullContent = finalSections
      .map(s => `## ${s.name}\n\n${s.content}`)
      .join('\n\n---\n\n');

    const title = this.#extractTitle(finalSections[0]?.content, params);
    const avgScore = finalSections.reduce((sum, s) => sum + s.score, 0) / finalSections.length;

    return {
      content: fullContent,
      title,
      wordCount: fullContent.length,
      sections: finalSections.map(s => ({ id: s.id, name: s.name, score: s.score })),
      avgScore: Math.round(avgScore * 10) / 10,
    };
  }

  async #generateSection(section, params, literatureContext = null) {
    const userPrompt = section.prompt(params);
    // 只在参考文献章节注入文献上下文
    const fullPrompt = (literatureContext && section.id === 'references')
      ? `${userPrompt}\n\n以下是搜索到的相关真实文献，请优先使用这些文献（可补充你知识库中的文献）：\n\n${literatureContext}`
      : userPrompt;
    return callAI(EXPERT_SYSTEM_PROMPT, fullPrompt, { maxTokens: 2000 });
  }

  async #critiqueSection(sectionName, content) {
    const response = await callAI(
      CRITIC_PROMPT,
      `章节名称：${sectionName}\n\n内容：\n${content}`,
      { maxTokens: 500, temperature: 0.3 }
    );

    const scoreMatch = response.match(/SCORE:\s*(\d+)/);
    const issuesMatch = response.match(/ISSUES:\s*([\s\S]*?)(?=SUGGESTION:|$)/);
    const suggestionMatch = response.match(/SUGGESTION:\s*([\s\S]*?)$/);

    return {
      score: scoreMatch ? Math.min(10, Math.max(1, parseInt(scoreMatch[1]))) : 6,
      issues: issuesMatch?.[1]?.trim() ?? '',
      suggestion: suggestionMatch?.[1]?.trim() ?? '',
    };
  }

  async #rewriteSection(section, params, originalContent, critique) {
    const rewritePrompt = `请重写以下课题文档章节，解决评审专家指出的问题。

章节：${section.name}
原始内容：
${originalContent}

评审问题：
${critique.issues}

改进建议：
${critique.suggestion}

请在保持原有结构的基础上，针对以上问题进行改进，输出完整的改写版本。`;

    return callAI(EXPERT_SYSTEM_PROMPT, rewritePrompt, { maxTokens: 2000 });
  }

  #extractTitle(firstSectionContent, params) {
    if (!firstSectionContent) return params.title || '课题文档';
    const match = firstSectionContent.match(/《(.+?)》/);
    return match?.[1] ?? params.title ?? `${params.subject || ''}${params.grade || ''}课题`;
  }
}

export { SECTIONS };
