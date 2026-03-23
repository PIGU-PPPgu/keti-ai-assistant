/**
 * Multi-Agent System - 多智能体协作系统
 * 
 * 基于 LangChain 思想的多 Agent 架构
 * 
 * Agents:
 * - OrchestratorAgent: 主控制器，协调其他 Agent
 * - QueryAgent: 负责问询用户，收集信息
 * - GeneratorAgent: 负责调用 GLM-5 生成内容
 * - ReviewerAgent: 负责检查生成内容（可选）
 */

// ============ Agent 基类 ============
class Agent {
  constructor(name, description) {
    this.name = name;
    this.description = description;
    this.memory = [];
  }
  
  // 记忆
  remember(message) {
    this.memory.push({
      timestamp: Date.now(),
      message
    });
  }
  
  // 获取最近记忆
  getRecentMemory(count = 5) {
    return this.memory.slice(-count);
  }
  
  // 子类实现
  async execute(task) {
    throw new Error('Agent.execute() must be implemented');
  }
}

// ============ Orchestrator Agent ============
class OrchestratorAgent extends Agent {
  constructor() {
    super('Orchestrator', '主控制器，协调其他 Agent');
    this.agents = new Map();
    this.taskQueue = [];
    this.currentTask = null;
  }
  
  // 注册 Agent
  registerAgent(agent) {
    this.agents.set(agent.name, agent);
    return this;
  }
  
  // 分配任务
  async assignTask(agentName, task) {
    const agent = this.agents.get(agentName);
    if (!agent) {
      throw new Error(`Agent ${agentName} not found`);
    }
    
    this.remember({
      type: 'task_assigned',
      agent: agentName,
      task
    });
    
    return await agent.execute(task);
  }
  
  // 协调执行
  async orchestrate(session, userMessage) {
    const workflow = this.createWorkflow(session);
    
    for (const step of workflow) {
      const result = await this.assignTask(step.agent, {
        ...step.task,
        session,
        context: session.data
      });
      
      if (step.onComplete) {
        await step.onComplete(result);
      }
      
      // 如果需要中断（等待用户输入）
      if (result.wait) {
        return result;
      }
    }
  }
  
  // 创建工作流
  createWorkflow(session) {
    return [
      {
        agent: 'QueryAgent',
        task: { type: 'collect_info' },
        onComplete: (result) => {
          if (result.data) {
            Object.assign(session.data, result.data);
          }
        }
      },
      {
        agent: 'GeneratorAgent',
        task: { type: 'generate_document' },
        onComplete: (result) => {
          session.generatedContent = result.content;
        }
      }
    ];
  }
}

// ============ Query Agent ============
class QueryAgent extends Agent {
  constructor() {
    super('QueryAgent', '负责问询用户，收集信息');
    
    // 需要收集的字段
    this.requiredFields = {
      shenbao: [
        { key: 'level', question: '请问是哪个级别的课题？', options: ['区级', '市级', '省级'] },
        { key: 'subject', question: '请问是哪个学科？', options: ['数学', '语文', '英语', '物理', '化学', '生物'] },
        { key: 'grade', question: '请问是哪个学段？', options: ['小学', '初中', '高中'] },
        { key: 'direction', question: '请问研究方向是什么？', options: ['核心素养', '大单元教学', '跨学科融合', '数字化教学', 'AI赋能'] },
        { key: 'title', question: '请提供课题名称（可选）', optional: true }
      ],
      kaiti: [
        { key: 'title', question: '请问课题名称是什么？' },
        { key: 'subject', question: '请问是哪个学科？', options: ['数学', '语文', '英语'] },
        { key: 'grade', question: '请问是哪个学段？', options: ['小学', '初中', '高中'] }
      ],
      zhongqi: [
        { key: 'title', question: '请问课题名称是什么？' },
        { key: 'progress', question: '请问目前研究进展如何？' }
      ],
      jieti: [
        { key: 'title', question: '请问课题名称是什么？' },
        { key: 'achievements', question: '请问取得了哪些成果？' }
      ]
    };
  }
  
  async execute(task) {
    const { session, context } = task;
    
    // 检测意图
    if (!session.type) {
      const intent = this.detectIntent(session.lastMessage);
      if (intent) {
        session.type = intent.type;
        Object.assign(context, intent.params);
      }
    }
    
    // 获取需要的字段
    const fields = this.requiredFields[session.type];
    if (!fields) {
      return {
        wait: false,
        error: '未知的文档类型'
      };
    }
    
    // 找到第一个未填充的字段
    for (const field of fields) {
      if (!context[field.key] && !field.optional) {
        return {
          wait: true,
          question: field.question,
          field: field.key,
          options: field.options,
          progress: this.calculateProgress(context, fields)
        };
      }
    }
    
    // 所有字段都填充完成
    return {
      wait: false,
      data: context,
      complete: true
    };
  }
  
  detectIntent(message) {
    const lower = message.toLowerCase();
    
    if (lower.includes('申报') || (lower.includes('课题') && !lower.includes('开题') && !lower.includes('结题'))) {
      return { type: 'shenbao', params: this.extractParams(message) };
    }
    if (lower.includes('开题')) {
      return { type: 'kaiti', params: this.extractParams(message) };
    }
    if (lower.includes('中期')) {
      return { type: 'zhongqi', params: this.extractParams(message) };
    }
    if (lower.includes('结题')) {
      return { type: 'jieti', params: this.extractParams(message) };
    }
    
    return null;
  }
  
