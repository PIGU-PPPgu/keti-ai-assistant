/**
 * AI 服务层
 * 统一的模型调用接口，支持 GLM / DeepSeek / OpenAI 切换
 * 换模型只需改 .env 里的 AI_PROVIDER + AI_MODEL
 */

import { cfg } from '../config.mjs';

/**
 * 调用 AI 模型
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {object} options - { maxTokens, temperature, stream }
 * @returns {Promise<string>}
 */
export async function callAI(systemPrompt, userPrompt, options = {}) {
  const { provider, apiKey, model, maxTokens, temperature } = cfg.ai;
  const endpoint = cfg.aiEndpoints[provider];

  if (!endpoint) throw new Error(`未知的 AI provider: ${provider}`);

  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: options.maxTokens ?? maxTokens,
    temperature: options.temperature ?? temperature,
    top_p: 0.9,
    thinking: { type: 'disabled' },
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('retry-after') ?? '10');
    const wait = (retryAfter || 10) * 1000;
    console.warn(`Rate limited (tier=${tier}), retrying after ${wait}ms...`);
    await new Promise(r => setTimeout(r, wait));
    return callAIWithModel(systemPrompt, userPrompt, tier, options);
  }
  if (res.status === 429) {
    console.warn('Rate limited on callAI, retrying after 10s...');
    await new Promise(r => setTimeout(r, 10000));
    return callAI(systemPrompt, userPrompt, options);
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AI API 错误 [${res.status}]: ${err}`);
  }

  const data = await res.json();
  const m = data.choices[0].message;
  return m.content || m.reasoning_content || '';
}

/**
 * 专家系统 prompt - 课题写作
 */
export const EXPERT_SYSTEM_PROMPT = `你是一位经验丰富的教育科研专家，擅长撰写各级各类课题申报书、开题报告、中期检查报告、结题报告。

写作规范：
1. 逻辑严密，结构完整，符合中国教育科研规范
2. 文献引用格式：正文上标 ^[1]^，文末完整列表（至少30篇，近3年≥60%，核心期刊≥40%，外文≥20%）
3. 创新点具体实在，不夸大（禁用"国内首创"等表述）
4. 研究计划可执行，时间节点清晰
5. 字数：区级5000-8000字，市级8000-10000字，省级10000字以上

输出格式：
- 使用 Markdown 格式
- 参考文献：[1] 作者. 标题[J]. 期刊, 年份, 卷(期): 页码.
- 表格使用 Markdown 表格
- 不要输出代码块标记`;

/**
 * 分层模型调用
 * tier: 'main' = 主模型（glm-5），'fast' = 快速模型（glm-4-flash）
 */
export async function callAIWithModel(systemPrompt, userPrompt, tier = 'main', options = {}) {
  const { provider, apiKey, model, maxTokens, temperature } = cfg.ai;
  const endpoint = cfg.aiEndpoints[provider];

  // fast tier 用更轻量的模型
  const fastModels = { glm: 'glm-4-flash', deepseek: 'deepseek-chat', openai: 'gpt-4o-mini' };
  const actualModel = tier === 'fast' ? (fastModels[provider] ?? model) : model;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: actualModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: options.maxTokens ?? maxTokens,
      temperature: options.temperature ?? temperature,
      thinking: { type: 'disabled' },
    }),
  });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('retry-after') ?? '10');
    const wait = (retryAfter || 10) * 1000;
    console.warn(`Rate limited (tier=${tier}), retrying after ${wait}ms...`);
    await new Promise(r => setTimeout(r, wait));
    return callAIWithModel(systemPrompt, userPrompt, tier, options);
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AI API 错误 [${res.status}]: ${err}`);
  }

  const data = await res.json();
  const m = data.choices[0].message;
  return m.content || m.reasoning_content || '';
}
