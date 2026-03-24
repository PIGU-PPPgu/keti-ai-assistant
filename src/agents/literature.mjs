/**
 * Literature Agent v2 - 联网搜索真实学术文献
 *
 * 优先级：
 * 1. GLM web_search 工具调用（Coding Plan 内置，不需要额外 key）
 * 2. Tavily API（如果配置了）
 * 3. AI 生成高质量文献建议（降级）
 */

import { BaseAgent } from './base.mjs';
import { callAI } from '../services/ai.mjs';
import { cfg } from '../config.mjs';

export class LiteratureAgent extends BaseAgent {
  constructor() {
    super('LiteratureAgent', '搜索真实学术文献，为生成提供真实引用');
  }

  async run({ subject, direction, grade, docType }) {
    // 优先用 GLM web_search（内置工具调用）
    try {
      const results = await this.#searchWithGLM(subject, direction, grade);
      if (results.length > 0) {
        return { results, summary: this.#formatResults(results), source: 'glm-search' };
      }
    } catch (e) {
      console.warn('GLM web_search failed:', e.message);
    }

    // 次选 Tavily
    if (cfg.tavily?.apiKey) {
      try {
        const results = await this.#searchTavily(subject, direction, grade);
        if (results.length > 0) {
          return { results, summary: this.#formatResults(results), source: 'tavily' };
        }
      } catch (e) {
        console.warn('Tavily failed:', e.message);
      }
    }

    // 降级：AI 生成
    const summary = await this.#generateWithAI(subject, direction, grade);
    return { results: [], summary, source: 'ai' };
  }

  async #searchWithGLM(subject, direction, grade) {
    const query = `${subject} ${direction} ${grade} 教育研究 核心期刊 CSSCI 2022 2023 2024`;

    const res = await fetch(cfg.aiEndpoints[cfg.ai.provider], {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.ai.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.ai.model,
        messages: [
          {
            role: 'user',
            content: `请搜索关于"${subject}学科${grade}${direction}"的学术文献，找出近3年（2022-2025）发表在核心期刊的真实论文，列出论文标题、作者、期刊、年份。`,
          },
        ],
        tools: [{ type: 'web_search' }],
        max_tokens: 2000,
      }),
    });

    if (!res.ok) throw new Error(`GLM API error: ${res.status}`);
    const data = await res.json();

    const content = data.choices?.[0]?.message?.content ?? '';
    // 解析返回的文献信息
    return this.#parseGLMResults(content);
  }

  #parseGLMResults(content) {
    const results = [];
    // 匹配常见的文献格式
    const patterns = [
      /《(.+?)》[，,]?\s*(.+?)[，,]\s*《?(.+?)》?\s*[，,]?\s*(\d{4})/g,
      /\d+[.、]\s*(.+?)[，,。]\s*(.+?)[，,]\s*《?(.+?)》?\s*[，,]?\s*(\d{4})/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null && results.length < 15) {
        results.push({
          title: match[1]?.trim(),
          author: match[2]?.trim(),
          journal: match[3]?.trim(),
          year: match[4],
          snippet: '',
        });
      }
    }

    return results;
  }

  async #searchTavily(subject, direction, grade) {
    const query = `${subject} ${direction} ${grade} 教育研究 核心期刊 2023 2024`;
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: cfg.tavily.apiKey,
        query,
        search_depth: 'advanced',
        include_domains: ['cnki.net', 'wanfangdata.com.cn', 'edu.cn'],
        max_results: 8,
      }),
    });
    if (!res.ok) throw new Error(`Tavily error: ${res.status}`);
    const data = await res.json();
    return (data.results ?? []).map(r => ({
      title: r.title, url: r.url, snippet: r.content?.slice(0, 150), year: r.published_date?.slice(0, 4),
    }));
  }

  async #generateWithAI(subject, direction, grade) {
    return callAI(
      '你是教育科研文献专家，熟悉中国教育类核心期刊。',
      `请为"${subject}学科${grade}${direction}"课题生成30篇参考文献列表。
要求：近3年≥60%，CSSCI/北大核心≥40%，外文≥20%，格式：[序号] 作者. 标题[J]. 期刊, 年份, 卷(期): 页码.
只输出文献列表。`,
      { maxTokens: 3000, temperature: 0.3 }
    );
  }

  #formatResults(results) {
    return results.map((r, i) =>
      `[${i + 1}] ${r.title}${r.author ? ` / ${r.author}` : ''}${r.journal ? ` / ${r.journal}` : ''}${r.year ? ` (${r.year})` : ''}`
    ).join('\n');
  }
}
