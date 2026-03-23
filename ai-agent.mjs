/**
 * AI Agent - 智能对话代理
 * 基于 LangChain 思想的多轮对话系统
 * 
 * 不依赖外部 AI SDK，使用 GLM-5 API
 */

// 状态机
const STATES = {
  IDLE: 'idle',
  COLLECTING: 'collecting',
  GENERATING: 'generating',
  COMPLETED: 'completed'
};

// 需要收集的信息
const REQUIRED_FIELDS = {
  shenbao: [
    { key: 'level', question: '请问是哪个级别的课题？', options: ['区级', '市级', '省级'] },
    { key: 'subject', question: '请问是哪个学科？', options: ['数学', '语文', '英语', '物理', '化学', '生物'] },
    { key: 'grade', question: '请问是哪个学段？', options: ['小学', '初中', '高中'] },
    { key: 'direction', question: '请问研究方向是什么？', options: ['核心素养', '大单元教学', '跨学科融合', '数字化教学', 'AI赋能'] },
    { key: 'title', question: '请提供课题名称（可选，留空自动生成）', optional: true }
  ],
  kaiti: [
    { key: 'title', question: '请问课题名称是什么？' },
    { key: 'subject', question: '请问是哪个学科？', options: ['数学', '语文', '英语'] },
    { key: 'grade', question: '请问是哪个学段？', options: ['小学', '初中', '高中'] }
  ],
  zhongqi: [
    { key: 'title', question: '请问课题名称是什么？' },
    { key: 'progress', question: '请问目前研究进展如何？（简要描述）' }
  ],
  jieti: [
    { key: 'title', question: '请问课题名称是什么？' },
    { key: 'achievements', question: '请问取得了哪些成果？（论文/案例/资源包等）' }
  ]
};

// 文档模块定义
const DOCUMENT_MODULES = {
  shenbao: [
    { id: 'basic', name: '基本信息', required: true },
    { id: 'background', name: '研究背景与意义', required: true },
    { id: 'literature', name: '研究现状述评', required: true },
    { id: 'objectives', name: '研究目标与内容', required: true },
    { id: 'framework', name: '研究框架', required: true },
    { id: 'innovation', name: '重难点与创新', required: true },
    { id: 'methodology', name: '研究方法与计划', required: true },
    { id: 'results', name: '预期成果', required: true },
    { id: 'budget', name: '经费预算', required: true },
    { id: 'references', name: '参考文献', required: true }
  ],
  kaiti: [
    { id: 'plan', name: '课题研究方案', required: true },
    { id: 'literature', name: '文献综述', required: true },
    { id: 'methodology', name: '研究方法详解', required: true },
    { id: 'timeline', name: '时间安排', required: true },
    { id: 'results', name: '预期成果', required: true },
    { id: 'budget', name: '经费预算', required: true },
    { id: 'references', name: '参考文献', required: true }
  ],
  zhongqi: [
    { id: 'progress', name: '研究进展情况', required: true },
    { id: 'achievements', name: '阶段性成果', required: true },
    { id: 'issues', name: '存在问题与对策', required: true },
    { id: 'next', name: '下一步计划', required: true },
    { id: 'budget', name: '经费使用情况', required: true }
  ],
  jieti: [
    { id: 'summary', name: '研究工作总结', required: true },
    { id: 'results', name: '研究成果', required: true },
    { id: 'innovation', name: '创新点', required: true },
    { id: 'value', name: '应用价值', required: true },
    { id: 'issues', name: '存在问题与建议', required: true },
    { id: 'list', name: '成果清单', required: true },
    { id: 'budget', name: '经费决算', required: true },
    { id: 'references', name: '参考文献', required: true }
  ]
};

// 用户会话
const sessions = new Map();

/**
 * 创建或获取会话
 */
export function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      state: STATES.IDLE,
      type: null,
      data: {},
      currentFieldIndex: 0,
      history: []
    });
  }
  return sessions.get(sessionId);
}

/**
 * 处理消息
 */
export async function processMessage(sessionId, userMessage) {
  const session = getSession(sessionId);
  session.history.push({ role: 'user', content: userMessage });
  
  // 状态机处理
  switch (session.state) {
    case STATES.IDLE:
      return handleIdle(session, userMessage);
    
    case STATES.COLLECTING:
      return handleCollecting(session, userMessage);
    
    case STATES.GENERATING:
      return { 
        type: 'message',
        content: '⏳ 正在生成中，请稍候...' 
      };
    
    case STATES.COMPLETED:
      return handleIdle(session, userMessage);
    
    default:
      return { 
        type: 'message',
        content: '抱歉，出现了错误。请重新开始。' 
      };
  }
}

/**
 * IDLE 状态 - 识别意图
 */
function handleIdle(session, userMessage) {
  const intent = detectIntent(userMessage);
  
  if (intent) {
    session.type = intent.type;
    session.state = STATES.COLLECTING;
    session.currentFieldIndex = 0;
    session.data = {};
    
    // 如果有提取到的参数，先填充
    if (intent.params) {
      Object.assign(session.data, intent.params);
    }
    
    // 跳过已有值的字段
    return skipToNextUnfilledField(session);
  } else {
    return {
      type: 'message',
      content: `🤔 我理解你想生成课题文档。

我可以帮你生成：
• **课题申报书** - 区级/市级/省级
• **开题报告** - 3000-5000字
• **中期检查报告** - 2000-3000字
• **结题报告** - 5000-10000字

请告诉我你想生成什么？例如：
"帮我生成一个市级数学课题申报书"`
    };
  }
}

/**
 * 跳过已有值的字段
 */
