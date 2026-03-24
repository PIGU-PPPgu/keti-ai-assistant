/**
 * Word 文档生成服务 v2
 * 正式课题申报书格式：封面 + 目录提示 + 正文
 * 字体：标题 SimHei，正文 SimSun，英文 Times New Roman
 * 页边距：上下2.54cm，左右3.17cm（标准A4）
 */

import {
  Document, Packer, Paragraph, TextRun,
  HeadingLevel, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType,
  Footer, Header, PageNumber, PageBreak,
  ShadingType, convertInchesToTwip,
} from 'docx';

const CM = (cm) => Math.round(cm * 567); // cm to twip

export async function generateWordDocument(content, metadata = {}) {
  const { title = '课题文档', docType = 'shenbao', params = {} } = metadata;

  const docTypeName = { shenbao:'课题申报书', kaiti:'开题报告', zhongqi:'中期检查报告', jieti:'结题报告' }[docType] || '课题文档';

  const bodyElements = parseMarkdown(content);

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: { name: 'SimSun' }, size: 24 },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: CM(2.54), bottom: CM(2.54),
            left: CM(3.17), right: CM(3.17),
          },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            children: [new TextRun({ text: docTypeName, font: { name: 'SimSun' }, size: 20, color: '888888' })],
            alignment: AlignmentType.CENTER,
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' } },
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [
              new TextRun({ text: '第 ', font: { name: 'SimSun' }, size: 20 }),
              new TextRun({ children: [PageNumber.CURRENT], font: { name: 'SimSun' }, size: 20 }),
              new TextRun({ text: ' 页，共 ', font: { name: 'SimSun' }, size: 20 }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], font: { name: 'SimSun' }, size: 20 }),
              new TextRun({ text: ' 页', font: { name: 'SimSun' }, size: 20 }),
            ],
            alignment: AlignmentType.CENTER,
          })],
        }),
      },
      children: [
        // ── 封面 ──────────────────────────────────────────────
        new Paragraph({ text: '', spacing: { before: CM(3) } }),
        new Paragraph({
          children: [new TextRun({ text: docTypeName, font: { name: 'SimHei' }, size: 56, bold: true, color: '1D1D1D' })],
          alignment: AlignmentType.CENTER,
          spacing: { before: CM(1), after: CM(0.5) },
        }),
        new Paragraph({
          children: [new TextRun({ text: title, font: { name: 'SimHei' }, size: 36, bold: true, color: '333333' })],
          alignment: AlignmentType.CENTER,
          spacing: { before: CM(0.5), after: CM(2) },
        }),
        // 封面信息表
        ...buildCoverTable(params),
        new Paragraph({ text: '', spacing: { before: CM(2) } }),
        new Paragraph({
          children: [new TextRun({ text: new Date().getFullYear() + ' 年', font: { name: 'SimSun' }, size: 28, color: '666666' })],
          alignment: AlignmentType.CENTER,
        }),
        // 分页
        new Paragraph({ children: [new PageBreak()] }),
        // ── 正文 ──────────────────────────────────────────────
        ...bodyElements,
      ],
    }],
  });

  return Packer.toBuffer(doc);
}

function buildCoverTable(params) {
  const rows = [
    params.level     && ['课题级别', params.level],
    params.subject   && ['学　　科', params.subject],
    params.grade     && ['学　　段', params.grade],
    params.direction && ['研究方向', params.direction],
  ].filter(Boolean);

  if (!rows.length) return [];

  return [new Table({
    width: { size: 60, type: WidthType.PERCENTAGE },
    margins: { top: 100, bottom: 100, left: 200, right: 200 },
    rows: rows.map(([label, value]) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 30, type: WidthType.PERCENTAGE },
            children: [new Paragraph({
              children: [new TextRun({ text: label, font: { name: 'SimHei' }, size: 24, bold: true })],
              alignment: AlignmentType.CENTER,
            })],
            shading: { type: ShadingType.SOLID, color: 'F5F5F5' },
            borders: { top: { style: BorderStyle.SINGLE, size: 4 }, bottom: { style: BorderStyle.SINGLE, size: 4 }, left: { style: BorderStyle.SINGLE, size: 4 }, right: { style: BorderStyle.SINGLE, size: 4 } },
          }),
          new TableCell({
            width: { size: 70, type: WidthType.PERCENTAGE },
            children: [new Paragraph({
              children: [new TextRun({ text: value, font: { name: 'SimSun' }, size: 24 })],
              alignment: AlignmentType.CENTER,
            })],
            borders: { top: { style: BorderStyle.SINGLE, size: 4 }, bottom: { style: BorderStyle.SINGLE, size: 4 }, left: { style: BorderStyle.SINGLE, size: 4 }, right: { style: BorderStyle.SINGLE, size: 4 } },
          }),
        ],
      })
    ),
  })];
}

