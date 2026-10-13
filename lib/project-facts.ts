import type { Project } from "@/lib/types";

type Fact = [label: string, value: string];

function present(label: string, value: string): Fact | null {
  const cleaned = String(value || "").trim();
  return cleaned ? [label, cleaned] : null;
}

/** Only user-supplied values become facts in AI generation context. */
export function getProjectPromptFacts(project: Project): Fact[] {
  return [
    present("项目名称", project.name),
    present("申报主体", project.org),
    present("申报级别", project.level),
    present("所在地区", project.region),
    present("项目预算", project.budget),
    present("建设领域", project.domain),
    present("建设内容", project.desc),
    present("项目优势", project.edge),
  ].filter((fact): fact is Fact => Boolean(fact));
}

export function formatProjectFactsForPrompt(project: Project): string {
  return `## 项目信息\n${getProjectPromptFacts(project).map(([label, value]) => `- ${label}：${value}`).join("\n")}\n`;
}

/** DOCX metadata follows the same rule: omit absent optional facts entirely. */
export function getProjectExportFacts(project: Project): Fact[] {
  return [
    present("申报主体", project.org),
    present("申报级别", project.level),
    present("所在地区", project.region),
    present("预算", project.budget),
  ].filter((fact): fact is Fact => Boolean(fact));
}
