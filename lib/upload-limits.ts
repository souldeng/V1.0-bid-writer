/**
 * 单个材料文件的应用层大小上限。
 *
 * 上传路由会在解析并写入知识库前再次校验；浏览器端只用于尽早提示，
 * 不能替代服务端校验。
 */
export const MAX_UPLOAD_FILE_SIZE_BYTES = 100 * 1024 * 1024;
export const MAX_UPLOAD_FILE_SIZE_LABEL = "100MB";

export function isUploadFileSizeAllowed(size: number): boolean {
  return Number.isFinite(size) && size >= 0 && size <= MAX_UPLOAD_FILE_SIZE_BYTES;
}
