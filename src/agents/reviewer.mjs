/**
 * Reviewer Agent - 润色 & 去AI化
 * 对生成内容进行学术润色，降低 AI 检测率
 */

import { BaseAgent } from './base.mjs';
import { callAI } from '../services/ai.mjs';

const REVIEWER_SYSTEM_PROMPT = `你是一位资深的语言润色专家，专门处理学术文章的去AI化润色工作。

你的任务：
1. 保持原文的学术性和专业性
2. 将明显的AI生成痕迹改写为更自然的人类写作风格
3. 增加具体的教学案例和实践细节
4. 调整句式，避免过于规整的并列结构
5. 适当加入教师视角的个人观察和思考
6. 保持原文的核心内容和结构不变

【严格要求】：
- 只输出润色后的正文内容，不要输出任何分析说明、修改思路、前言、后记
- 不要输出"你好！"、"以下是润色后的版本："、"修改说明："、"润色思路："等任何说明性文字
- 不要解释你做了什么修改，直接给出修改后的文本
- 直接从正文内容开始输出，不要有任何开场白

注意：不要改变参考文献格式，不要删减重要内容。`;

export class ReviewerAgent extends BaseAgent {
  constructor() {
    super('ReviewerAgent', '学术润色，降低 AI 检测率');
  }

  /**
   * @param {{ content: string }} task
   * @returns {{ content: string }}
   */
  async run({ content }) {
    // 分段处理，避免超出 token 限制
    const chunks = this.#splitContent(content);
    const polished = [];

    for (const chunk of chunks) {
      const result = await callAI(
        REVIEWER_SYSTEM_PROMPT,
        `请对以下学术文本进行润色，去除AI生成痕迹，使其更像人类写作。直接输出润色后的正文，不要任何说明或解释：\n\n${chunk}`,
        { maxTokens: 4000, temperature: 0.8 }
      );
      polished.push(this.#stripPreamble(result));
    }

    return { content: polished.join('\n\n') };
  }

  // 过滤模型输出的前缀说明性文字
  #stripPreamble(text) {
    const lines = text.split('\n');
    const contentStart = lines.findIndex(line => {
      const t = line.trim();
      // 找到第一个以 # 开头或者实质内容行（非说明性前缀）
      if (t.startsWith('#')) return true;
      if (t.length > 20 && !t.match(/^(你好|以下是|润色|修改|说明|注意|根据|下面|这是|我已|我对|本文|原文)/)) return true;
      return false;
    });
    if (contentStart > 0 && contentStart < 5) {
      return lines.slice(contentStart).join('\n').trim();
    }
    return text;
  }

  #splitContent(content, maxChars = 3000) {
    if (content.length <= maxChars) return [content];

    const chunks = [];
    const paragraphs = content.split('\n\n');
    let current = '';

    for (const para of paragraphs) {
      if (current.length + para.length > maxChars && current) {
        chunks.push(current.trim());
        current = para;
      } else {
        current += (current ? '\n\n' : '') + para;
      }
    }
    if (current) chunks.push(current.trim());
    return chunks;
  }
}
