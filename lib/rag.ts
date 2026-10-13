import { listChunks, replaceDocument } from "@/lib/data";
import type { KBChunk, KBDoc } from "@/lib/types";

export { type KBChunk, type KBDoc } from "@/lib/types";

export const BM25_K1 = 1.2;
export const BM25_B = 0.75;
const BM25_K3 = 1.2;

export function chunkText(text: string, chunkSize = 600, overlap = 100) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const chunks: { text: string; charStart: number; charEnd: number }[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + chunkSize, normalized.length);
    if (end < normalized.length) {
      const boundary = Math.max(normalized.lastIndexOf("\n", end), normalized.lastIndexOf("。", end), normalized.lastIndexOf("；", end));
      if (boundary > start + Math.floor(chunkSize / 2)) end = boundary + 1;
    }
    const value = normalized.slice(start, end).trim();
    if (value) chunks.push({ text: value, charStart: start, charEnd: end });
    if (end >= normalized.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

/**
 * MVP 词法切分：中文连续文本拆为重叠双字词元；英文、数字和连字符专有词整体保留。
 * 例如“高质量数据集 BM25-2026”会产生“高质、质量、量数、数据、据集、bm25-2026”。
 */
export function tokenize(text: string): string[] {
  const terms: string[] = [];
  const segments = text.toLowerCase().match(/[\u3400-\u9fff]+|[a-z][a-z0-9._+-]*|\d+(?:[._-]\d+)*/g) ?? [];
  for (const segment of segments) {
    if (/^[\u3400-\u9fff]+$/.test(segment)) {
      if (segment.length === 1) terms.push(segment);
      else for (let index = 0; index < segment.length - 1; index += 1) terms.push(segment.slice(index, index + 2));
    } else {
      terms.push(segment);
    }
  }
  return terms;
}

function termFrequency(terms: string[]): Map<string, number> {
  return terms.reduce((frequency, term) => {
    frequency.set(term, (frequency.get(term) ?? 0) + 1);
    return frequency;
  }, new Map<string, number>());
}

export async function addDocument(document: KBDoc, rawText: string): Promise<void> {
  const chunks: KBChunk[] = chunkText(rawText).map((chunk, index) => ({
    id: `${document.id}-${index}`,
    docId: document.id,
    projectId: document.projectId,
    docName: document.name,
    docType: document.type,
    text: chunk.text,
    charStart: chunk.charStart,
    charEnd: chunk.charEnd,
  }));
  await replaceDocument({ ...document, chunkCount: chunks.length }, chunks);
}

/**
 * 对当前项目的材料分块做 BM25 词法检索。
 * 旧数据中遗留的 vector 字段会被忽略；BM25 只依据 text 现场计算，避免数据迁移。
 */
export type RetrievedChunk = KBChunk & { score: number };

/** Same BM25 ranking as retrieve(), with scores retained for offline evaluation evidence only. */
export async function retrieveWithScores(projectId: string, query: string, topK = 5): Promise<RetrievedChunk[]> {
  const chunks = await listChunks(projectId);
  const queryFrequency = termFrequency(tokenize(query));
  if (!chunks.length || !queryFrequency.size || topK <= 0) return [];

  const documents = chunks.map((chunk) => {
    const terms = tokenize(chunk.text);
    return { chunk, frequency: termFrequency(terms), length: terms.length };
  });
  const averageLength = documents.reduce((sum, document) => sum + document.length, 0) / documents.length || 1;
  const documentFrequency = new Map<string, number>();
  for (const document of documents) {
    for (const term of document.frequency.keys()) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  return documents
    .map((document) => {
      let score = 0;
      for (const [term, queryTf] of queryFrequency) {
        const documentTf = document.frequency.get(term) ?? 0;
        if (!documentTf) continue;
        const df = documentFrequency.get(term) ?? 0;
        const idf = Math.log(1 + (documents.length - df + 0.5) / (df + 0.5));
        const lengthNormalization = 1 - BM25_B + BM25_B * (document.length / averageLength);
        const tfWeight = (documentTf * (BM25_K1 + 1)) / (documentTf + BM25_K1 * lengthNormalization);
        const queryWeight = ((BM25_K3 + 1) * queryTf) / (BM25_K3 + queryTf);
        score += idf * tfWeight * queryWeight;
      }
      return { chunk: document.chunk, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, topK)
    .map(({ chunk, score }) => ({ ...chunk, score }));
}

/** Product retrieval keeps its existing score-free return shape. */
export async function retrieve(projectId: string, query: string, topK = 5): Promise<KBChunk[]> {
  return (await retrieveWithScores(projectId, query, topK)).map(({ score: _score, ...chunk }) => chunk);
}

export function buildRagContext(chunks: KBChunk[]): string {
  if (!chunks.length) return "";
  const grouped = new Map<string, string[]>();
  for (const chunk of chunks) grouped.set(chunk.docName, [...(grouped.get(chunk.docName) || []), chunk.text]);
  return `\n\n## 已上传材料摘录（仅在相关时参考，不得把未证实内容当作事实）\n${Array.from(grouped.entries()).map(([name, texts]) => `【${name}】\n${texts.join("\n")}`).join("\n\n")}`;
}
