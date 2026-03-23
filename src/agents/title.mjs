/**
 * Title Agent - 生成高质量课题名称
 * 专门负责生成符合各级别规范的课题名
 */

import { BaseAgent } from './base.mjs';
import { callAI } from '../services/ai.mjs';

export class TitleAgent extends BaseAgent {
  constructor() {
    super('TitleAgent', '生成符合规范的高质量课题名称');
  }

  /**
   * @param {{ level, subject, grade, direction }} task
   * @returns {{ titles: string[], recommended: string }}
   */
  async run({ level, subject, grade, direction }) {
    const prompt = `请为以下课题生成5个候选名称：

参数：
- 级别：${level}
- 学科：${subject}
- 学段：${grade}
- 研究方向：${direction}

课题名称要求：
1. 符合${level}课题的学术规范和难度
2. 名称简洁有力，20-35字为宜
3. 包含核心概念、研究对象、研究方法或目标
4. 避免过于宏大（如"研究"、"探索"等泛化词）
5. 体现创新性和可操作性

请按以下格式输出（只输出名称，每行一个，前面加序号）：
1. [课题名称]
2. [课题名称]
3. [课题名称]
4. [课题名称]
5. [课题名称]

推荐：[最推荐的一个，说明理由一句话]`;

    const response = await callAI(
      '你是一位资深教育科研专家，擅长为各级课题命名。',
      prompt,
      { maxTokens: 800, temperature: 0.8 }
    );

    const lines = response.split('\n').filter(l => l.trim());
    const titles = lines
      .filter(l => /^\d+\./.test(l.trim()))
      .map(l => l.replace(/^\d+\.\s*/, '').trim());

    const recMatch = response.match(/推荐[：:]\s*(.+)/);
    const recommended = titles[0] ?? '';

    return { titles, recommended, raw: response };
  }
}
