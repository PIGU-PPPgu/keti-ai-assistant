/**
 * Optimizer Agent - 多维评分 + 循环优化
 *
 * 评分维度（各 10 分）：
 *   TextQuality   (40%) — 学术深度、去AI化、引用规范、逻辑严密
 *   LayoutQuality (30%) — 结构完整、层次清晰、段落合理、标题规范
 *   DiagramQuality(30%) — 图表相关性、信息密度、类型匹配（无图章节不扣分）
 *
 * 综合分 = 0.4*T + 0.3*L + 0.3*D
 * 目标分 = 9.0，最多 10 轮，每轮针对最弱维度定向优化
 */

import { BaseAgent } from './base.mjs';
import { callAIWithModel, EXPERT_SYSTEM_PROMPT } from '../services/ai.mjs';
import { DiagramAgent } from './diagram.mjs';

const TARGET_SCORE = 9.0;
const MAX_ROUNDS   = 10;

// ── 评分 Prompt ──────────────────────────────────────────────────
const SCORER_SYSTEM = `你是严格的教育科研文档质量评审专家。对文档章节进行三维评分，每维 1-10 分。

评分标准：

【文字质量 TextQuality】
- 10分：学术深度极高，有具体数据/政策/案例支撑，无AI痕迹，引用规范
- 8-9分：内容充实，逻辑严密，偶有套话但不影响整体
- 6-7分：内容基本完整，但有明显AI生成痕迹（过度排比、空洞表述）
- <6分：内容空泛，大量套话，缺乏实质内容

【排版结构 LayoutQuality】
- 10分：层次清晰，标题规范，段落合理，表格整洁，无冗余
- 8-9分：结构基本合理，偶有冗余标题或段落过长
- 6-7分：结构混乱或标题重复，段落划分不合理
- <6分：无结构，一段到底，或标题嵌套混乱

【图表质量 DiagramQuality】（无图章节给 8 分基准分）
- 10分：图表与内容高度相关，信息密度适中，类型选择恰当
- 8-9分：图表基本相关，但信息略简单或类型不够精准
- 6-7分：图表与内容关联弱，或 Mermaid 语法有问题
- <6分：图表完全不相关，或缺少应有的图表

严格按格式输出（不要多余文字）：
TEXT: [分数]
LAYOUT: [分数]
DIAGRAM: [分数]
COMPOSITE: [综合分，保留1位小数]
WEAKEST: [text|layout|diagram]
ISSUES: [最主要的3个问题，用|分隔]
PRIORITY: [最需要优化的具体内容，一句话]`;

// ── 优化 Prompt 模板 ─────────────────────────────────────────────
const OPTIMIZE_PROMPTS = {
  text: (sectionName, issues, priority, content) =>
    `请优化以下"${sectionName}"章节的文字质量。

主要问题：${issues}
优化重点：${priority}

优化要求：
1. 消除AI生成痕迹（减少排比句、套话、空洞表述）
2. 增加具体数据、政策文件引用、教学案例
3. 加入教师视角的实践观察
4. 保持学术规范，引用格式正确
5. 保留原有结构和核心内容，只改写文字

原文：
${content}

直接输出优化后的完整章节内容，不要任何说明：`,

  layout: (sectionName, issues, priority, content) =>
    `请优化以下"${sectionName}"章节的排版结构。

主要问题：${issues}
优化重点：${priority}

优化要求：
1. 规范标题层级（## 一级，### 二级，#### 三级）
2. 删除重复标题（如"## 研究背景"和"# 课题申报书：研究背景"只保留一个）
3. 合理划分段落（每段不超过200字）
4. 表格格式规范，列宽合理
5. 保留所有 Mermaid 图表代码块不变

原文：
${content}

直接输出优化后的完整章节内容，不要任何说明：`,

  diagram: (sectionName, issues, priority, content, params) =>
    `请为"${sectionName}"章节优化或新增图表。

主要问题：${issues}
优化重点：${priority}
课题信息：学科=${params?.subject}，方向=${params?.direction}

要求：
1. 如果已有图表，改进其内容相关性和信息密度
2. 如果没有图表，在合适位置新增一个 Mermaid 图表
3. 图表类型选择：框架/流程用 flowchart，目标/概念用 mindmap，时间计划用 gantt
4. 图表节点 8-12 个，中文标签用双引号
5. 保留原有文字内容不变

原文：
${content}

直接输出优化后的完整章节内容（包含图表），不要任何说明：`,
};

// ── OptimizerAgent ───────────────────────────────────────────────
export class OptimizerAgent extends BaseAgent {
  constructor() {
    super('OptimizerAgent', '多维评分循环优化，最多10轮');
  }

