export type DocumentType = "policy" | "template" | "case" | "other";

export interface ProjectInput {
  name: string;
  org: string;
  level: string;
  region: string;
  budget: string;
  domain: string;
  desc: string;
  edge: string;
}

export type WritingType = "function_description" | "general";

export interface OutlineItem {
  id: string;
  title: string;
  level: 1 | 2 | 3 | 4;
  promptKey?: string;
  writingType?: WritingType;
}

export interface Project extends ProjectInput {
  id: string;
  createdAt: string;
  updatedAt: string;
  outline?: OutlineItem[];
  exportStyle?: ExportStyle;
}

export interface ExportPageStyle {
  topMm: number;
  bottomMm: number;
  leftMm: number;
  rightMm: number;
}

export interface ExportTextStyle {
  chineseFont: string;
  westernFont: string;
  fontSizePt: number;
  bold: boolean;
  alignment: ExportAlignment;
  lineSpacing: ExportLineSpacing;
  spaceBefore: ExportParagraphSpacing;
  spaceAfter: ExportParagraphSpacing;
}

export interface ExportBodyStyle extends ExportTextStyle {
  firstLineIndentChars: number;
}

export type ExportAlignment = "left" | "center" | "right" | "both";
export type ExportLineSpacing = { mode: "single" | "multiple" | "fixed"; value: number };
export type ExportParagraphSpacing = { unit: "line" | "pt"; value: number };

export interface ExportStyle {
  page: ExportPageStyle;
  body: ExportBodyStyle;
  heading1: ExportTextStyle;
  heading2: ExportTextStyle;
  heading3: ExportTextStyle;
  heading4: ExportTextStyle;
}

export interface KBDoc {
  id: string;
  projectId: string;
  name: string;
  type: DocumentType;
  size: number;
  uploadedAt: string;
  chunkCount: number;
  summary: string;
}

export interface KBChunk {
  id: string;
  docId: string;
  projectId: string;
  docName: string;
  docType: DocumentType;
  text: string;
  charStart: number;
  charEnd: number;
}

export interface ChapterData {
  chapterId: string;
  content: string;
  wc: number;
  ragSources: string[];
  updatedAt: string;
}
