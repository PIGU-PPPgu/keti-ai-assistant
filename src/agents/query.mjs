/**
 * Query Agent - 信息收集
 * 负责识别用户意图、逐步收集生成所需的参数
 */

import { BaseAgent } from './base.mjs';

// 每种文档需要收集的字段
const FIELDS = {
  shenbao: [
    { key: 'level',     label: '课题级别', question: '请问是哪个级别的课题？', options: ['区级', '市级', '省级'] },
    { key: 'subject',   label: '学科',     question: '请问是哪个学科？',       options: ['数学', '语文', '英语', '物理', '化学', '生物', '政治', '历史', '地理', '体育', '美术', '音乐'] },
    { key: 'grade',     label: '学段',     question: '请问是哪个学段？',       options: ['小学', '初中', '高中'] },
    { key: 'direction', label: '研究方向', question: '请问研究方向是什么？',   options: ['核心素养', '大单元教学', '跨学科融合', '数字化教学', 'AI赋能', '双减政策', '项目式学习'] },
    { key: 'title',     label: '课题名称', question: '请提供课题名称（可选，留空自动生成）', optional: true },
  ],
  kaiti: [
    { key: 'title',   label: '课题名称', question: '请问课题名称是什么？' },
    { key: 'subject', label: '学科',     question: '请问是哪个学科？', options: ['数学', '语文', '英语', '物理', '化学', '生物'] },
    { key: 'grade',   label: '学段',     question: '请问是哪个学段？', options: ['小学', '初中', '高中'] },
  ],
  zhongqi: [
    { key: 'title',    label: '课题名称', question: '请问课题名称是什么？' },
    { key: 'progress', label: '研究进展', question: '请简要描述目前的研究进展（已完成哪些工作）' },
  ],
  jieti: [
    { key: 'title',        label: '课题名称', question: '请问课题名称是什么？' },
    { key: 'achievements', label: '研究成果', question: '请描述取得的主要成果（论文/案例/资源包等）' },
  ],
};

const DOC_TYPE_NAMES = {
  shenbao: '课题申报书',
  kaiti:   '开题报告',
  zhongqi: '中期检查报告',
  jieti:   '结题报告',
};

export class QueryAgent extends BaseAgent {
  constructor() {
    super('QueryAgent', '识别意图，逐步收集生成参数');
  }

  /**
   * @param {{ session: object, userMessage: string }} task
   * @returns {{ done: boolean, question?: object, session: object }}
   */
  async run({ session, userMessage }) {
    // 如果还没有确定文档类型，先识别意图
    if (!session.docType) {
      const intent = this.#detectIntent(userMessage);
      if (!intent) {
        return {
          done: false,
          session,
          reply: {
            type: 'message',
            content: `我可以帮你生成以下课题文档：\n\n• **课题申报书** - 区级/市级/省级\n• **开题报告**\n• **中期检查报告**\n• **结题报告**\n\n请告诉我你需要什么？例如："帮我写一个市级数学课题申报书"`,
          },
        };
      }
      session.docType = intent.type;
      // 从用户消息中提取已有参数
      Object.assign(session.collectedData, intent.params);
    }

    // 找到下一个未填充的字段
    const fields = FIELDS[session.docType];
    const nextField = fields.find(
      f => !f.optional && !session.collectedData[f.key]
    );

    if (!nextField) {
      // 所有必填字段已收集完毕
      return { done: true, session };
    }

    // 如果是第一次问（刚识别意图），不需要保存上一个答案
    // 否则把用户的回答存到上一个字段
    if (session.fieldIndex > 0) {
      const prevField = fields[session.fieldIndex - 1];
      if (prevField && !session.collectedData[prevField.key]) {
        session.collectedData[prevField.key] = this.#parseAnswer(userMessage, prevField);
      }
    }

    // 重新找下一个未填充字段（可能刚才填了一个）
    const pendingField = fields.find(
      f => !f.optional && !session.collectedData[f.key]
    );

    if (!pendingField) {
      return { done: true, session };
    }

    session.fieldIndex = fields.indexOf(pendingField);

    const filled = Object.keys(session.collectedData).length;
    const total = fields.filter(f => !f.optional).length;

    return {
      done: false,
      session,
      reply: {
        type: 'question',
        content: pendingField.question,
        field: pendingField.key,
        options: pendingField.options,
        progress: Math.round((filled / total) * 100),
        collected: session.collectedData,
        docTypeName: DOC_TYPE_NAMES[session.docType],
      },
    };
  }

  #detectIntent(message) {
    const m = message;
    let type = null;

    if (m.includes('申报') || (m.includes('课题') && !m.includes('开题') && !m.includes('结题'))) {
      type = 'shenbao';
    } else if (m.includes('开题')) {
      type = 'kaiti';
    } else if (m.includes('中期')) {
      type = 'zhongqi';
    } else if (m.includes('结题')) {
      type = 'jieti';
    }

    if (!type) return null;

    return { type, params: this.#extractParams(message) };
  }

  #extractParams(message) {
    const p = {};
    if (message.includes('区级')) p.level = '区级';
    else if (message.includes('市级')) p.level = '市级';
    else if (message.includes('省级')) p.level = '省级';

    for (const s of ['数学', '语文', '英语', '物理', '化学', '生物', '政治', '历史', '地理']) {
      if (message.includes(s)) { p.subject = s; break; }
    }

    if (message.includes('小学')) p.grade = '小学';
    else if (message.includes('初中')) p.grade = '初中';
    else if (message.includes('高中')) p.grade = '高中';

    for (const [kw, val] of [
      ['核心素养', '核心素养'], ['大单元', '大单元教学'],
      ['跨学科', '跨学科融合'], ['数字化', '数字化教学'],
      ['AI赋能', 'AI赋能'], ['双减', '双减政策'],
    ]) {
      if (message.includes(kw)) { p.direction = val; break; }
    }

    return p;
  }

  #parseAnswer(message, field) {
    if (field.options) {
      // 尝试匹配选项
      const match = field.options.find(o => message.includes(o));
      if (match) return match;
      // 尝试数字选择
      const num = parseInt(message.trim());
      if (!isNaN(num) && num >= 1 && num <= field.options.length) {
        return field.options[num - 1];
      }
    }
    return message.trim();
  }
}
