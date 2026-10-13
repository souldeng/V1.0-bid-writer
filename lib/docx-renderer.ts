import { AlignmentType, Document, HeadingLevel, LineRuleType, Paragraph, TextRun } from "docx";
import { getDefaultExportStyle, normalizeExportStyle } from "@/lib/export-style";
import { getProjectExportFacts } from "@/lib/project-facts";
import { outlineNumbers } from "@/lib/outline";
import type { ChapterData, ExportAlignment, ExportLineSpacing, ExportParagraphSpacing, ExportStyle, ExportTextStyle, OutlineItem, Project } from "@/lib/types";

const TWIPS_PER_POINT = 20;
const TWIPS_PER_MM = 56.6929;

export type DocxTextRenderOptions = {
  run: { font: { eastAsia: string; ascii: string; hAnsi: string; cs: string }; size: number; bold: boolean };
  paragraph: { alignment: (typeof AlignmentType)[keyof typeof AlignmentType]; spacing: { before: number; after: number; line: number; lineRule: (typeof LineRuleType)[keyof typeof LineRuleType] }; indent?: { firstLine: number } };
};

export type DocxRenderOptions = {
  page: { size: { width: number; height: number }; margin: { top: number; bottom: number; left: number; right: number } };
  body: DocxTextRenderOptions;
  heading1: DocxTextRenderOptions;
  heading2: DocxTextRenderOptions;
  heading3: DocxTextRenderOptions;
  heading4: DocxTextRenderOptions;
};
export type DocxOutlineEntry = { item: OutlineItem; number: string; content?: string };

/** Central DOCX-unit conversion for millimetres shown as centimetres in the UI. */
export function mmToDocx(mm: number): number { return Math.round(mm * TWIPS_PER_MM); }
export function indentCharsToDocx(fontSizePt: number, chars: number): number { return Math.round(fontSizePt * TWIPS_PER_POINT * chars); }

/** Word's automatic line rule is based on 240 twips per single line; fixed values use points. */
export function lineSpacingToDocx(value: ExportLineSpacing): { line: number; lineRule: (typeof LineRuleType)[keyof typeof LineRuleType] } {
  if (value.mode === "fixed") return { line: Math.round(value.value * TWIPS_PER_POINT), lineRule: LineRuleType.EXACT };
  const multiplier = value.mode === "single" ? 1 : value.value;
  return { line: Math.round(240 * multiplier), lineRule: LineRuleType.AUTO };
}

/** A paragraph "line" follows the effective configured line height; raw points remain available for custom input. */
export function paragraphSpacingToDocx(value: ExportParagraphSpacing, textStyle: Pick<ExportTextStyle, "fontSizePt" | "lineSpacing">): number {
  if (value.unit === "pt") return Math.round(value.value * TWIPS_PER_POINT);
  const linePt = textStyle.lineSpacing.mode === "fixed" ? textStyle.lineSpacing.value : textStyle.fontSizePt * (textStyle.lineSpacing.mode === "single" ? 1 : textStyle.lineSpacing.value);
  return Math.round(value.value * linePt * TWIPS_PER_POINT);
}

function alignmentToDocx(value: ExportAlignment): (typeof AlignmentType)[keyof typeof AlignmentType] {
  return value === "center" ? AlignmentType.CENTER : value === "right" ? AlignmentType.RIGHT : value === "both" ? AlignmentType.JUSTIFIED : AlignmentType.LEFT;
}

function textOptions(style: ExportTextStyle, firstLineIndentChars?: number): DocxTextRenderOptions {
  const run = { font: { eastAsia: style.chineseFont, ascii: style.westernFont, hAnsi: style.westernFont, cs: style.westernFont }, size: Math.round(style.fontSizePt * 2), bold: style.bold };
  const indent = firstLineIndentChars ? { firstLine: indentCharsToDocx(style.fontSizePt, firstLineIndentChars) } : undefined;
  return {
    run,
    paragraph: {
      alignment: alignmentToDocx(style.alignment),
      spacing: { before: paragraphSpacingToDocx(style.spaceBefore, style), after: paragraphSpacingToDocx(style.spaceAfter, style), ...lineSpacingToDocx(style.lineSpacing) },
      ...(indent ? { indent } : {}),
    } as DocxTextRenderOptions["paragraph"],
  };
}

