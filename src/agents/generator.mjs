/**
 * Generator Agent v3 - 串行生成 + 分层模型 + Critic 循环
 *
 * 模型分层：
 * - 核心章节（背景/文献/方法）→ 主模型（glm-5）
 * - 简单章节（预算/基本信息）→ 快速模型（glm-4-flash）
 * - Critic 评分 → 快速模型
 *
 * 串行生成避免 429，每章之间加 500ms 间隔
 */

import { BaseAgent } from './base.mjs';
import { callAI, callAIWithModel, EXPERT_SYSTEM_PROMPT } from '../services/ai.mjs';

// 章节定义 + 模型分层
const SECTIONS = {
  shenbao: [
    { id: 'title',       name: '基本信息',       tier: 'main',  prompt: (p) => `生成课题申报书的"基本信息"部分，包括课题名称（如未提供则自动生成符合${p.level}水平的名称）、研究背景一句话概述、主持人信息表格。参数：级别=${p.level}，学科=${p.subject}，学段=${p.grade}，方向=${p.direction}${p.title?`，课题名=${p.title}`:''}` + '\n\n个人信息字段必须使用以下占位符格式（不要填写真实信息）：申请人姓名用【待填写：申请人姓名】，工作单位用【待填写：工作单位】，职称/职务用【待填写：职称/职务】，联系电话用【待填写：联系电话】，电子邮箱用【待填写：电子邮箱】，合作者姓名用【待填写：合作者姓名】，合作者单位用【待填写：合作者单位】' },
    { id: 'background',  name: '研究背景与意义', tier: 'main',  prompt: (p) => `生成课题申报书的"研究背景与意义"章节（800-1200字）。学科=${p.subject}，学段=${p.grade}，研究方向=${p.direction}，级别=${p.level}。从政策背景、学科现状、实践需求三个维度展开，引用近3年教育政策文件，逻辑严密。` },
    { id: 'literature',  name: '研究现状述评',   tier: 'main',  prompt: (p) => `生成课题申报书的"研究现状述评"章节（800-1200字）。学科=${p.subject}，研究方向=${p.direction}。梳理国内外研究现状，指出研究空白，引用真实文献（格式：作者. 标题[J]. 期刊, 年份），至少引用8篇，近3年文献占60%以上。` },
    { id: 'objectives',  name: '研究目标与内容', tier: 'main',  prompt: (p) => `生成课题申报书的"研究目标与内容"章节（600-800字）。学科=${p.subject}，学段=${p.grade}，方向=${p.direction}。研究目标3-4条（可量化），研究内容4-5个子课题，层次清晰。` },
    { id: 'framework',   name: '研究框架',       tier: 'main',  prompt: (p) => `生成课题申报书的"研究框架与理论基础"章节（500-700字）。学科=${p.subject}，方向=${p.direction}。列出2-3个支撑理论，说明理论与本研究的关联。` },
    { id: 'innovation',  name: '重难点与创新',   tier: 'main',  prompt: (p) => `生成课题申报书的"研究重难点与创新之处"章节（400-600字）。学科=${p.subject}，方向=${p.direction}，级别=${p.level}。研究重点2-3条，难点2-3条，创新点2-3条（具体实在，不夸大）。` },
    { id: 'methodology', name: '研究方法与计划', tier: 'main',  prompt: (p) => `生成课题申报书的"研究方法与实施计划"章节（600-800字）。级别=${p.level}，研究周期=2年。研究方法4-5种，实施计划按阶段列出，时间节点具体可执行。` },
    { id: 'results',     name: '预期成果',       tier: 'main',  prompt: (p) => `生成课题申报书的"预期研究成果"章节（300-400字）。学科=${p.subject}，级别=${p.level}。成果分类列出（论文、案例集、资源包等），数量具体。` },
    { id: 'budget',      name: '经费预算',       tier: 'main',  prompt: (p) => `生成课题申报书的"经费预算"章节（表格形式）。级别=${p.level}。列出经费明细，总额符合${p.level}课题惯例（区级1-3万，市级3-10万，省级10-30万）。` },
    { id: 'references',  name: '参考文献',       tier: 'main',  prompt: (p, lit) => `生成课题申报书的"参考文献"列表。学科=${p.subject}，方向=${p.direction}。至少30篇，格式：[序号] 作者. 标题[J]. 期刊, 年份, 卷(期): 页码. 近3年≥60%，核心期刊≥40%，外文≥20%。${lit?`\n\n参考以下真实文献（优先使用）：\n${lit}`:''}` },
  ],
  kaiti: [
    { id: 'plan',        name: '研究方案',   tier: 'main', prompt: (p) => `生成开题报告的"课题研究方案"（800字），课题：《${p.title}》，学科=${p.subject}，学段=${p.grade}` + '\n\n个人信息字段必须使用以下占位符格式（不要填写真实信息）：申请人姓名用【待填写：申请人姓名】，工作单位用【待填写：工作单位】，职称/职务用【待填写：职称/职务】，联系电话用【待填写：联系电话】，电子邮箱用【待填写：电子邮箱】，合作者姓名用【待填写：合作者姓名】，合作者单位用【待填写：合作者单位】' },
    { id: 'literature',  name: '文献综述',   tier: 'main', prompt: (p) => `生成开题报告的"文献综述"（600字，引用15篇以上），课题：《${p.title}》` },
    { id: 'methodology', name: '研究方法',   tier: 'main', prompt: (p) => `生成开题报告的"研究方法详解"（400字），课题：《${p.title}》` },
    { id: 'timeline',    name: '时间安排',   tier: 'main', prompt: (p) => `生成开题报告的"时间安排"（Markdown表格，甘特图形式），课题：《${p.title}》，研究周期2年` },
    { id: 'results',     name: '预期成果',   tier: 'main', prompt: (p) => `生成开题报告的"预期成果"（300字），课题：《${p.title}》` },
    { id: 'budget',      name: '经费预算',   tier: 'main', prompt: (p) => `生成开题报告的"经费预算"表格，课题：《${p.title}》` },
    { id: 'references',  name: '参考文献',   tier: 'main', prompt: (p) => `生成开题报告的"参考文献"（20篇以上，格式规范），课题：《${p.title}》，学科=${p.subject}` },
  ],
  zhongqi: [
    { id: 'progress',     name: '研究进展',   tier: 'main', prompt: (p) => `生成中期检查报告的"研究进展情况"（600字），课题：《${p.title}》，进展：${p.progress}` + '\n\n个人信息字段必须使用以下占位符格式（不要填写真实信息）：申请人姓名用【待填写：申请人姓名】，工作单位用【待填写：工作单位】，职称/职务用【待填写：职称/职务】，联系电话用【待填写：联系电话】，电子邮箱用【待填写：电子邮箱】，合作者姓名用【待填写：合作者姓名】，合作者单位用【待填写：合作者单位】' },
    { id: 'achievements', name: '阶段成果',   tier: 'main', prompt: (p) => `生成中期检查报告的"阶段性成果"（400字），课题：《${p.title}》` },
    { id: 'issues',       name: '问题与对策', tier: 'main', prompt: (p) => `生成中期检查报告的"存在问题与对策"（400字），课题：《${p.title}》` },
    { id: 'next',         name: '下一步计划', tier: 'main', prompt: (p) => `生成中期检查报告的"下一步研究计划"（400字），课题：《${p.title}》` },
    { id: 'budget',       name: '经费使用',   tier: 'main', prompt: (p) => `生成中期检查报告的"经费使用情况"表格，课题：《${p.title}》` },
  ],
  jieti: [
    { id: 'summary',      name: '工作总结',   tier: 'main', prompt: (p) => `生成结题报告的"研究工作总结"（800字），课题：《${p.title}》，成果：${p.achievements}` + '\n\n个人信息字段必须使用以下占位符格式（不要填写真实信息）：申请人姓名用【待填写：申请人姓名】，工作单位用【待填写：工作单位】，职称/职务用【待填写：职称/职务】，联系电话用【待填写：联系电话】，电子邮箱用【待填写：电子邮箱】，合作者姓名用【待填写：合作者姓名】，合作者单位用【待填写：合作者单位】' },
    { id: 'results',      name: '研究成果',   tier: 'main', prompt: (p) => `生成结题报告的"主要研究成果"（600字），课题：《${p.title}》` },
    { id: 'innovation',   name: '创新点',     tier: 'main', prompt: (p) => `生成结题报告的"研究创新点"（300字），课题：《${p.title}》` },
    { id: 'value',        name: '应用价值',   tier: 'main', prompt: (p) => `生成结题报告的"应用价值"（300字），课题：《${p.title}》` },
    { id: 'issues',       name: '问题建议',   tier: 'main', prompt: (p) => `生成结题报告的"存在问题与建议"（300字），课题：《${p.title}》` },
    { id: 'list',         name: '成果清单',   tier: 'main', prompt: (p) => `生成结题报告的"成果清单"表格，课题：《${p.title}》，成果：${p.achievements}` },
    { id: 'budget',       name: '经费决算',   tier: 'main', prompt: (p) => `生成结题报告的"经费决算"表格，课题：《${p.title}》` },
    { id: 'references',   name: '参考文献',   tier: 'main', prompt: (p) => `生成结题报告的"参考文献"（20篇以上），课题：《${p.title}》` },
  ],
};

