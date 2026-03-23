/**
 * 多 Agent 协作系统（基于 LangChain）
 * 
 * 真正的 Agent 协作，不是假的状态显示
 */

import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';

// 配置
const GLM_API_KEY = '581783fe7eb8485e832d362be1b11cba.27R1rNJwxRF3veaX';
const GLM_API_URL = 'https://open.bigmodel.cn/api/paas/v4';

/**
 * 基础 Agent 类
 */
class BaseAgent {
  constructor(name, role) {
    this.name = name;
    this.role = role;
    this.status = 'idle'; // idle, working, completed, failed
    this.currentTask = null;
    this.history = [];
    
    // 初始化 LLM（使用 GLM-5 兼容接口）
    this.llm = new ChatOpenAI({
      configuration: {
        baseURL: GLM_API_URL,
        apiKey: GLM_API_KEY,
        defaultHeaders: {
          'Authorization': `Bearer ${GLM_API_KEY}`
        }
      },
      modelName: 'glm-4-flash',
      temperature: 0.7,
      maxTokens: 4000
    });
  }
  
  /**
   * 执行任务
   */
  async execute(task, context = {}) {
    this.status = 'working';
    this.currentTask = task;
    this.history.push({ task, context, startTime: Date.now() });
    
    try {
      const result = await this.run(task, context);
      this.status = 'completed';
      this.history[this.history.length - 1].result = result;
      this.history[this.history.length - 1].endTime = Date.now();
      return result;
    } catch (error) {
      this.status = 'failed';
      this.history[this.history.length - 1].error = error.message;
      throw error;
    }
  }
  
  /**
   * 子类实现具体逻辑
   */
  async run(task, context) {
    throw new Error('BaseAgent.run() must be implemented');
  }
  
  /**
   * 获取状态
   */
  getStatus() {
    return {
      name: this.name,
      role: this.role,
      status: this.status,
      currentTask: this.currentTask
    };
  }
}

/**
 * 文献专家 Agent
 */
export class LiteratureAgent extends BaseAgent {
  constructor() {
    super('文献专家', '负责搜索和分析相关文献');
  }
  
  async run(task, context) {
    const { subject, direction, grade } = context;
    
    // 搜索文献
    const searchResult = await this.searchLiterature(subject, direction, grade);
    
    // 分析文献
    const analysis = await this.analyzeLiterature(searchResult);
    
    return {
      literature: searchResult,
      analysis: analysis,
      summary: this.generateSummary(searchResult, analysis)
    };
  }
  
  async searchLiterature(subject, direction, grade) {
    // 动态导入搜索模块
    const { searchForGeneration } = await import('./literature-search.mjs');
    const result = await searchForGeneration({ subject, direction, grade });
    return result;
  }
  
  async analyzeLiterature(searchResult) {
    if (!searchResult.success || searchResult.results.length === 0) {
      return '未找到相关文献，将使用模型知识库';
    }
    
    // 使用 LLM 分析文献
    const prompt = PromptTemplate.fromTemplate(`
你是一位学术文献分析专家。请分析以下文献，提取关键观点和研究趋势。

文献列表：
{literature}

请输出：
1. 主要研究方向
2. 关键观点（3-5条）
3. 研究趋势
4. 可引用的文献（格式：[序号] 作者. 文献名称[J]. 期刊名, 年份）
`);
    
    const chain = RunnableSequence.from([
      prompt,
      this.llm,
      new StringOutputParser()
    ]);
    
    const literatureText = searchResult.results
      .map((r, i) => `[${i + 1}] ${r.title}\n${r.content}`)
      .join('\n\n');
    
    return await chain.invoke({ literature: literatureText });
  }
  
  generateSummary(searchResult, analysis) {
    if (!searchResult.success) {
      return '## 文献搜索结果\n\n未找到相关文献，将使用模型知识库生成内容。';
    }
    
    let summary = `## 文献搜索结果\n\n`;
    summary += `找到 ${searchResult.results.length} 篇相关文献\n\n`;
    summary += `### 分析结果\n\n${analysis}\n\n`;
    summary += `### 文献列表\n\n`;
    
    searchResult.results.forEach((r, i) => {
      summary += `${i + 1}. **${r.title}**\n   ${r.url}\n\n`;
    });
    
    return summary;
  }
}

/**
 * 写作专家 Agent
 */
export class WriterAgent extends BaseAgent {
  constructor() {
    super('写作专家', '负责生成课题文档内容');
  }
  
  async run(task, context) {
    const { documentType, params, literature } = context;
    
    // 构建写作 prompt
    const prompt = this.buildPrompt(documentType, params, literature);
    
    // 调用 LLM 生成
    const chain = RunnableSequence.from([
      PromptTemplate.fromTemplate('{prompt}'),
      this.llm,
      new StringOutputParser()
    ]);
    
    const content = await chain.invoke({ prompt });
    
    return {
      content: content,
      wordCount: content.length
    };
  }
  