  extractParams(message) {
    const params = {};
    
    if (message.includes('区级')) params.level = '区级';
    if (message.includes('市级')) params.level = '市级';
    if (message.includes('省级')) params.level = '省级';
    
    const subjects = ['数学', '语文', '英语', '物理', '化学', '生物', '政治', '历史', '地理'];
    for (const subject of subjects) {
      if (message.includes(subject)) {
        params.subject = subject;
        break;
      }
    }
    
    if (message.includes('小学')) params.grade = '小学';
    if (message.includes('初中')) params.grade = '初中';
    if (message.includes('高中')) params.grade = '高中';
    
    const directions = ['核心素养', '大单元', '跨学科', '数字化', 'AI', '双减'];
    for (const dir of directions) {
      if (message.includes(dir)) {
        if (dir === '大单元') params.direction = '大单元教学';
        else if (dir === '跨学科') params.direction = '跨学科融合';
        else if (dir === 'AI') params.direction = 'AI赋能';
        else params.direction = dir;
        break;
      }
    }
    
    return params;
  }
  
  calculateProgress(context, fields) {
    const filled = Object.keys(context).length;
    const total = fields.filter(f => !f.optional).length;
    return Math.round((filled / total) * 100);
  }
}

// ============ Generator Agent ============
class GeneratorAgent extends Agent {
  constructor(apiConfig) {
    super('GeneratorAgent', '负责调用 GLM-5 生成内容');
    this.apiConfig = apiConfig;
  }
  
  async execute(task) {
    const { type, session, context } = task;
    
    // 构建 Prompt
    const prompt = this.buildPrompt(session.type, context);
    
    // 调用 GLM-5 API
    const content = await this.callGLM5(prompt);
    
    return {
      content,
      wordCount: content.length,
      documentType: session.type
    };
  }
  
  buildPrompt(documentType, params) {
    const prompts = {
      shenbao: this.buildShenbaoPrompt(params),
      kaiti: this.buildKaitiPrompt(params),
      zhongqi: this.buildZhongqiPrompt(params),
      jieti: this.buildJietiPrompt(params)
    };
    
    return prompts[documentType] || '';
  }
  
  buildShenbaoPrompt(params) {
    return `请生成一份${params.level}课题申报书，要求如下：

## 基本信息
- 课题级别: ${params.level}
- 学科: ${params.subject}
- 年级: ${params.grade}
- 研究方向: ${params.direction}
${params.title ? `- 课题名称: ${params.title}` : ''}

## 字数要求
${params.level === '区级' ? '5000-8000字' : params.level === '市级' ? '8000-10000字' : '5000字'}

## 内容要求

### 一、基本信息
- 课题名称（如未指定，请根据学科、年级、研究方向自动生成）
- 主题词（5个）
- 主持人信息
- 团队成员（主持人 + 6名成员，含姓名、职称、分工）
- 预期成果
- 预计完成时间

### 二、研究背景与意义（1500字）

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

### 三、研究现状述评（2500字）⭐

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

### 四、研究目标与内容（3000字）

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
  
  buildKaitiPrompt(params) {
    return `请生成课题开题报告...`;
  }
  
  buildZhongqiPrompt(params) {
    return `请生成中期检查报告...`;
  }
  
  buildJietiPrompt(params) {
    return `请生成结题报告...`;
  }
  
  async callGLM5(prompt) {
    try {
      const response = await fetch(this.apiConfig.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiConfig.key}`,
        },
        body: JSON.stringify({
          model: 'glm-4-flash',
          messages: [
            {
              role: 'system',
              content: `你是一位经验丰富的教育科研专家，擅长撰写各级各类课题申报书、开题报告、中期检查报告、结题报告。

你的写作特点：
1. 逻辑严密，结构完整
2. **文献引用规范**：使用上标 [1][2][3] 在正文中标注，文末列出完整参考文献
3. 近3年核心期刊占比≥60%
4. 创新点具体实在，不夸大
5. 研究计划可执行，时间节点清晰
6. 字数充足

输出要求：
- 使用 Markdown 格式
- **参考文献至少30篇，按学术规范格式**
- 表格使用 Markdown 表格格式
- 支持插图：![图说明](图片URL)
- 数字使用中文数字（一、二、三...）`
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 10000,
          temperature: 0.7,
        }),
      });
      
      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error('GLM-5 API Error:', error);
      throw error;
    }
  }
}

// ============ Agent System ============
class AgentSystem {
  constructor(config) {
    this.orchestrator = new OrchestratorAgent();
    this.queryAgent = new QueryAgent();
    this.generatorAgent = new GeneratorAgent(config.api);
    
    // 注册 Agents
    this.orchestrator
      .registerAgent(this.queryAgent)
      .registerAgent(this.generatorAgent);
  }
  
  // 处理消息
  async process(sessionId, userMessage, sessions) {
    const session = sessions.get(sessionId) || {
      id: sessionId,
      type: null,
      data: {},
      lastMessage: userMessage,
      generatedContent: null
    };
    
    session.lastMessage = userMessage;
    
    // 执行 QueryAgent
    const queryResult = await this.orchestrator.assignTask('QueryAgent', {
      session,
      context: session.data
    });
    
    if (queryResult.wait) {
      // 需要用户输入
      sessions.set(sessionId, session);
      return {
        type: 'question',
        ...queryResult
      };
    }
    
    if (queryResult.complete) {
      // 信息收集完成，开始生成
      return {
        type: 'start_generation',
        params: session.data,
        documentType: session.type,
        content: '✅ 信息收集完成，正在生成...'
      };
    }
    
    return queryResult;
  }
  
  // 生成文档
  async generate(sessionId, documentType, params, sessions) {
    const session = sessions.get(sessionId);
    
    const result = await this.orchestrator.assignTask('GeneratorAgent', {
      type: 'generate_document',
      session: { type: documentType },
      context: params
    });
    
    return result;
  }
}

// 导出
export { AgentSystem, OrchestratorAgent, QueryAgent, GeneratorAgent };
