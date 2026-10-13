export type UploadFailure<T> = { file: T; reason: string };

/** Processes every selected file so one parsing or network failure cannot stop later files. */
export async function processFilesIndependently<T>(files: readonly T[], upload: (file: T) => Promise<void>): Promise<{ succeeded: T[]; failed: UploadFailure<T>[] }> {
  const succeeded: T[] = [];
  const failed: UploadFailure<T>[] = [];
  for (const file of files) {
    try {
      await upload(file);
      succeeded.push(file);
    } catch (error) {
      failed.push({ file, reason: error instanceof Error && error.message ? error.message : "上传处理失败，请稍后重试。" });
    }
  }
  return { succeeded, failed };
}