/** Converts the compact, project-level Word-style model to docx's internal units in one place. */
export function getDocxRenderOptions(input?: ExportStyle): DocxRenderOptions {
  const style = input ? normalizeExportStyle(input) : getDefaultExportStyle();
  return {
    page: { size: { width: 11906, height: 16838 }, margin: { top: mmToDocx(style.page.topMm), bottom: mmToDocx(style.page.bottomMm), left: mmToDocx(style.page.leftMm), right: mmToDocx(style.page.rightMm) } },
    body: textOptions(style.body, style.body.firstLineIndentChars), heading1: textOptions(style.heading1), heading2: textOptions(style.heading2), heading3: textOptions(style.heading3), heading4: textOptions(style.heading4),
  };
}

function paragraph(text: string, options: DocxTextRenderOptions, heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel]): Paragraph {
  return new Paragraph({ text, ...(heading ? { heading } : {}), alignment: options.paragraph.alignment, spacing: options.paragraph.spacing, ...(options.paragraph.indent ? { indent: options.paragraph.indent } : {}), run: options.run });
}

/** Outline always decides document structure; saved ChapterData only adds optional body text. */
export function getDocxOutlineEntries(outline: OutlineItem[], chapters: Record<string, ChapterData>): DocxOutlineEntry[] {
  const numbers = outlineNumbers(outline);
  return outline.map((item, index) => {
    const content = chapters[item.id]?.content?.trim();
    return { item, number: numbers[index], ...(content ? { content } : {}) };
  });
}

/** Creates a stable editable DOCX while leaving document content, ordering and empty-fact filtering unchanged. */
export function createProjectDocx(project: Project, outline: OutlineItem[], chapters: Record<string, ChapterData>, exportStyle?: ExportStyle): Document {
  const options = getDocxRenderOptions(exportStyle ?? project.exportStyle);
  const content: Paragraph[] = [paragraph(project.name, options.heading1, HeadingLevel.TITLE)];
  const facts = getProjectExportFacts(project);
  if (facts.length) content.push(new Paragraph({ children: facts.map(([label, value]) => new TextRun({ text: `${label}：${value}    `, bold: label === "申报主体", ...options.body.run })), alignment: options.body.paragraph.alignment, spacing: { ...options.body.paragraph.spacing, before: 0, after: Math.round(8 * TWIPS_PER_POINT) }, run: options.body.run }));
  for (const entry of getDocxOutlineEntries(outline, chapters)) {
    const { item } = entry;
    const heading = item.level === 1 ? HeadingLevel.HEADING_1 : item.level === 2 ? HeadingLevel.HEADING_2 : item.level === 3 ? HeadingLevel.HEADING_3 : HeadingLevel.HEADING_4;
    const headingOptions = item.level === 1 ? options.heading1 : item.level === 2 ? options.heading2 : item.level === 3 ? options.heading3 : options.heading4;
    content.push(paragraph(`${entry.number} ${item.title}`, headingOptions, heading));
    for (const line of entry.content?.split(/\n+/) || []) if (line.trim()) content.push(paragraph(line.trim(), options.body));
  }
  return new Document({
    styles: { default: { document: { run: options.body.run, paragraph: options.body.paragraph }, heading1: { run: options.heading1.run, paragraph: options.heading1.paragraph }, heading2: { run: options.heading2.run, paragraph: options.heading2.paragraph }, heading3: { run: options.heading3.run, paragraph: options.heading3.paragraph }, heading4: { run: options.heading4.run, paragraph: options.heading4.paragraph } } },
    sections: [{ properties: { page: options.page }, children: content }],
  });
}
