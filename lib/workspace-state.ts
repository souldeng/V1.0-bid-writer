export type SectionLocation = {
  projectId: string;
  sectionId: string;
};

export function isSameSectionLocation(left: SectionLocation, right: SectionLocation): boolean {
  return left.projectId === right.projectId && left.sectionId === right.sectionId;
}

/** A draft differs from the last persisted chapter, including a new manually written chapter. */
export function hasUnsavedSectionDraft(draft: string, savedContent?: string): boolean {
  return draft !== (savedContent || "");
}

/** Draft generation replaces the visible editor, so it needs an explicit confirmation whenever content exists. */
export function needsGenerationReplacementConfirmation(mode: "draft" | "polish", draft: string, savedContent?: string): boolean {
  return mode === "draft" && Boolean(draft.trim() || savedContent?.trim());
}
