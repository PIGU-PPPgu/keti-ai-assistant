/**
 * Word 文档生成器
 * 使用 docx 库生成排好版的 Word 文档
 */

import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, PageBreak, Footer, PageNumber, Header } from 'docx';

/**
 * 生成课题申报书 Word 文档
 */
export async function generateWordDocument(content, metadata) {
  // 解析 Markdown 内容
  const sections = parseMarkdown(content);
  
  // 创建文档
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: 1440,    // 1 inch = 1440 twips
            right: 1440,
            bottom: 1440,
            left: 1440
          }
        }
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: metadata.title || '课题申报书',
                  font: 'SimSun',
                  size: 20, // 10pt
                  color: '666666'
                })
              ],
              alignment: AlignmentType.CENTER
            })
          ]
        })
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: '第 ',
                  font: 'SimSun',
                  size: 20
                }),
                new TextRun({
                  children: [PageNumber.CURRENT],
                  font: 'SimSun',
                  size: 20
                }),
                new TextRun({
                  text: ' 页',
                  font: 'SimSun',
                  size: 20
                })
              ],
              alignment: AlignmentType.CENTER
            })
          ]
        })
      },
      children: sections
    }]
  });
  
  // 生成 Buffer
  const buffer = await Packer.toBuffer(doc);
  return buffer;
}

/**
 * 解析 Markdown 内容为 Word 元素
 */