function skipToNextUnfilledField(session) {
  const fields = REQUIRED_FIELDS[session.type];
  
  // 找到第一个未填充的字段
  while (session.currentFieldIndex < fields.length) {
    const field = fields[session.currentFieldIndex];
    
    // 如果这个字段已经有值了，或者这个字段是可选的，跳过
    if (session.data[field.key] || field.optional) {
      session.currentFieldIndex++;
    } else {
      // 找到未填充的字段，询问
      break;
    }
  }
  
  // 检查是否所有字段都已填充
  if (session.currentFieldIndex >= fields.length) {
    return startGeneration(session);
  }
  
  return askNextQuestion(session);
}

/**
 * COLLECTING 状态 - 收集信息
 */
function handleCollecting(session, userMessage) {
  const fields = REQUIRED_FIELDS[session.type];
  const currentField = fields[session.currentFieldIndex];
  
  // 解析用户输入
  const value = parseValue(userMessage, currentField);
  
  // 保存数据
  if (value !== null && value !== '') {
    session.data[currentField.key] = value;
  }
  
  // 移动到下一个字段
  session.currentFieldIndex++;
  
  // 跳过已有值的字段
  return skipToNextUnfilledField(session);
}

/**
 * 询问下一个问题
 */
function askNextQuestion(session) {
  const fields = REQUIRED_FIELDS[session.type];
  const field = fields[session.currentFieldIndex];
  
  let content = `📝 **${field.question}**\n\n`;
  
  // 显示已收集的信息
  if (Object.keys(session.data).length > 0) {
    content += `已收集信息：\n`;
    for (const [key, value] of Object.entries(session.data)) {
      content += `• ${getFieldLabel(key)}: ${value}\n`;
    }
    content += '\n';
  }
  
  // 如果有选项，显示选项
  if (field.options) {
    content += '选项：\n';
    field.options.forEach((opt, i) => {
      content += `${i + 1}. ${opt}\n`;
    });
  }
  
  // 进度（基于已填充的字段数量）
  const filledCount = Object.keys(session.data).length;
  const progress = Math.round((filledCount / fields.length) * 100);
  
  return {
    type: 'question',
    content,
    field: field.key,
    options: field.options,
    progress,
    collectedCount: filledCount,
    totalCount: fields.length
  };
}

/**
 * 开始生成
 */
function startGeneration(session) {
  session.state = STATES.GENERATING;
  
  const typeNames = {
    shenbao: '课题申报书',
    kaiti: '开题报告',
    zhongqi: '中期检查报告',
    jieti: '结题报告'
  };
  
  return {
    type: 'start_generation',
    content: `✅ 信息收集完成！

📋 **即将生成**: ${typeNames[session.type]}
📊 **参数**: ${JSON.stringify(session.data, null, 2)}

⏳ 正在调用 AI 生成，预计需要 1-2 分钟...`,
    params: session.data,
    documentType: session.type
  };
}

/**
 * 检测意图
 */
function detectIntent(message) {
  const lower = message.toLowerCase();
  
  // 课题申报书
  if (lower.includes('申报') || lower.includes('课题') && !lower.includes('开题') && !lower.includes('结题')) {
    return {
      type: 'shenbao',
      params: extractParams(message)
    };
  }
  
  // 开题报告
  if (lower.includes('开题')) {
    return {
      type: 'kaiti',
      params: extractParams(message)
    };
  }
  
  // 中期检查
  if (lower.includes('中期')) {
    return {
      type: 'zhongqi',
      params: extractParams(message)
    };
  }
  
  // 结题报告
  if (lower.includes('结题')) {
    return {
      type: 'jieti',
      params: extractParams(message)
    };
  }
  
  return null;
}

/**
 * 提取参数
 */
function extractParams(message) {
  const params = {};
  
  // 级别
  if (message.includes('区级')) params.level = '区级';
  if (message.includes('市级')) params.level = '市级';
  if (message.includes('省级')) params.level = '省级';
  
  // 学科
  const subjects = ['数学', '语文', '英语', '物理', '化学', '生物', '政治', '历史', '地理'];
  for (const subject of subjects) {
    if (message.includes(subject)) {
      params.subject = subject;
      break;
    }
  }
  
  // 学段
  if (message.includes('小学')) params.grade = '小学';
  if (message.includes('初中')) params.grade = '初中';
  if (message.includes('高中')) params.grade = '高中';
  
  // 研究方向
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

/**
 * 解析用户输入
 */
function parseValue(message, field) {
  // 如果是选项类型，尝试匹配
  if (field.options) {
    // 数字选择
    const num = parseInt(message);
    if (!isNaN(num) && num >= 1 && num <= field.options.length) {
      return field.options[num - 1];
    }
    
    // 直接匹配
    for (const opt of field.options) {
      if (message.includes(opt)) {
        return opt;
      }
    }
  }
  
  // 返回原消息
  return message.trim();
}

/**
 * 获取字段标签
 */
function getFieldLabel(key) {
  const labels = {
    level: '课题级别',
    subject: '学科',
    grade: '学段',
    direction: '研究方向',
    title: '课题名称',
    progress: '研究进展',
    achievements: '研究成果'
  };
  return labels[key] || key;
}

/**
 * 标记完成
 */
export function markCompleted(sessionId, result) {
  const session = getSession(sessionId);
  session.state = STATES.COMPLETED;
  session.lastResult = result;
  session.history.push({ role: 'assistant', content: result });
}

/**
 * 重置会话
 */
export function resetSession(sessionId) {
  sessions.delete(sessionId);
}

export { STATES };