  /**
   * @param {object} opts
   * @param {Array}  opts.sections   - [{id, name, content, score}]
   * @param {object} opts.params     - 课题参数
   * @param {function} opts.onRound  - (round, scores, improvements) => void
   * @returns {{ sections, rounds, finalScore }}
   */
  async run({ sections, params, onRound }) {
    let current = sections.map(s => ({ ...s }));
    const history = [];

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      // ── 1. 评分所有章节 ──────────────────────────────────────
      const scored = await this.#scoreAll(current);
      const composite = this.#avgComposite(scored);

      onRound?.('scoring', { round, composite, sections: scored.map(s => ({
        id: s.id, name: s.name,
        text: s.scores.text, layout: s.scores.layout, diagram: s.scores.diagram,
        composite: s.scores.composite,
      }))});

      history.push({ round, composite, scores: scored.map(s => ({ id: s.id, ...s.scores })) });

      // ── 2. 达标则提前停止 ────────────────────────────────────
      if (composite >= TARGET_SCORE) {
        onRound?.('done', { round, composite, reason: `达到目标分 ${TARGET_SCORE}，提前停止` });
        current = scored;
        break;
      }

      // ── 3. 找最弱章节（按综合分排序，取最低的3个）──────────
      const weakest = [...scored]
        .sort((a, b) => a.scores.composite - b.scores.composite)
        .slice(0, 3);

      onRound?.('optimizing', { round, composite, targets: weakest.map(s => ({
        id: s.id, name: s.name, composite: s.scores.composite, weakest: s.scores.weakest,
      }))});

      // ── 4. 并行优化最弱章节 ──────────────────────────────────
      const improved = await Promise.all(weakest.map(async (section) => {
        try {
          const newContent = await this.#optimizeSection(section, params);
          return { ...section, content: newContent, improved: true };
        } catch (e) {
          console.warn(`Optimizer [${section.id}] failed:`, e.message);
          return section;
        }
      }));

      // 更新 current
      const improvedMap = Object.fromEntries(improved.map(s => [s.id, s]));
      current = scored.map(s => improvedMap[s.id] ? { ...s, content: improvedMap[s.id].content } : s);

      onRound?.('round_done', { round, composite, improved: improved.filter(s => s.improved).map(s => s.id) });

      // 最后一轮不需要等待
      if (round < MAX_ROUNDS) await new Promise(r => setTimeout(r, 500));
    }

    // 最终评分
    const finalScored = await this.#scoreAll(current);
    const finalScore = this.#avgComposite(finalScored);

    return {
      sections: finalScored,
      rounds: history.length,
      finalScore,
      content: finalScored.map(s => `## ${s.name}\n\n${s.content}`).join('\n\n---\n\n'),
    };
  }

  // ── 评分单章节 ───────────────────────────────────────────────
  async #scoreSection(section) {
    try {
      const response = await callAIWithModel(
        SCORER_SYSTEM,
        `章节名称：${section.name}\n\n章节内容（前2000字）：\n${section.content.slice(0, 2000)}`,
        'fast',
        { maxTokens: 400, temperature: 0.2 }
      );

      const text    = parseFloat(response.match(/TEXT:\s*(\d+\.?\d*)/)?.[1] || '7');
      const layout  = parseFloat(response.match(/LAYOUT:\s*(\d+\.?\d*)/)?.[1] || '7');
      const diagram = parseFloat(response.match(/DIAGRAM:\s*(\d+\.?\d*)/)?.[1] || '8');
      const weakest = response.match(/WEAKEST:\s*(\w+)/)?.[1]?.toLowerCase() || 'text';
      const issues  = response.match(/ISSUES:\s*(.+)/)?.[1] || '';
      const priority = response.match(/PRIORITY:\s*(.+)/)?.[1] || '';
      const composite = Math.round((text * 0.4 + layout * 0.3 + diagram * 0.3) * 10) / 10;

      return { text, layout, diagram, composite, weakest, issues, priority };
    } catch (e) {
      return { text: 7, layout: 7, diagram: 8, composite: 7.3, weakest: 'text', issues: '评分失败', priority: '' };
    }
  }

  async #scoreAll(sections) {
    // 并行评分，但限制并发数避免 429
    const results = [];
    for (let i = 0; i < sections.length; i += 3) {
      const batch = sections.slice(i, i + 3);
      const scored = await Promise.all(batch.map(async s => ({
        ...s,
        scores: await this.#scoreSection(s),
      })));
      results.push(...scored);
      if (i + 3 < sections.length) await new Promise(r => setTimeout(r, 800));
    }
    return results;
  }

  #avgComposite(scored) {
    const sum = scored.reduce((acc, s) => acc + s.scores.composite, 0);
    return Math.round(sum / scored.length * 10) / 10;
  }

  // ── 优化单章节 ───────────────────────────────────────────────
  async #optimizeSection(section, params) {
    const { weakest, issues, priority } = section.scores;
    const promptFn = OPTIMIZE_PROMPTS[weakest] || OPTIMIZE_PROMPTS.text;

    const prompt = weakest === 'diagram'
      ? promptFn(section.name, issues, priority, section.content, params)
      : promptFn(section.name, issues, priority, section.content);

    const result = await callAIWithModel(
      EXPERT_SYSTEM_PROMPT,
      prompt,
      'main',
      { maxTokens: 3000, temperature: 0.7 }
    );

    return result.trim() || section.content;
  }
}
