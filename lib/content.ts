/**
 * The editor stores plain Word-ready text. Models occasionally emit Markdown
 * headings even when asked not to, so remove only heading markers at line start.
 */
export function normalizeGeneratedContent(content: string): string {
  return content.replace(/^\s{0,3}#{1,6}(?:\s+|$)/gm, "");
}

/** Counts visible Chinese/English characters consistently with the editor. */
export function countTextChars(content: string): number {
  return content.replace(/\s/g, "").length;
}

export type ParagraphMetric = { index: number; chars: number; isLong: boolean };

/** A paragraph is one non-empty editor line; long paragraphs are only flagged, never changed. */
export function getParagraphMetrics(content: string, longThreshold = 300): ParagraphMetric[] {
  return content.split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      const chars = countTextChars(line);
      return { index: index + 1, chars, isLong: chars > longThreshold };
    });
}