function parseMarkdown(markdown) {
  const elements = [];
  const lines = markdown.split('\n');
  
  let i = 0;
  let inTable = false;
  let tableRows = [];
  let inCodeBlock = false;
  let codeContent = [];
  
  while (i < lines.length) {
    const line = lines[i];
    
    // 代码块
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        // 结束代码块
        elements.push(new Paragraph({
          children: [
            new TextRun({
              text: codeContent.join('\n'),
              font: 'Courier New',
              size: 20,
              shading: { fill: 'F5F5F5' }
            })
          ],
          spacing: { before: 200, after: 200 }
        }));
        codeContent = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      i++;
      continue;
    }
    
    if (inCodeBlock) {
      codeContent.push(line);
      i++;
      continue;
    }
    
    // 表格
    if (line.startsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      
      // 跳过分隔行
      if (!line.match(/^\|[-:\s|]+\|$/)) {
        const cells = parseTableRow(line);
        tableRows.push(cells);
      }
      
      i++;
      
      // 检查下一行是否还是表格
      if (i >= lines.length || !lines[i].startsWith('|')) {
        // 表格结束，生成 Word 表格
        elements.push(createTable(tableRows));
        inTable = false;
        tableRows = [];
      }
      
      continue;
    }
    
    // 标题
    if (line.startsWith('# ')) {
      elements.push(new Paragraph({
        text: line.substring(2),
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
        children: [
          new TextRun({
            text: line.substring(2),
            bold: true,
            font: 'SimHei',
            size: 32 // 16pt
          })
        ]
      }));
      i++;
      continue;
    }
    
    if (line.startsWith('## ')) {
      elements.push(new Paragraph({
        text: line.substring(3),
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 150 },
        children: [
          new TextRun({
            text: line.substring(3),
            bold: true,
            font: 'SimHei',
            size: 28 // 14pt
          })
        ]
      }));
      i++;
      continue;
    }
    
    if (line.startsWith('### ')) {
      elements.push(new Paragraph({
        text: line.substring(4),
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 200, after: 100 },
        children: [
          new TextRun({
            text: line.substring(4),
            bold: true,
            font: 'SimHei',
            size: 24 // 12pt
          })
        ]
      }));
      i++;
      continue;
    }
    
    if (line.startsWith('#### ')) {
      elements.push(new Paragraph({
        text: line.substring(5),
        heading: HeadingLevel.HEADING_4,
        spacing: { before: 150, after: 100 },
        children: [
          new TextRun({
            text: line.substring(5),
            bold: true,
            font: 'SimHei',
            size: 22 // 11pt
          })
        ]
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
    
    // 列表
    if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(new Paragraph({
        text: line.substring(2),
        bullet: { level: 0 },
        spacing: { before: 50, after: 50 },
        children: parseInlineFormatting(line.substring(2))
      }));
      i++;
      continue;
    }
    
    // 有序列表
    if (line.match(/^\d+\.\s/)) {
      const text = line.replace(/^\d+\.\s/, '');
      elements.push(new Paragraph({
        text: text,
        numbering: { reference: 'default-numbering', level: 0 },
        spacing: { before: 50, after: 50 },
        children: parseInlineFormatting(text)
      }));
      i++;
      continue;
    }
    
    // 引用
    if (line.startsWith('> ')) {
      elements.push(new Paragraph({
        text: line.substring(2),
        indent: { left: 720 },
        spacing: { before: 100, after: 100 },
        children: [
          new TextRun({
            text: line.substring(2),
            italics: true,
            font: 'SimSun',
            size: 22
          })
        ]
      }));
      i++;
      continue;
    }
    
    // 普通段落
    elements.push(new Paragraph({
      spacing: { before: 100, after: 100, line: 360 },
      children: parseInlineFormatting(line)
    }));
    
    i++;
  }
  
  return elements;
}

/**
 * 解析行内格式（粗体、斜体、代码）
 */
function parseInlineFormatting(text) {
  const runs = [];
  let current = '';
  let i = 0;
  
  while (i < text.length) {
    // 粗体
    if (text.substring(i, i + 2) === '**') {
      if (current) {
        runs.push(new TextRun({ text: current, font: 'SimSun', size: 22 }));
        current = '';
      }
      
      const end = text.indexOf('**', i + 2);
      if (end !== -1) {
        runs.push(new TextRun({
          text: text.substring(i + 2, end),
          bold: true,
          font: 'SimHei',
          size: 22
        }));
        i = end + 2;
        continue;
      }
    }
    
    // 斜体
    if (text[i] === '*' && text[i + 1] !== '*') {
      if (current) {
        runs.push(new TextRun({ text: current, font: 'SimSun', size: 22 }));
        current = '';
      }
      
      const end = text.indexOf('*', i + 1);
      if (end !== -1) {
        runs.push(new TextRun({
          text: text.substring(i + 1, end),
          italics: true,
          font: 'SimSun',
          size: 22
        }));
        i = end + 1;
        continue;
      }
    }
    
    // 行内代码
    if (text[i] === '`') {
      if (current) {
        runs.push(new TextRun({ text: current, font: 'SimSun', size: 22 }));
        current = '';
      }
      
      const end = text.indexOf('`', i + 1);
      if (end !== -1) {
        runs.push(new TextRun({
          text: text.substring(i + 1, end),
          font: 'Courier New',
          size: 20,
          shading: { fill: 'F0F0F0' }
        }));
        i = end + 1;
        continue;
      }
    }
    
    current += text[i];
    i++;
  }
  
  if (current) {
    runs.push(new TextRun({ text: current, font: 'SimSun', size: 22 }));
  }
  
  return runs.length > 0 ? runs : [new TextRun({ text: text, font: 'SimSun', size: 22 })];
}

/**
 * 解析表格行
 */
function parseTableRow(line) {
  return line
    .split('|')
    .map(cell => cell.trim())
    .filter(cell => cell !== '');
}

/**
 * 创建 Word 表格
 */
function createTable(rows) {
  if (rows.length === 0) return new Paragraph({ text: '' });
  
  const tableRows = rows.map((row, rowIndex) => {
    const cells = row.map(cellText => {
      return new TableCell({
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: cellText,
                bold: rowIndex === 0, // 第一行加粗
                font: rowIndex === 0 ? 'SimHei' : 'SimSun',
                size: 20
              })
            ]
          })
        ],
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1 },
          bottom: { style: BorderStyle.SINGLE, size: 1 },
          left: { style: BorderStyle.SINGLE, size: 1 },
          right: { style: BorderStyle.SINGLE, size: 1 }
        }
      });
    });
    
    return new TableRow({
      children: cells,
      tableHeader: rowIndex === 0
    });
  });
  
  return new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE }
  });
}
