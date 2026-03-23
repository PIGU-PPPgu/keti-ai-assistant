/**
 * Word 文档生成服务
 * 保留原有的 docx 生成逻辑，做了轻微清理
 */

import {
  Document, Packer, Paragraph, TextRun,
  HeadingLevel, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType,
  Footer, Header, PageNumber,
} from 'docx';

export async function generateWordDocument(content, metadata = {}) {
  const sections = parseMarkdown(content);

  const doc = new Document({
    sections: [{
      properties: {
        page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            children: [new TextRun({ text: metadata.title || '课题文档', font: 'SimSun', size: 20, color: '666666' })],
            alignment: AlignmentType.CENTER,
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [
              new TextRun({ text: '第 ', font: 'SimSun', size: 20 }),
              new TextRun({ children: [PageNumber.CURRENT], font: 'SimSun', size: 20 }),
              new TextRun({ text: ' 页', font: 'SimSun', size: 20 }),
            ],
            alignment: AlignmentType.CENTER,
          })],
        }),
      },
      children: sections,
    }],
  });

  return Packer.toBuffer(doc);
}

function parseMarkdown(markdown) {
  const elements = [];
  const lines = markdown.split('\n');
  let i = 0;
  let tableRows = [];
  let inTable = false;

  while (i < lines.length) {
    const line = lines[i];

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
      const sizes = [32, 28, 24, 22];
      const headingLevels = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];
      elements.push(new Paragraph({
        heading: headingLevels[level - 1],
        spacing: { before: 400 - (level - 1) * 50, after: 200 - (level - 1) * 25 },
        children: [new TextRun({ text, bold: true, font: 'SimHei', size: sizes[level - 1] })],
      }));
      i++;
      continue;
    }

    // 列表
    if (line.match(/^[-*] /)) {
      elements.push(new Paragraph({
        children: [new TextRun({ text: '• ' + line.slice(2), font: 'SimSun', size: 24 })],
        spacing: { before: 100, after: 100 },
        indent: { left: 360 },
      }));
      i++;
      continue;
    }

    // 空行
    if (line.trim() === '') {
      elements.push(new Paragraph({ text: '' }));
      i++;
      continue;
    }

    // 普通段落（处理粗体）
    elements.push(new Paragraph({
      children: parseInline(line),
      spacing: { before: 100, after: 100 },
    }));
    i++;
  }

  return elements;
}

function parseInline(text) {
  const runs = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  for (const part of parts) {
    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push(new TextRun({ text: part.slice(2, -2), bold: true, font: 'SimSun', size: 24 }));
    } else if (part) {
      runs.push(new TextRun({ text: part, font: 'SimSun', size: 24 }));
    }
  }
  return runs.length ? runs : [new TextRun({ text, font: 'SimSun', size: 24 })];
}

function parseTableRow(line) {
  return line.split('|').filter((_, i, arr) => i > 0 && i < arr.length - 1).map(c => c.trim());
}

function createTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((cells, rowIdx) =>
      new TableRow({
        children: cells.map(cell =>
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: cell, font: 'SimSun', size: 24, bold: rowIdx === 0 })],
            })],
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1 },
              bottom: { style: BorderStyle.SINGLE, size: 1 },
              left: { style: BorderStyle.SINGLE, size: 1 },
              right: { style: BorderStyle.SINGLE, size: 1 },
            },
          })
        ),
      })
    ),
  });
}
