/**
 * 增强版文献搜索 - 多源验证
 * 参考 AutoResearchClaw 架构
 */

// API 配置（全部免费）
const OPENALEX_API = 'https://api.openalex.org';
const SEMANTIC_SCHOLAR_API = 'https://api.semanticscholar.org/graph/v1';
const ARXIV_API = 'http://export.arxiv.org/api/query';

/**
 * 多源文献搜索
 */
export async function searchLiteratureMultiSource(query, options = {}) {
  const { maxResults = 15 } = options;
  
  // 并行搜索多个源
  const [openAlex, semanticScholar, arxiv, tavily] = await Promise.all([
    searchOpenAlex(query, maxResults),
    searchSemanticScholar(query, maxResults),
    searchArxiv(query, maxResults),
    searchTavily(query, maxResults)
  ]);
  
  // 合并去重
  const allResults = [
    ...openAlex.results,
    ...semanticScholar.results,
    ...arxiv.results,
    ...tavily.results
  ];
  
  const uniqueResults = deduplicateResults(allResults);
  
  // 验证引用
  const verifiedResults = await verifyCitations(uniqueResults);
  
  return {
    success: true,
    results: verifiedResults.slice(0, maxResults),
    sources: {
      openAlex: openAlex.results.length,
      semanticScholar: semanticScholar.results.length,
      arxiv: arxiv.results.length,
      tavily: tavily.results.length
    }
  };
}

/**
 * OpenAlex 搜索（免费，学术文献）
 */
async function searchOpenAlex(query, maxResults) {
  try {
    const response = await fetch(
      `${OPENALEX_API}/works?search=${encodeURIComponent(query)}&per_page=${maxResults}&mailto=contact@example.com`
    );
    
    if (!response.ok) return { results: [] };
    
    const data = await response.json();
    
    return {
      results: data.results.map(work => ({
        title: work.title,
        authors: work.authorships?.map(a => a.author.display_name).join(', '),
        year: work.publication_year,
        venue: work.primary_location?.source?.display_name,
        url: work.id,
        doi: work.doi,
        citations: work.cited_by_count,
        source: 'OpenAlex'
      }))
    };
  } catch (e) {
    return { results: [] };
  }
}

/**
 * Semantic Scholar 搜索（免费，AI 领域强）
 */
async function searchSemanticScholar(query, maxResults) {
  try {
    const response = await fetch(
      `${SEMANTIC_SCHOLAR_API}/paper/search?query=${encodeURIComponent(query)}&limit=${maxResults}&fields=title,authors,year,venue,url,citationCount`
    );
    
    if (!response.ok) return { results: [] };
    
    const data = await response.json();
    
    return {
      results: data.data.map(paper => ({
        title: paper.title,
        authors: paper.authors?.map(a => a.name).join(', '),
        year: paper.year,
        venue: paper.venue,
        url: paper.url,
        citations: paper.citationCount,
        source: 'Semantic Scholar'
      }))
    };
  } catch (e) {
    return { results: [] };
  }
}

/**
 * arXiv 搜索（免费，预印本）
 */
async function searchArxiv(query, maxResults) {
  try {
    const response = await fetch(
      `${ARXIV_API}?search_query=all:${encodeURIComponent(query)}&max_results=${maxResults}`
    );
    
    if (!response.ok) return { results: [] };
    
    const text = await response.text();
    const entries = parseArxivXml(text);
    
    return {
      results: entries.map(entry => ({
        title: entry.title,
        authors: entry.authors,
        year: entry.published?.substring(0, 4),
        venue: 'arXiv',
        url: entry.id,
        source: 'arXiv'
      }))
    };
  } catch (e) {
    return { results: [] };
  }
}

/**
 * Tavily 搜索（已实现）
 */
async function searchTavily(query, maxResults) {
  try {
    const { searchLiterature } = await import('./literature-search.mjs');
    const result = await searchLiterature(query, { maxResults });
    return { results: result.success ? result.results : [] };
  } catch (e) {
    return { results: [] };
  }
}

/**
 * 解析 arXiv XML
 */
function parseArxivXml(xml) {
  const entries = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  
  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];
    entries.push({
      id: extractXmlTag(entry, 'id'),
      title: extractXmlTag(entry, 'title'),
      authors: extractAuthors(entry),
      published: extractXmlTag(entry, 'published')
    });
  }
  
  return entries;
}

function extractXmlTag(xml, tag) {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : '';
}

function extractAuthors(xml) {
  const authors = [];
  const authorRegex = /<author>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<\/author>/g;
  let match;
  
  while ((match = authorRegex.exec(xml)) !== null) {
    authors.push(match[1].trim());
  }
  
  return authors.join(', ');
}

/**
 * 去重
 */
function deduplicateResults(results) {
  const seen = new Map();
  
  for (const result of results) {
    const key = result.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!seen.has(key)) {
      seen.set(key, result);
    } else {
      // 合并信息
      const existing = seen.get(key);
      existing.sources = existing.sources || [existing.source];
      existing.sources.push(result.source);
      existing.citations = Math.max(existing.citations || 0, result.citations || 0);
    }
  }
  
  return Array.from(seen.values());
}

/**
 * 引用验证
 */
async function verifyCitations(results) {
  // 简单验证：检查是否有 DOI 或 URL
  return results.map(result => ({
    ...result,
    verified: !!(result.doi || result.url),
    credibility: calculateCredibility(result)
  }));
}

/**
 * 计算可信度
 */
function calculateCredibility(result) {
  let score = 0;
  
  // 有 DOI +30
  if (result.doi) score += 30;
  
  // 有 URL +20
  if (result.url) score += 20;
  
  // 引用数 +最高 30
  if (result.citations) {
    score += Math.min(30, result.citations / 10);
  }
  
  // 多源 +20
  if (result.sources && result.sources.length > 1) {
    score += 20;
  }
  
  return Math.min(100, score);
}

/**
 * 生成引用格式
 */
export function formatCitation(result, index) {
  if (!result.verified) {
    return `[${index}] ${result.title}（来源：${result.source}，未验证）`;
  }
  
  return `[${index}] ${result.authors || '佚名'}. ${result.title}[J]. ${result.venue || '未知期刊'}, ${result.year || 'n.d.'}.`;
}
