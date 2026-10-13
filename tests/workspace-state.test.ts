import assert from "node:assert/strict";
import test from "node:test";
import { hasUnsavedSectionDraft, isSameSectionLocation, needsGenerationReplacementConfirmation } from "../lib/workspace-state";

test("a generation location is project-and-section scoped, preventing cross-section UI updates", () => {
  const projectASectionOne = { projectId: "project-a", sectionId: "section-1" };
  assert.equal(isSameSectionLocation(projectASectionOne, { projectId: "project-a", sectionId: "section-1" }), true);
  assert.equal(isSameSectionLocation(projectASectionOne, { projectId: "project-a", sectionId: "section-2" }), false);
  assert.equal(isSameSectionLocation(projectASectionOne, { projectId: "project-b", sectionId: "section-1" }), false);
});

test("manual edits are unsaved until they exactly match the persisted chapter", () => {
  assert.equal(hasUnsavedSectionDraft("人工补充正文", "已保存正文"), true);
  assert.equal(hasUnsavedSectionDraft("人工补充正文"), true);
  assert.equal(hasUnsavedSectionDraft("已保存正文", "已保存正文"), false);
  assert.equal(hasUnsavedSectionDraft("", "已保存正文"), true, "clearing a saved body must be treated as a saveable change");
  assert.equal(hasUnsavedSectionDraft("", undefined), false);
});

test("draft generation requires an explicit replacement confirmation when visible content exists", () => {
  assert.equal(needsGenerationReplacementConfirmation("draft", "当前候选正文", "已保存正文"), true);
  assert.equal(needsGenerationReplacementConfirmation("draft", "", "已保存正文"), true);
  assert.equal(needsGenerationReplacementConfirmation("draft", "", undefined), false);
  assert.equal(needsGenerationReplacementConfirmation("polish", "当前候选正文", "已保存正文"), false);
});