  buildPrompt(documentType, params, literature) {
    const docNames = {
      shenbao: '课题申报书',
      kaiti: '开题报告',
      zhongqi: '中期检查报告',
      jieti: '结题报告'
    };
    
    let prompt = `请生成${params.level || ''}${docNames[documentType]}。

## 基本信息
- 学科: ${params.subject}
- 年级: ${params.grade}
- 研究方向: ${params.direction}
${params.title ? `- 课题名称: ${params.title}` : ''}

`;
    
    // 如果有文献分析，加入
    if (literature && literature.summary) {
      prompt += `## 文献分析\n\n${literature.summary}\n\n`;
      prompt += `请在文档中引用以上文献，使用学术引用格式 [1][2][3]。\n\n`;
    }
    
    prompt += `## 字数要求
${params.level === '市级' ? '8000-10000字' : '5000-8000字'}

## 输出要求
- 使用 Markdown 格式
- 参考文献至少 30 篇
- 近3年文献占比 ≥ 60%
- 核心期刊占比 ≥ 40%
- 不要使用代码块标记

请开始生成：`;
    
    return prompt;
  }
}

/**
 * 审核专家 Agent
 */
export class ReviewerAgent extends BaseAgent {
  constructor() {
    super('审核专家', '负责去AI化和质量检查');
  }
  
  async run(task, context) {
    const { content } = context;
    
    // 去AI化
    const humanized = await this.humanize(content);
    
    // 质量检查
    const quality = await this.checkQuality(humanized);
    
    return {
      content: humanized,
      quality: quality,
      wordCount: humanized.length
    };
  }
  
  async humanize(content) {
    const prompt = PromptTemplate.fromTemplate(`
你是一位专业的学术编辑。请对以下文本进行"去AI化"润色。

AI文本常见问题：
1. 过于工整、对称的结构
2. 大量使用"首先...其次...最后..."
3. 缺乏个人观点和情感
4. 句式单一，缺乏变化

润色要求：
1. 句式变化（短句/长句交替）
2. 个人化表达（"我认为"、"在实践中发现"）
3. 具体化（加入数字、案例）
4. 保留专业（不降低学术水平）

原文：
{content}

请输出润色后的文本：`);
    
    const chain = RunnableSequence.from([
      prompt,
      this.llm,
      new StringOutputParser()
    ]);
    
    return await chain.invoke({ content });
  }
  
  async checkQuality(content) {
    const wordCount = content.length;
    const hasReferences = content.includes('[') && content.includes(']');
    const sections = (content.match(/^##/gm) || []).length;
    
    return {
      wordCount,
      hasReferences,
      sections,
      score: this.calculateScore(wordCount, hasReferences, sections)
    };
  }
  
  calculateScore(wordCount, hasReferences, sections) {
    let score = 0;
    
    // 字数（40分）
    if (wordCount >= 8000) score += 40;
    else if (wordCount >= 6000) score += 30;
    else if (wordCount >= 4000) score += 20;
    else score += 10;
    
    // 参考文献（30分）
    if (hasReferences) score += 30;
    
    // 结构（30分）
    if (sections >= 8) score += 30;
    else if (sections >= 6) score += 20;
    else if (sections >= 4) score += 10;
    
    return score;
  }
}

/**
 * Agent 协调器
 */
export class AgentOrchestrator {
  constructor() {
    this.literatureAgent = new LiteratureAgent();
    this.writerAgent = new WriterAgent();
    this.reviewerAgent = new ReviewerAgent();
    
    this.agents = [
      this.literatureAgent,
      this.writerAgent,
      this.reviewerAgent
    ];
  }
  
  /**
   * 获取所有 Agent 状态
   */
  getStatus() {
    return this.agents.map(agent => agent.getStatus());
  }
  
  /**
   * 协调生成文档
   */
  async generateDocument(documentType, params, onProgress) {
    const workflow = [];
    
    try {
      // 1. 文献专家搜索
      if (onProgress) onProgress('literature', 'working', '搜索相关文献...');
      const literatureResult = await this.literatureAgent.execute('search', {
        subject: params.subject,
        direction: params.direction,
        grade: params.grade
      });
      workflow.push({ agent: 'literature', result: literatureResult });
      if (onProgress) onProgress('literature', 'completed', '文献搜索完成');
      
      // 2. 写作专家生成
      if (onProgress) onProgress('writer', 'working', '生成文档内容...');
      const writerResult = await this.writerAgent.execute('write', {
        documentType,
        params,
        literature: literatureResult
      });
      workflow.push({ agent: 'writer', result: writerResult });
      if (onProgress) onProgress('writer', 'completed', '文档生成完成');
      
      return {
        success: true,
        content: writerResult.content,
        wordCount: writerResult.wordCount,
        literature: literatureResult.summary,
        workflow
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        workflow
      };
    }
  }
  
  /**
   * 去AI化润色
   */
  async humanizeContent(content, onProgress) {
    try {
      if (onProgress) onProgress('reviewer', 'working', '去AI化润色中...');
      
      const result = await this.reviewerAgent.execute('review', { content });
      
      if (onProgress) onProgress('reviewer', 'completed', '润色完成');
      
      return {
        success: true,
        content: result.content,
        quality: result.quality,
        wordCount: result.wordCount
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}
