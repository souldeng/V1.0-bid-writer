import type { ExportAlignment, ExportBodyStyle, ExportLineSpacing, ExportPageStyle, ExportParagraphSpacing, ExportStyle, ExportTextStyle } from "@/lib/types";

export const WORD_FONT_SIZES = [
  { label: "二号", pt: 22 }, { label: "小二", pt: 18 }, { label: "三号", pt: 16 }, { label: "小三", pt: 15 },
  { label: "四号", pt: 14 }, { label: "小四", pt: 12 }, { label: "五号", pt: 10.5 }, { label: "小五", pt: 9 }, { label: "六号", pt: 7.5 },
] as const;

export const CHINESE_FONT_OPTIONS = ["宋体", "黑体", "仿宋", "楷体", "微软雅黑"];
export const WESTERN_FONT_OPTIONS = ["Times New Roman", "Arial", "Calibri"];
export const LINE_SPACING_OPTIONS = [
  { label: "单倍行距", mode: "single", value: 1 }, { label: "1.5 倍行距", mode: "multiple", value: 1.5 },
  { label: "2 倍行距", mode: "multiple", value: 2 }, { label: "固定值 25 磅", mode: "fixed", value: 25 },
] as const;
export const PARAGRAPH_SPACING_OPTIONS = [0, 0.5, 1, 1.5, 2] as const;

/** The only conversion used by the UI and renderer for Word's Chinese font-size names. */
export function wordFontSizeToPt(name: string): number | undefined {
  return WORD_FONT_SIZES.find((item) => item.label === name)?.pt;
}

export function wordFontSizeLabel(pt: number): string {
  return WORD_FONT_SIZES.find((item) => item.pt === pt)?.label || `自定义 ${pt} 磅`;
}

function defaultText(fontSizePt: number, spaceBeforeLines: number, spaceAfterLines: number): ExportTextStyle {
  return {
    chineseFont: "宋体", westernFont: "Times New Roman", fontSizePt, bold: true, alignment: "left",
    lineSpacing: { mode: "single", value: 1 }, spaceBefore: { unit: "line", value: spaceBeforeLines }, spaceAfter: { unit: "line", value: spaceAfterLines },
  };
}

/** A4 政企申报默认样式。界面使用中文字号、行和厘米，渲染层统一换算 DOCX 单位。 */
export const defaultExportStyle: ExportStyle = {
  page: { topMm: 25.4, bottomMm: 25.4, leftMm: 28, rightMm: 28 },
  body: { ...defaultText(12, 0, 0), bold: false, alignment: "both", lineSpacing: { mode: "fixed", value: 25 }, firstLineIndentChars: 2 },
  heading1: defaultText(16, 1, 0.5),
  heading2: defaultText(15, 0.75, 0.5),
  heading3: defaultText(14, 0.5, 0.25),
  heading4: defaultText(12, 0.5, 0.25),
};

export function getDefaultExportStyle(): ExportStyle {
  return structuredClone(defaultExportStyle);
}

function numberInRange(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function alignment(value: unknown, fallback: ExportAlignment): ExportAlignment {
  return value === "left" || value === "center" || value === "right" || value === "both" ? value : fallback;
}

function lineSpacing(value: unknown, legacyPt: unknown, fallback: ExportLineSpacing): ExportLineSpacing {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : null;
  if (input && (input.mode === "single" || input.mode === "multiple" || input.mode === "fixed")) {
    const maximum = input.mode === "fixed" ? 72 : 3;
    const minimum = input.mode === "fixed" ? 10 : input.mode === "single" ? 1 : 1.05;
    return { mode: input.mode, value: numberInRange(input.value, fallback.value, minimum, maximum) };
  }
  const oldValue = Number(legacyPt);
  return Number.isFinite(oldValue) && oldValue >= 10 && oldValue <= 72 ? { mode: "fixed", value: oldValue } : fallback;
}

function paragraphSpacing(value: unknown, legacyPt: unknown, fallback: ExportParagraphSpacing): ExportParagraphSpacing {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : null;
  if (input && (input.unit === "line" || input.unit === "pt")) return { unit: input.unit, value: numberInRange(input.value, fallback.value, 0, input.unit === "line" ? 4 : 72) };
  const oldValue = Number(legacyPt);
  return Number.isFinite(oldValue) && oldValue >= 0 && oldValue <= 72 ? { unit: "pt", value: oldValue } : fallback;
}

function textStyle(input: unknown, fallback: ExportTextStyle, withBodyFields = false): ExportTextStyle | ExportBodyStyle {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const common: ExportTextStyle = {
    chineseFont: typeof value.chineseFont === "string" && value.chineseFont.trim() ? value.chineseFont.trim().slice(0, 80) : fallback.chineseFont,
    westernFont: typeof value.westernFont === "string" && value.westernFont.trim() ? value.westernFont.trim().slice(0, 80) : fallback.westernFont,
    fontSizePt: numberInRange(value.fontSizePt, fallback.fontSizePt, 7, 36), bold: typeof value.bold === "boolean" ? value.bold : fallback.bold,
    alignment: alignment(value.alignment, fallback.alignment), lineSpacing: lineSpacing(value.lineSpacing, value.lineSpacingPt, fallback.lineSpacing),
    spaceBefore: paragraphSpacing(value.spaceBefore, value.spaceBeforePt, fallback.spaceBefore), spaceAfter: paragraphSpacing(value.spaceAfter, value.spaceAfterPt, fallback.spaceAfter),
  };
  if (!withBodyFields) return common;
  const bodyFallback = fallback as ExportBodyStyle;
  return { ...common, firstLineIndentChars: numberInRange(value.firstLineIndentChars, bodyFallback.firstLineIndentChars, 0, 4) };
}

/** Accepts legacy pt fields and current Word-friendly fields, then fills all missing values from one default. */
export function normalizeExportStyle(input: unknown): ExportStyle {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const pageValue = value.page && typeof value.page === "object" ? value.page as Record<string, unknown> : {};
  const page: ExportPageStyle = {
    topMm: numberInRange(pageValue.topMm, defaultExportStyle.page.topMm, 5, 60), bottomMm: numberInRange(pageValue.bottomMm, defaultExportStyle.page.bottomMm, 5, 60),
    leftMm: numberInRange(pageValue.leftMm, defaultExportStyle.page.leftMm, 5, 60), rightMm: numberInRange(pageValue.rightMm, defaultExportStyle.page.rightMm, 5, 60),
  };
  return {
    page, body: textStyle(value.body, defaultExportStyle.body, true) as ExportBodyStyle,
    heading1: textStyle(value.heading1, defaultExportStyle.heading1) as ExportTextStyle,
    heading2: textStyle(value.heading2, defaultExportStyle.heading2) as ExportTextStyle,
    heading3: textStyle(value.heading3, defaultExportStyle.heading3) as ExportTextStyle,
    heading4: textStyle(value.heading4, defaultExportStyle.heading4) as ExportTextStyle,
  };
}

export function lineSpacingSummary(value: ExportLineSpacing): string {
  if (value.mode === "single") return "单倍行距";
  if (value.mode === "fixed") return `固定 ${value.value} 磅`;
  return `${value.value} 倍行距`;
}

export function paragraphSpacingSummary(value: ExportParagraphSpacing, label: string): string {
  return value.value === 0 ? `${label} 0 行` : `${label} ${value.value}${value.unit === "line" ? " 行" : " 磅"}`;
}