function parseMarkdown(markdown) {
  const elements = [];
  const lines = markdown.split('\n');
  let i = 0;
  let tableRows = [];
  let inTable = false;

  while (i < lines.length) {
    const line = lines[i];

    // 分隔线 → 段落间距
    if (line.match(/^---+$/)) {
      elements.push(new Paragraph({ text: '', spacing: { before: 200, after: 200 } }));
      i++; continue;
    }

    // 表格
    if (line.startsWith('|')) {
      if (!inTable) { inTable = true; tableRows = []; }
      if (!line.match(/^\|[-:\s|]+\|$/)) {
        tableRows.push(parseTableRow(line));
      }
      i++;
      if (i >= lines.length || !lines[i].startsWith('|')) {
        elements.push(createTable(tableRows));
        inTable = false;
      }
      continue;
    }

    // 标题
    const headingMatch = line.match(/^(#{1,4}) (.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const sizes = [36, 30, 26, 24];
      const headingLevels = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];
      elements.push(new Paragraph({
        heading: headingLevels[level - 1],
        spacing: { before: level === 1 ? 600 : 400, after: 200 },
        children: [new TextRun({
          text,
          bold: true,
          font: { name: level <= 2 ? 'SimHei' : 'SimSun' },
          size: sizes[level - 1],
          color: level === 1 ? '1D1D1D' : '333333',
        })],
      }));
      i++; continue;
    }

    // 有序列表
    if (line.match(/^\d+[.)]\s/)) {
      const text = line.replace(/^\d+[.)]\s/, '');
      elements.push(new Paragraph({
        children: parseInline(line),
        spacing: { before: 80, after: 80 },
        indent: { left: 360 },
      }));
      i++; continue;
    }

    // 无序列表
    if (line.match(/^[-*]\s/)) {
      elements.push(new Paragraph({
        children: [new TextRun({ text: '• ', font: { name: 'SimSun' }, size: 24 }), ...parseInline(line.slice(2))],
        spacing: { before: 80, after: 80 },
        indent: { left: 360 },
      }));
      i++; continue;
    }

    // 空行
    if (line.trim() === '') {
      elements.push(new Paragraph({ text: '', spacing: { before: 60, after: 60 } }));
      i++; continue;
    }

    // 普通段落（首行缩进2字符）
    elements.push(new Paragraph({
      children: parseInline(line),
      spacing: { before: 100, after: 100, line: 360 }, // 1.5倍行距
      indent: { firstLine: 480 }, // 首行缩进
    }));
    i++;
  }

  return elements;
}

function parseInline(text) {
  const runs = [];
  // 处理粗体 **text**
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  for (const part of parts) {
    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push(new TextRun({ text: part.slice(2, -2), bold: true, font: { name: 'SimSun' }, size: 24 }));
    } else if (part) {
      runs.push(new TextRun({ text: part, font: { name: 'SimSun' }, size: 24 }));
    }
  }
  return runs.length ? runs : [new TextRun({ text, font: { name: 'SimSun' }, size: 24 })];
}

function parseTableRow(line) {
  return line.split('|').filter((_, i, arr) => i > 0 && i < arr.length - 1).map(c => c.trim());
}

function createTable(rows) {
  if (!rows.length) return new Paragraph({ text: '' });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((cells, rowIdx) =>
      new TableRow({
        tableHeader: rowIdx === 0,
        children: cells.map(cell =>
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({
                text: cell,
                font: { name: 'SimSun' },
                size: 22,
                bold: rowIdx === 0,
              })],
              alignment: rowIdx === 0 ? AlignmentType.CENTER : AlignmentType.LEFT,
            })],
            shading: rowIdx === 0 ? { type: ShadingType.SOLID, color: 'E8E8E8' } : undefined,
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4 },
              bottom: { style: BorderStyle.SINGLE, size: 4 },
              left: { style: BorderStyle.SINGLE, size: 4 },
              right: { style: BorderStyle.SINGLE, size: 4 },
            },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
          })
        ),
      })
    ),
  });
}
