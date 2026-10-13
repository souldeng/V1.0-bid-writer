/** Deliberately maps only status codes to user-facing copy; never expose server exception text. */
export function getDocxExportFailureMessage(status?: number): string {
  if (status === 400) return "当前没有可导出的已保存章节，请先保存正文后重试。";
  if (status === 404) return "当前项目不存在或已被删除，请重新选择项目后重试。";
  return "导出文件生成失败，请稍后重试。";
}
