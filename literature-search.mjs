/**
 * 文献搜索服务
 * 支持多种搜索源 + 多种模型
 */

// Tavily API 配置（可选）
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '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';
const TAVILY_API_URL = 'https://api.tavily.com/search';

// 是否启用搜索（如果没有 key，自动禁用）
const SEARCH_ENABLED = TAVILY_API_KEY && TAVILY_API_KEY.length > 0;

/**
 * 搜索文献
 */
export async function searchLiterature(query, options = {}) {
  // 如果没有配置搜索，返回空结果
  if (!SEARCH_ENABLED) {
    console.log('⚠️ 文献搜索未启用（缺少 TAVILY_API_KEY）');
    return {
      success: false,
      error: '搜索未配置',
      results: []
    };
  }
  
  const {
    maxResults = 10,
    includeDomains = ['cnki.net', 'wanfangdata.com.cn', 'cqvip.com', 'semanticscholar.org', 'arxiv.org'],
    searchDepth = 'advanced'
  } = options;
  
  try {
    const response = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TAVILY_API_KEY}`
      },
      body: JSON.stringify({
        query: `${query} 教育 学术 研究`,
        max_results: maxResults,
        include_domains: includeDomains,
        search_depth: searchDepth,
        include_answer: true,
        include_raw_content: false,
        include_images: false
      })
    });
    
    if (!response.ok) {
      throw new Error(`Tavily API 调用失败: ${response.status}`);
    }
    
    const data = await response.json();
    
    return {
      success: true,
      results: data.results.map(result => ({
        title: result.title,
        url: result.url,
        content: result.content,
        score: result.score
      })),
      answer: data.answer
    };
    
  } catch (error) {
    console.error('文献搜索失败:', error);
    return {
      success: false,
      error: error.message,
      results: []
    };
  }
}

/**
 * 为生成任务搜索相关文献
 */
export async function searchForGeneration(params) {
  const { level, subject, grade, direction } = params;
  
  // 构建搜索查询
  const queries = [
    `${direction} ${subject} ${grade} 教学研究`,
    `${direction}导向的${subject}教学策略`,
    `${grade}${subject}核心素养培养`,
    `${subject}教学评价研究`,
    `${direction}教育实践案例`
  ];
  
  const allResults = [];
  
  for (const query of queries.slice(0, 3)) { // 只搜索前3个查询
    const results = await searchLiterature(query, { maxResults: 5 });
    if (results.success) {
      allResults.push(...results.results);
    }
    
    // 延迟，避免频率限制
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // 去重
  const uniqueResults = allResults.filter((result, index, self) =>
    index === self.findIndex(r => r.url === result.url)
  );
  
  return {
    success: true,
    results: uniqueResults.slice(0, 15), // 最多返回15条
    summary: generateLiteratureSummary(uniqueResults)
  };
}

/**
 * 生成文献摘要（用于注入 prompt）
 */
function generateLiteratureSummary(results) {
  if (!results || results.length === 0) {
    return '未找到相关文献，请根据知识库生成参考文献。';
  }
  
  let summary = '以下是与本研究主题相关的真实文献，请在生成时引用：\n\n';
  
  results.forEach((result, index) => {
    summary += `[${index + 1}] ${result.title}\n`;
    summary += `    来源: ${result.url}\n`;
    summary += `    摘要: ${result.content.substring(0, 200)}...\n\n`;
  });
  
  summary += '\n请根据以上文献信息，生成规范的学术引用格式。确保引用格式符合：\n';
  summary += '[序号] 作者. 文献名称[J]. 期刊名, 年份, 卷(期): 页码.\n';
  
  return summary;
}

/**
 * 验证引用真实性
 */
export async function verifyCitation(citation) {
  // 提取标题
  const titleMatch = citation.match(/\]\s*(.+?)\.[J\[]/);
  if (!titleMatch) {
    return { valid: false, reason: '无法解析标题' };
  }
  
  const title = titleMatch[1];
  
  // 搜索验证
  const results = await searchLiterature(title, { maxResults: 3 });
  
  if (results.success && results.results.length > 0) {
    // 检查是否有匹配的结果
    const match = results.results.find(r => 
      r.title.toLowerCase().includes(title.toLowerCase()) ||
      title.toLowerCase().includes(r.title.toLowerCase())
    );
    
    if (match) {
      return {
        valid: true,
        source: match.url,
        confidence: match.score
      };
    }
  }
  
  return {
    valid: false,
    reason: '未找到匹配的真实文献'
  };
}