const CRITIC_SYSTEM = `你是严格的教育科研评审专家。对以下章节评分（1-10分）。
评分标准：
- 内容完整性（是否覆盖该章节应有的所有要素）
- 学术规范性（引用格式、术语使用、逻辑严密）
- 实质深度（是否有具体数据、案例、政策依据，而非空泛表述）
- 去AI化程度（是否有明显的AI生成痕迹：过度排比、空洞套话、缺乏细节）

评分参考：9-10=专家级，7-8=合格，5-6=需改进，<5=不合格
严格按格式输出：
SCORE: [数字]
ISSUES: [具体问题，指出哪些句子/段落有问题]
SUGGESTION: [最重要的一条具体改进建议，要可操作]`;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export class GeneratorAgent extends BaseAgent {
  constructor() {
    super('GeneratorAgent', '串行章节生成 + 分层模型 + Critic 循环');
    this.criticThreshold = 7;
    this.maxRetries = 2; // 降为1次重写，减少 API 调用
  }

  async run({ docType, params, literatureContext = null, onProgress }) {
    const sections = SECTIONS[docType];
    if (!sections) throw new Error(`未知文档类型: ${docType}`);

    onProgress?.('__all__', 'generating', null);
    const finalSections = [];

    // 串行生成，每章之间间隔 800ms 避免 429
    for (const section of sections) {
      onProgress?.(section.id, 'generating', null);

      // 文献上下文注入核心章节（不只是 references）
      const lit = ['references', 'literature', 'background', 'framework'].includes(section.id)
        ? literatureContext : null;

      // 前置章节上下文（让后面章节保持一致性）
      const prevContext = finalSections.length > 0
        ? `\n\n【已生成的前置章节摘要，请保持内容一致】\n${
            finalSections.slice(-3).map(s => `${s.name}：${s.content.slice(0, 300)}...`).join('\n')
          }`
        : '';

      let content = await callAIWithModel(
        EXPERT_SYSTEM_PROMPT,
        section.prompt(params, lit) + prevContext,
        section.tier === 'main' ? 'main' : 'fast',
        { maxTokens: 2000 }
      );

      // Critic 评分
      onProgress?.(section.id, 'reviewing', null);
      const critique = await this.#critique(section.name, content);
      onProgress?.(section.id, 'scored', critique.score);

      // 低分重写（只重写一次）
      if (critique.score < this.criticThreshold) {
        onProgress?.(section.id, 'rewriting', critique.score);
        content = await callAIWithModel(
          EXPERT_SYSTEM_PROMPT,
          `请改进以下章节，解决问题：${critique.issues}\n建议：${critique.suggestion}\n\n原文：\n${content}`,
          section.tier === 'main' ? 'main' : 'fast',
          { maxTokens: 2000 }
        );
        const recheck = await this.#critique(section.name, content);
        onProgress?.(section.id, 'scored', recheck.score);
        critique.score = recheck.score;
      }

      finalSections.push({ id: section.id, name: section.name, content, score: critique.score });

      // DiagramAgent：每章节智能判断是否需要配图
      try {
        const { DiagramAgent } = await import('./diagram.mjs');
        const diagramAgent = new DiagramAgent();
        onProgress?.(section.id, 'diagram_checking', null);
        const diagram = await diagramAgent.run({ sectionId: section.id, content, params });
        if (diagram.hasDiagram) {
          content += `\n\n**📊 ${diagram.caption || section.name + '示意图'}**\n\n\`\`\`mermaid\n${diagram.mermaid}\n\`\`\``;
          finalSections[finalSections.length - 1].content = content;
          finalSections[finalSections.length - 1].diagram = diagram;
          onProgress?.(section.id, 'diagram_done', null, content);
        }
      } catch (e) { /* 图生成失败不影响主流程 */ }

      // 章节完成后立即推送内容（实时预览）
      onProgress?.(section.id, 'done', critique.score, content);

      // 间隔避免限速
      await sleep(1200);
    }

    const fullContent = finalSections.map(s => `## ${s.name}\n\n${s.content}`).join('\n\n---\n\n');
    const title = this.#extractTitle(finalSections[0]?.content, params);
    const avgScore = finalSections.reduce((s, x) => s + x.score, 0) / finalSections.length;

    const placeholderRegex = /【待填写：([^】]+)】/g;
    const placeholders = [];
    const seen = new Set();
    let match;
    while ((match = placeholderRegex.exec(fullContent)) !== null) {
      if (!seen.has(match[1])) { seen.add(match[1]); placeholders.push(match[1]); }
    }

    return {
      content: fullContent,
      title,
      wordCount: fullContent.length,
      sections: finalSections.map(s => ({ id: s.id, name: s.name, score: s.score })),
      avgScore: Math.round(avgScore * 10) / 10,
      placeholders,
    };
  }

  async #critique(sectionName, content) {
    try {
      const response = await callAIWithModel(
        CRITIC_SYSTEM,
        `章节：${sectionName}\n\n${content.slice(0, 1500)}`,
        'fast',
        { maxTokens: 300, temperature: 0.3 }
      );
      const score = parseInt(response.match(/SCORE:\s*(\d+)/)?.[1] ?? '7');
      const issues = response.match(/ISSUES:\s*([\s\S]*?)(?=SUGGESTION:|$)/)?.[1]?.trim() ?? '';
      const suggestion = response.match(/SUGGESTION:\s*([\s\S]*?)$/)?.[1]?.trim() ?? '';
      return { score: Math.min(10, Math.max(1, score)), issues, suggestion };
    } catch {
      return { score: 7, issues: '', suggestion: '' };
    }
  }

  #extractTitle(content, params) {
    if (!content) return params.title || '课题文档';
    return content.match(/《(.+?)》/)?.[1] ?? params.title ?? `${params.subject||''}${params.grade||''}课题`;
  }
}

export { SECTIONS };
