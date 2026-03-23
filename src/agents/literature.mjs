/**
 * Literature Agent - 联网搜索真实学术文献
 *
 * 支持：
 * - Tavily API（推荐，有免费额度）
 * - 降级：用 AI 生成高质量文献（标注为"建议文献"）
 */

import { BaseAgent } from './base.mjs';
import { callAI } from '../services/ai.mjs';
import { cfg } from '../config.mjs';

const TAVILY_URL = 'https://api.tavily.com/search';

export class LiteratureAgent extends BaseAgent {
  constructor() {
    super('LiteratureAgent', '搜索真实学术文献，为生成提供真实引用');
  }

  /**
   * @param {{ subject, direction, grade, docType }} task
   * @returns {{ results: Array, summary: string, source: 'tavily'|'ai' }}
   */
  async run({ subject, direction, grade, docType }) {
    const queries = this.#buildQueries(subject, direction, grade);

    // 优先用 Tavily
    if (cfg.tavily?.apiKey) {
      try {
        const results = await this.#searchTavily(queries);
        if (results.length > 0) {
          const summary = this.#formatLiterature(results);
          return { results, summary, source: 'tavily' };
        }
      } catch (e) {
        console.warn('Tavily search failed, falling back to AI:', e.message);
      }
    }

    // 降级：AI 生成高质量文献建议
    const summary = await this.#generateLiteratureWithAI(subject, direction, grade);
    return { results: [], summary, source: 'ai' };
  }

  async #searchTavily(queries) {
    const allResults = [];

    for (const query of queries.slice(0, 3)) {
      const res = await fetch(TAVILY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: cfg.tavily.apiKey,
          query,
          search_depth: 'advanced',
          include_domains: [
            'cnki.net', 'wanfangdata.com.cn', 'cqvip.com',
            'edu.cn', 'cssci.com', 'scholar.google.com'
          ],
          max_results: 5,
        }),
      });

      if (!res.ok) throw new Error(`Tavily error: ${res.status}`);
      const data = await res.json();

      for (const r of data.results ?? []) {
        allResults.push({
          title: r.title,
          url: r.url,
          snippet: r.content?.slice(0, 200),
          published_date: r.published_date,
        });
      }
    }

    return allResults.slice(0, 12);
  }

  async #generateLiteratureWithAI(subject, direction, grade) {
    const prompt = `请为以下课题研究生成一份高质量的参考文献列表（用于课题申报书）：
学科：${subject}，研究方向：${direction}，学段：${grade}

要求：
1. 生成30篇参考文献，格式严格规范
2. 近3年（2022-2025）文献占60%以上
3. 核心期刊（CSSCI/北大核心）占40%以上
4. 外文文献占20%以上
5. 文献必须是真实存在的（你知识库中确认存在的），不要杜撰
6. 格式：[序号] 作者. 标题[J]. 期刊名, 年份, 卷(期): 页码.

直接输出文献列表，不要其他内容。`;

    return callAI(
      '你是一位教育科研文献专家，熟悉中国教育类核心期刊。',
      prompt,
      { maxTokens: 3000, temperature: 0.3 }
    );
  }

  #buildQueries(subject, direction, grade) {
    return [
      `${subject} ${direction} ${grade} 教育研究 核心期刊 2023 2024`,
      `${direction} 教学研究 实证研究 CSSCI`,
      `${subject}教学 ${direction} 课题研究`,
    ];
  }

  #formatLiterature(results) {
    return results.map((r, i) =>
      `[${i + 1}] ${r.title}. ${r.url}${r.published_date ? ` (${r.published_date})` : ''}`
    ).join('\n');
  }
}
