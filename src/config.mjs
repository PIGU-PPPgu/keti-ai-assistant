/**
 * 全局配置
 * 所有环境变量和常量集中在这里，不要在其他文件里直接读 process.env
 */

import { config } from 'dotenv';
config();

function require(key, fallback) {
  const val = process.env[key] ?? fallback;
  if (val === undefined) {
    console.error(`❌ 缺少必需的环境变量: ${key}`);
    process.exit(1);
  }
  return val;
}

export const cfg = {
  port: parseInt(process.env.PORT || '3000'),
  nodeEnv: process.env.NODE_ENV || 'development',

  // AI 配置 - 支持多模型切换
  ai: {
    provider: process.env.AI_PROVIDER || 'glm',   // glm | deepseek | openai
    apiKey: require('AI_API_KEY'),
    model: process.env.AI_MODEL || 'glm-4-plus',  // 默认用 plus，不用 flash
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || '8000'),
    temperature: parseFloat(process.env.AI_TEMPERATURE || '0.7'),
  },

  // 各 provider 的 API 地址
  aiEndpoints: {
    glm: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    deepseek: 'https://api.deepseek.com/chat/completions',
    openai: 'https://api.openai.com/v1/chat/completions',
  },

  // JWT
  jwt: {
    secret: require('JWT_SECRET'),
    expiresIn: '7d',
  },

  // 数据库
  db: {
    path: process.env.DB_PATH || './data/keti.db',
  },

  // 文献搜索（可选）
  tavily: process.env.TAVILY_API_KEY ? { apiKey: process.env.TAVILY_API_KEY } : null,

  // CORS
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(','),

  // Rate limit
  rateLimit: {
    api: { windowMs: 15 * 60 * 1000, max: 100 },
    generate: { windowMs: 60 * 60 * 1000, max: 20 },
  },
};
