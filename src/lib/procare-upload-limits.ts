// Keep browser uploads below Vercel's 4.5 MB Function request-body ceiling.
// The remaining headroom covers multipart field names, boundaries, and review metadata.
export const MAX_PROCARE_SOURCE_FILES = 500;
export const MAX_PROCARE_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_PROCARE_UPLOAD_LABEL = "4 MB";

export function procareSourceSizeBytes(files: ArrayLike<{ size: number }>) {
  return Array.from(files).reduce((total, file) => total + file.size, 0);
}

export function procareSourceFitsBrowserUpload(files: ArrayLike<{ size: number }>) {
  return files.length <= MAX_PROCARE_SOURCE_FILES
    && procareSourceSizeBytes(files) <= MAX_PROCARE_UPLOAD_BYTES;
}
