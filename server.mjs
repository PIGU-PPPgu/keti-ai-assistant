/**
 * 课题 AI 助手 - 服务端（接入 GLM-5 API + AI Agent）
 * 
 * 启动方式: node server.mjs
 * 访问地址: http://localhost:3000
 * 
 * v2.1 - 新增 AI Agent 多轮对话
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import rateLimit from 'express-rate-limit';
import { processMessage, markCompleted, resetSession, STATES } from './ai-agent.mjs';
import { generateWordDocument } from './word-generator.mjs';
import { searchForGeneration } from './literature-search.mjs';
import { AgentOrchestrator } from './langchain-agents.mjs';
import authRouter, { saveToHistory } from './routes-auth.mjs';
import { authMiddleware } from './auth.mjs';

// 加载环境变量
config();

// 初始化 Agent 协调器
const orchestrator = new AgentOrchestrator();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// GLM-5 API 配置（从环境变量读取）
const GLM_API_KEY = process.env.GLM_API_KEY;
const GLM_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

// 检查必需的环境变量
if (!GLM_API_KEY) {
  console.error('❌ 错误：缺少环境变量 GLM_API_KEY');
  console.error('请创建 .env 文件并配置 API 密钥');
  process.exit(1);
}

// CORS 配置（从环境变量读取允许的域名）
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];

// 中间件
app.use(cors({
  origin: (origin, callback) => {
    // 允许无 origin 的请求（如移动应用、Postman）
    if (!origin) return callback(null, true);
    
    // 允许所有来源（开发环境）
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    // 生产环境检查白名单
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`⚠️  CORS 拒绝来源: ${origin}`);
      callback(null, true); // 暂时允许所有来源
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// Rate Limiting（防止 API 滥用）
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟
  max: 100, // 最多 100 次请求
  message: { error: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false
});

// 生成接口更严格的限制
const generateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 小时
  max: 20, // 最多 20 次
  message: { error: '生成次数过多，请 1 小时后再试' }
});

// 应用 rate limiter
app.use('/api/auth', apiLimiter);
app.use('/api/generate', generateLimiter);
app.use('/api/generate-with-params', generateLimiter);

// 默认页面指向包豪斯版（index.html）
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// 认证路由 + 历史记录路由
app.use('/api', authRouter);

// 调用 GLM-5 API（支持独立搜索层）
async function callGLM5(prompt, maxTokens = 8000, params = {}) {
  try {
    // 如果有参数，先搜索文献
    let literatureContext = '';
    if (params.subject && params.direction) {
      console.log('📚 正在搜索相关文献...');
      
      const searchResult = await searchForGeneration(params);
      
      if (searchResult.success && searchResult.results.length > 0) {
        literatureContext = `\n\n**以下是与本研究主题相关的真实文献，请在参考文献中使用这些真实文献**：\n\n${searchResult.summary}`;
        console.log(`✅ 找到 ${searchResult.results.length} 篇相关文献`);
      } else if (searchResult.error === '搜索未配置') {
        console.log('ℹ️ 文献搜索未配置，使用模型知识库（建议配置 TAVILY_API_KEY 以获得更准确的文献）');
      } else {
        console.log('⚠️ 未找到相关文献，将使用模型知识库');
      }
    }
    
    const response = await fetch(GLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'glm-4-flash',
        messages: [
          {
            role: 'system',
            content: `你是一位经验丰富的教育科研专家，擅长撰写各级各类课题申报书、开题报告、中期检查报告、结题报告。

你的写作特点：
1. 逻辑严密，结构完整
2. **文献引用严格按学术规范**：
   - 正文使用上标引用：核心素养是当前教育改革的重要方向^[1]^
   - 文末列出完整参考文献（至少30篇）
   - 近3年文献占比≥60%
   - 核心期刊占比≥40%
   - 外文文献占比≥20%
3. 创新点具体实在，不夸大（避免"国内首创"等表述）
4. 研究计划可执行，时间节点清晰
5. 字数充足，区级5000-8000字，市级8000-10000字，省级5000字

**重要**：
- 优先使用我提供的真实文献
- 如果提供的文献不足，可以补充你知识库中的文献
- 确保所有引用的文献格式正确
- 不要杜撰不存在的文献

输出要求：
- 使用 Markdown 格式
- **参考文献格式**：
  [1] 作者. 文献名称[J]. 期刊名, 年份, 卷(期): 页码.
  [2] Author. Title[J]. Journal, Year, Vol(Issue): Pages.
- 表格使用 Markdown 表格格式
- 支持插图：![图说明](图片URL)
- 数字使用中文数字（一、二、三...）
- 不要输出代码块标记，直接输出内容`
          },
          {
            role: 'user',
            content: prompt + literatureContext
          }
        ],
        max_tokens: maxTokens,
        temperature: 0.7,
        top_p: 0.9
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('GLM API Error:', error);
      throw new Error(`GLM API 调用失败: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('GLM API Error:', error);
    throw error;
  }
}

// 生成课题申报书
async function generateKetiShenbao(params) {
  const { level, subject, grade, duration, direction, title, host, school } = params;
  
  const prompt = `请生成一份${level}课题申报书，要求如下：

## 基本信息
- 课题级别: ${level}
- 学科: ${subject}
- 年级: ${grade}
- 研究方向: ${direction}
- 研究周期: ${duration || '2年'}
${title ? `- 课题名称: ${title}` : ''}
${host ? `- 主持人: ${host}` : ''}
${school ? `- 所在单位: ${school}` : ''}

## 字数要求
${level === '区级' ? '5000-8000字' : level === '市级' ? '8000-10000字' : '5000字（专项）'}

## 内容要求

### 一、基本信息
- 课题名称（如未指定，请根据学科、年级、研究方向自动生成）
- 主题词（5个）
- 主持人信息
- 团队成员（主持人 + 6名成员，含姓名、职称、分工）
- 预期成果
- 预计完成时间

### 二、研究背景与意义（${level === '市级' ? '1500' : '1000'}字）

#### 1. 研究背景
- 政策背景（引用最新政策文件：双减、核心素养、新课标、教育数字化）
- 现实问题（用数据说明问题严重性）
- 技术机遇（AI、大数据等新技术的应用）

#### 2. 应用价值
- 对学生的价值
- 对教师的价值
- 对学校的价值
- 对教育改革的价值

#### 3. 学术价值
- 理论创新
- 方法创新
- 应用创新

### 三、研究现状述评（${level === '市级' ? '2500' : '1500'}字）⭐

#### 1. 国内研究现状（5个方面）
- 政策支持与指导
- 理论研究
- 实践探索
- 技术应用
- 评价体系

每个方面引用3-5篇文献，标注作者、年份、期刊。

#### 2. 国外研究现状（4个方面）
- 成熟案例（如美国TVAAS、英国Progress 8、芬兰教育体系）
- 创新实践
- 技术前沿
- 政策经验

#### 3. 述评与总结
指出4个研究空白，说明本研究的突破点。

### 四、研究目标与内容（${level === '市级' ? '3000' : '2000'}字）

#### 1. 研究目标（3-4个）
每个目标200-300字。

#### 2. 研究内容（4个方面）
- 现状调查研究
- 策略/方法研究
- 实践应用研究
- 评价体系研究

每个方面300-400字。

#### 3. 拟解决的关键问题（3个）
每个问题100-150字。

### 五、研究框架

#### 1. 研究提纲（6章）
详细列出每章的小节。

#### 2. 操作模型（4个模块）
- 数据采集模块
- 核心模型模块
- 资源联动模块
- 反馈优化模块

### 六、重难点与创新之处

#### 1. 研究重点（3个）
#### 2. 研究难点（3-4个）
#### 3. 创新之处（3-5个）
- 理论创新
- 技术创新
- 应用创新
- 整合创新
- 模型创新（含公式）

### 七、研究方法与计划

#### 1. 研究方法（5种）
- 文献分析法
- 问卷调查法
- 行动研究法
- 案例研究法
- 数据分析法

每种方法200字，含示例。

#### 2. 研究计划（${duration === '3年' ? '3年5阶段' : '2年4阶段'}）
详细的时间表，包含：
- 每个阶段的时间
- 主要任务（3-5条）
- 预期成果

### 八、预期成果

#### 1. 最终成果
- 研究报告（字数）
- 学术论文（数量）
- 其他成果

#### 2. 阶段性成果
每个阶段的成果列表。

### 九、经费预算

| 序号 | 经费开支科目 | 金额（元） | 说明 |
|------|-------------|-----------|------|
| 1 | 图书资料费 | 2000 | 购买相关书籍、期刊 |
| 2 | 数据采集费 | 2000 | 问卷调查、访谈录音等 |
| 3 | 交通差旅费 | 1500 | 外出调研、参加会议 |
| 4 | 设备费 | 4000 | 录音笔、相机、软件等 |
| 5 | 咨询费 | 1500 | 专家咨询、指导 |
| 6 | 印刷费 | 1000 | 问卷印刷、报告打印 |
| 7 | 其他 | 1500 | 不可预见费用 |
| 8 | 管理费 | 1000 | 学校管理费用 |

**总计**: 15000元
**经费来源**: 学校自筹
**年度预算**: 第一年5000元，第二年5000元，第三年5000元

### 十、参考文献

至少30篇，要求：
- 近3年文献占比≥60%
- 核心期刊占比≥40%
- 外文文献占比≥20%

格式：
[1] 作者. 文献名称[J]. 期刊名, 年份, 卷(期): 页码.

## 输出格式
使用 Markdown 格式，包含完整的标题层级和表格。

请开始生成。`;

  return await callGLM5(prompt, 10000);
}

// 生成开题报告
async function generateKaiti(params) {
  const { title, subject, grade, duration, host, school } = params;
  
  const prompt = `请生成一份课题开题报告，要求如下：

## 基本信息
- 课题名称: ${title}
- 学科: ${subject}
- 年级: ${grade}
- 研究周期: ${duration}
- 主持人: ${host}
- 所在单位: ${school}

## 字数要求
3000-5000字

## 内容要求

### 一、课题研究方案（1500字）
1. 研究背景与意义
2. 研究目标与内容
3. 研究方法与技术路线
4. 研究重点与难点

### 二、文献综述（1000字）
梳理国内外相关研究，至少20篇文献。

### 三、研究方法详解（800字）
详细说明每种研究方法的实施步骤。

### 四、时间安排（500字）
按月/季度详细列出研究计划。

### 五、预期成果（300字）
列出阶段性成果和最终成果。

### 六、经费预算（300字）
详细的经费预算表。

### 七、参考文献（600字）
至少20篇参考文献。

请开始生成。`;

  return await callGLM5(prompt, 6000);
}

// 生成中期检查报告
async function generateZhongqi(params) {
  const { title, subject, grade, duration, host, school } = params;
  
  const prompt = `请生成一份课题中期检查报告，要求如下：

## 基本信息
- 课题名称: ${title}
- 学科: ${subject}
- 年级: ${grade}
- 研究周期: ${duration}
- 主持人: ${host}
- 所在单位: ${school}

## 字数要求
2000-3000字

## 内容要求

### 一、研究进展情况（1000字）
1. 已完成的工作
2. 正在进行的工作
3. 未完成的工作及原因

### 二、阶段性成果（800字）
1. 已发表的论文
2. 已开发的工具/资源
3. 其他成果

### 三、存在问题与对策（500字）
1. 遇到的问题
2. 解决方案

### 四、下一步计划（500字）
1. 近期工作计划
2. 预期成果

### 五、经费使用情况（200字）
经费使用明细。

请开始生成。`;

  return await callGLM5(prompt, 4000);
}

// 生成结题报告
async function generateJieti(params) {
  const { title, subject, grade, duration, host, school } = params;
  
  const prompt = `请生成一份课题结题报告，要求如下：

## 基本信息
- 课题名称: ${title}
- 学科: ${subject}
- 年级: ${grade}
- 研究周期: ${duration}
- 主持人: ${host}
- 所在单位: ${school}

## 字数要求
5000-10000字

## 内容要求

### 一、研究工作总结（2000字）
1. 研究背景与目标
2. 研究过程回顾
3. 主要工作内容

### 二、研究成果（3000字）
1. 理论成果（论文、专著）
2. 实践成果（工具、资源、案例）
3. 应用成果（推广情况、社会影响）

### 三、创新点（1000字）
1. 理论创新
2. 方法创新
3. 应用创新

### 四、应用价值（1500字）
1. 对学生的价值
2. 对教师的价值
3. 对学校的价值
4. 推广价值

### 五、存在问题与建议（500字）
1. 研究局限性
2. 后续研究建议

### 六、成果清单（500字）
列出所有成果的详细信息。

### 七、经费决算（300字）
经费使用明细。

### 八、参考文献（800字）
至少30篇参考文献。

请开始生成。`;

  return await callGLM5(prompt, 12000);
}

// API 路由: 生成课题申报书（支持流式输出）
app.post('/api/generate', async (req, res) => {
  try {
    const params = req.body;
    
    console.log('📥 收到生成请求:', params);
    
    // 验证必需参数
    const required = ['level', 'subject', 'grade', 'direction'];
    const missing = required.filter(key => !params[key]);
    
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `缺少必需参数: ${missing.join(', ')}`,
      });
    }
    
    // 检查是否请求流式输出
    const stream = req.headers.accept === 'text/event-stream';
    
    if (stream) {
      // 流式输出
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      console.log('🤖 调用 GLM-5 API 生成中（流式）...');
      
      const response = await fetch(GLM_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GLM_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'glm-4-flash',
          messages: [
            {
              role: 'system',
              content: `你是一位经验丰富的教育科研专家，擅长撰写各级各类课题申报书、开题报告、中期检查报告、结题报告。

你的写作特点：
1. 逻辑严密，结构完整
2. **文献引用严格按学术规范**：
   - 正文使用上标引用：核心素养是当前教育改革的重要方向^[1]^
   - 文末列出完整参考文献（至少30篇）
   - 近3年文献占比≥60%
   - 核心期刊占比≥40%
   - 外文文献占比≥20%
3. 创新点具体实在，不夸大（避免"国内首创"等表述）
4. 研究计划可执行，时间节点清晰
5. 字数充足，区级5000-8000字，市级8000-10000字，省级5000字

输出要求：
- 使用 Markdown 格式
- **参考文献格式**：
  [1] 作者. 文献名称[J]. 期刊名, 年份, 卷(期): 页码.
  [2] Author. Title[J]. Journal, Year, Vol(Issue): Pages.
- 表格使用 Markdown 表格格式
- 支持插图：![图说明](图片URL)
- 数字使用中文数字（一、二、三...）`
            },
            {
              role: 'user',
              content: buildShenbaoPrompt(params)
            }
          ],
          max_tokens: 10000,
          temperature: 0.7,
          stream: true // 启用流式输出
        }),
      });
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              res.write('data: [DONE]\n\n');
            } else {
              try {
                const json = JSON.parse(data);
                const content = json.choices?.[0]?.delta?.content;
                if (content) {
                  res.write(`data: ${JSON.stringify({ content })}\n\n`);
                }
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        }
      }
      
      res.end();
      console.log('✅ 流式生成完成');
      
    } else {
      // 非流式输出（原有逻辑）
      console.log('🤖 调用 GLM-5 API 生成中...');
      const content = await generateKetiShenbao(params);
      
      console.log('✅ 生成成功');
      
      res.json({
        success: true,
        content: content,
        wordCount: content.length,
        title: params.title || `${params.direction}导向的${params.grade}${params.subject}教学实践研究`,
      });
    }
    
  } catch (error) {
    console.error('❌ 生成失败:', error);
    res.status(500).json({
      success: false,
      error: '生成失败: ' + error.message,
    });
  }
});

// 构建 Prompt
function buildShenbaoPrompt(params) {
  const { level, subject, grade, duration, direction, title, host, school } = params;
  
  return `请生成一份${level}课题申报书，要求如下：

## 基本信息
- 课题级别: ${level}
- 学科: ${subject}
- 年级: ${grade}
- 研究方向: ${direction}
- 研究周期: ${duration || '2年'}
${title ? `- 课题名称: ${title}` : ''}
${host ? `- 主持人: ${host}` : ''}
${school ? `- 所在单位: ${school}` : ''}

## 字数要求
${level === '区级' ? '5000-8000字' : level === '市级' ? '8000-10000字' : '5000字'}

## 内容要求

### 一、基本信息
- 课题名称（如未指定，请根据学科、年级、研究方向自动生成）
- 主题词（5个）
- 主持人信息
- 团队成员（主持人 + 6名成员，含姓名、职称、分工）
- 预期成果
- 预计完成时间

### 二、研究背景与意义（${level === '市级' ? '1500' : '1000'}字）

#### 1. 研究背景
- 政策背景（引用最新政策文件：双减、核心素养、新课标、教育数字化）
- 现实问题（用数据说明问题严重性）
- 技术机遇（AI、大数据等新技术的应用）

#### 2. 应用价值
- 对学生的价值
- 对教师的价值
- 对学校的价值
- 对教育改革的价值

#### 3. 学术价值
- 理论创新
- 方法创新
- 应用创新

### 三、研究现状述评（${level === '市级' ? '2500' : '1500'}字）⭐

**重要**：本节必须严格按学术规范引用文献，格式如下：

#### 1. 国内研究现状（5个方面）
每个方面引用3-5篇文献，使用上标标注 [1][2][3]，并在文末列出完整参考文献。

**示例**：
> 近年来，核心素养导向的教学研究取得了丰硕成果。张华等[1]提出了核心素养视域下的数学教育改革框架，王晓春[2]进一步探讨了教学策略...

#### 2. 国外研究现状（4个方面）
引用国际权威文献，如：
- OECD PISA 报告
- 美国共同核心州立标准（CCSSM）
- 芬兰教育体系研究
- 英国 Progress 8 评价体系

#### 3. 述评与总结
指出4个研究空白，说明本研究的突破点。

### 四、研究目标与内容（${level === '市级' ? '3000' : '2000'}字）

#### 1. 研究目标（3-4个）
每个目标200-300字。

#### 2. 研究内容（4个方面）
- 现状调查研究
- 策略/方法研究
- 实践应用研究
- 评价体系研究

每个方面300-400字。

### 五、研究框架

#### 1. 研究提纲（6章）
详细列出每章的小节。

#### 2. 操作模型（4个模块）
- 数据采集模块
- 核心模型模块
- 资源联动模块
- 反馈优化模块

### 六、重难点与创新之处

#### 1. 研究重点（3个）
#### 2. 研究难点（3-4个）
#### 3. 创新之处（3-5个）

### 七、研究方法与计划

#### 1. 研究方法（5种）
- 文献分析法
- 问卷调查法
- 行动研究法
- 案例研究法
- 数据分析法

每种方法200字，含示例。

#### 2. 研究计划（3年5阶段）
详细的时间表。

### 八、预期成果

#### 1. 最终成果
- 研究报告（字数）
- 学术论文（数量）
- 其他成果

### 九、经费预算

| 序号 | 经费开支科目 | 金额（元） | 说明 |
|------|-------------|-----------|------|
| 1 | 图书资料费 | 2000 | ... |
...

### 十、参考文献 ⭐⭐⭐

**必须包含至少30篇参考文献，格式如下**：

[1] 张华. 核心素养视域下的数学教育改革[J]. 数学教育学报, 2020, 39(1): 1-5.
[2] 王晓春. 核心素养导向的数学教学策略研究[J]. 数学教育学报, 2021, 40(2): 12-18.
[3] Smith J. Educational Assessment in the Digital Age[J]. Journal of Educational Technology, 2023, 15(3): 45-67.
...

**要求**：
- 近3年文献占比≥60%
- 核心期刊占比≥40%
- 外文文献占比≥20%
- 使用上标 [1][2][3] 在正文中标注引用位置

## 插图要求

如需插图，请使用 Markdown 格式：
\`\`\`
![图1: 研究框架](https://example.com/image1.png)
\`\`\`

并在正文中引用：如图1所示...

请开始生成。`;
}

// API 路由: 生成开题报告
app.post('/api/generate-kaiti', async (req, res) => {
  try {
    const params = req.body;
    
    console.log('📥 收到开题报告生成请求:', params);
    
    // 验证必需参数
    const required = ['title', 'subject', 'grade'];
    const missing = required.filter(key => !params[key]);
    
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `缺少必需参数: ${missing.join(', ')}`,
      });
    }
    
    // 调用 GLM-5 API 生成
    console.log('🤖 调用 GLM-5 API 生成开题报告...');
    const content = await generateKaiti(params);
    
    console.log('✅ 生成成功');
    
    res.json({
      success: true,
      content: content,
      wordCount: content.length,
    });
    
  } catch (error) {
    console.error('❌ 生成失败:', error);
    res.status(500).json({
      success: false,
      error: '生成失败: ' + error.message,
    });
  }
});

// API 路由: 生成中期检查报告
app.post('/api/generate-zhongqi', async (req, res) => {
  try {
    const params = req.body;
    
    console.log('📥 收到中期检查生成请求:', params);
    
    // 验证必需参数
    const required = ['title', 'subject', 'grade'];
    const missing = required.filter(key => !params[key]);
    
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `缺少必需参数: ${missing.join(', ')}`,
      });
    }
    
    // 调用 GLM-5 API 生成
    console.log('🤖 调用 GLM-5 API 生成中期检查报告...');
    const content = await generateZhongqi(params);
    
    console.log('✅ 生成成功');
    
    res.json({
      success: true,
      content: content,
      wordCount: content.length,
    });
    
  } catch (error) {
    console.error('❌ 生成失败:', error);
    res.status(500).json({
      success: false,
      error: '生成失败: ' + error.message,
    });
  }
});

// API 路由: 生成结题报告
app.post('/api/generate-jieti', async (req, res) => {
  try {
    const params = req.body;
    
    console.log('📥 收到结题报告生成请求:', params);
    
    // 验证必需参数
    const required = ['title', 'subject', 'grade'];
    const missing = required.filter(key => !params[key]);
    
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `缺少必需参数: ${missing.join(', ')}`,
      });
    }
    
    // 调用 GLM-5 API 生成
    console.log('🤖 调用 GLM-5 API 生成结题报告...');
    const content = await generateJieti(params);
    
    console.log('✅ 生成成功');
    
    res.json({
      success: true,
      content: content,
      wordCount: content.length,
    });
    
  } catch (error) {
    console.error('❌ 生成失败:', error);
    res.status(500).json({
      success: false,
      error: '生成失败: ' + error.message,
    });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '2.1.0',
    features: ['keti-shenbao', 'kaiti', 'zhongqi', 'jieti', 'ai-agent']
  });
});

// ============ AI Agent 对话接口 ============

// 生成唯一会话 ID
function generateSessionId() {
  return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// 对话接口
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        error: '消息不能为空'
      });
    }
    
    // 使用提供的 sessionId 或生成新的
    const sid = sessionId || generateSessionId();
    
    console.log(`💬 [${sid}] 用户消息:`, message);
    
    // 处理消息
    const result = await processMessage(sid, message);
    
    console.log(`🤖 [${sid}] AI 响应:`, result.type);
    
    // 如果是开始生成，调用生成 API
    if (result.type === 'start_generation') {
      // 异步生成，立即返回
      res.json({
        success: true,
        sessionId: sid,
        ...result
      });
      
      // 后台生成（实际应该用队列）
      // 这里简化处理，前端会调用 /api/generate-with-params
    } else {
      res.json({
        success: true,
        sessionId: sid,
        ...result
      });
    }
    
  } catch (error) {
    console.error('❌ 对话处理失败:', error);
    res.status(500).json({
      success: false,
      error: '对话处理失败: ' + error.message
    });
  }
});

// 根据收集的参数生成文档（使用真正的 Agent 协作）
app.post('/api/generate-with-params', async (req, res) => {
  try {
    const { sessionId, documentType, params } = req.body;
    
    console.log(`📄 [${sessionId}] 开始生成 ${documentType}:`, params);
    
    // 使用 Agent 协调器生成文档
    const result = await orchestrator.generateDocument(
      documentType,
      params,
      (agent, status, task) => {
        console.log(`[${agent}] ${status}: ${task}`);
      }
    );
    
    if (result.success) {
      // 标记完成
      markCompleted(sessionId, result.content);
      
      console.log(`✅ [${sessionId}] 生成成功，字数: ${result.wordCount}`);
      
      // 尝试保存到历史记录（如果用户已登录）
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const verifyResult = verifyToken(token);
        
        if (verifyResult.success) {
          const historyResult = saveToHistory(
            verifyResult.userId,
            params.subject || '未知课题',
            params.level || '市级',
            documentType,
            result.content
          );
          
          if (historyResult && historyResult.success) {
            console.log(`💾 [${sessionId}] 已保存到历史记录: ID=${historyResult.historyId}`);
          }
        }
      }
      
      res.json({
        success: true,
        content: result.content,
        wordCount: result.wordCount,
        documentType: documentType,
        literature: result.literature
      });
    } else {
      console.log(`❌ [${sessionId}] 生成失败:`, result.error);
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
    
  } catch (error) {
    console.error('❌ 生成失败:', error);
    res.status(500).json({
      success: false,
      error: '生成失败: ' + error.message
    });
  }
});

// 重置会话
app.post('/api/reset-session', (req, res) => {
  const { sessionId } = req.body;
  
  if (sessionId) {
    resetSession(sessionId);
    console.log(`🔄 [${sessionId}] 会话已重置`);
  }
  
  res.json({ success: true });
});

// 获取 Agent 状态
app.get('/api/agents/status', (req, res) => {
  const status = orchestrator.getStatus();
  res.json({
    success: true,
    agents: status
  });
});

// 导出 Word 文档
app.post('/api/export-word', async (req, res) => {
  try {
    const { content, title, documentType } = req.body;
    
    if (!content) {
      return res.status(400).json({
        success: false,
        error: '内容不能为空'
      });
    }
    
    console.log(`📄 生成 Word 文档: ${title || documentType}`);
    
    // 生成 Word 文档
    const buffer = await generateWordDocument(content, {
      title: title || getDocumentTypeName(documentType)
    });
    
    // 设置响应头
    const filename = `${title || getDocumentTypeName(documentType)}_${new Date().toISOString().split('T')[0]}.docx`;
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Content-Length', buffer.length);
    
    // 发送文件
    res.send(buffer);
    
    console.log(`✅ Word 文档已生成: ${filename} (${buffer.length} bytes)`);
    
  } catch (error) {
    console.error('❌ Word 生成失败:', error);
    res.status(500).json({
      success: false,
      error: 'Word 生成失败: ' + error.message
    });
  }
});

// 获取文档类型名称
function getDocumentTypeName(type) {
  const names = {
    shenbao: '课题申报书',
    kaiti: '开题报告',
    zhongqi: '中期检查报告',
    jieti: '结题报告'
  };
  return names[type] || '课题文档';
}

// 去AI化润色
async function humanizeContent(content, documentType) {
  const prompt = `你是一位专业的学术编辑，擅长将AI生成的文本"去AI化"，使其更像人类写作。

**任务**：对以下文本进行润色，去除AI生成的痕迹。

**AI文本常见问题**：
1. 过于工整、对称的结构
2. 大量使用"首先...其次...最后..."
3. 缺乏个人观点和情感
4. 术语堆砌，缺乏解释
5. 句式单一，缺乏变化
6. 过度使用被动语态
7. 缺乏具体案例和个人经验
8. 段落长度过于均匀

**润色要求**：
1. **句式变化**：增加短句、长句的交替使用
2. **个人化表达**：适当加入"我认为"、"在实践中发现"等主观表达
3. **具体化**：将抽象描述具体化，加入数字、案例
4. **口语化**：适当使用口语化表达（不要过度）
5. **不完美**：保留一些"不完美"的表达，避免过于工整
6. **逻辑连贯**：确保逻辑自然流畅，不是机械过渡
7. **保留专业**：保持学术规范性，不降低专业水平

**注意**：
- 不要改变原文的核心观点和内容
- 保持参考文献的完整性
- 保持表格和数据的准确性
- 保持章节结构不变

**原文**：
${content}

请输出润色后的文本（Markdown格式）：`;

  return await callGLM5(prompt, 12000);
}

// 去AI化 API（使用真正的 Agent）
app.post('/api/humanize', async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({
        success: false,
        error: '内容不能为空'
      });
    }
    
    console.log(`🎨 开始去AI化处理`);
    
    // 使用 Agent 协调器去AI化
    const result = await orchestrator.humanizeContent(
      content,
      (agent, status, task) => {
        console.log(`[${agent}] ${status}: ${task}`);
      }
    );
    
    if (result.success) {
      console.log(`✅ 去AI化完成: ${result.wordCount} 字`);
      console.log(`📊 质量评分: ${result.quality.score}/100`);
      
      res.json({
        success: true,
        content: result.content,
        wordCount: result.wordCount,
        quality: result.quality
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
    
  } catch (error) {
    console.error('❌ 去AI化失败:', error);
    res.status(500).json({
      success: false,
      error: '去AI化失败: ' + error.message
    });
  }
});

// Agent 状态更新（简化版）
function updateAgentStatus(agent, status) {
  // 这里可以发送 WebSocket 通知，暂时只记录日志
  console.log(`[Agent:${agent}] ${status}`);
}

// 重新生成某个模块
app.post('/api/regenerate-module', async (req, res) => {
  try {
    const { documentType, moduleId, params, existingContent } = req.body;
    
    console.log(`🔄 重新生成模块: ${moduleId}`);
    
    // 构建针对特定模块的 prompt
    const modulePrompts = {
      'background': `请重新生成"研究背景与意义"部分...`,
      'literature': `请重新生成"研究现状述评"部分...`,
      // ... 其他模块
    };
    
    // 这里简化处理，实际应该针对每个模块生成
    const newContent = await callGLM5(`请根据以下信息重新生成${moduleId}模块：\n\n${JSON.stringify(params)}`, 6000);
    
    res.json({
      success: true,
      content: newContent
    });
    
  } catch (error) {
    console.error('❌ 模块重新生成失败:', error);
    res.status(500).json({
      success: false,
      error: '模块重新生成失败: ' + error.message
    });
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`课题AI助手已启动 (v2.1)`);
  console.log(`API: http://localhost:${PORT}/api`);
  console.log(`前端: http://localhost:${PORT}`);
  console.log(`AI: GLM-5 (智谱AI) + LangChain Agent`);
  console.log('');
  console.log('支持功能:');
  console.log('  - 对话式生成: POST /api/chat');
  console.log('  - 课题申报书: POST /api/generate');
  console.log('  - 开题报告: POST /api/generate-kaiti');
  console.log('  - 中期检查: POST /api/generate-zhongqi');
  console.log('  - 结题报告: POST /api/generate-jieti');
  console.log('  - Agent状态: GET /api/agents/status');
  console.log('');
  console.log('按 Ctrl+C 停止服务器');
});
