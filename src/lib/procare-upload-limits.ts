// Keep the complete multipart request below Vercel's 4.5 MB Function ceiling.
// Source headroom covers review row-number lists; request headroom covers encoder variance.
export const MAX_PROCARE_SOURCE_FILES = 500;
export const MAX_PROCARE_SOURCE_BYTES = Math.floor(3.5 * 1024 * 1024);
export const MAX_PROCARE_SOURCE_LABEL = "3.5 MB";
export const MAX_PROCARE_MULTIPART_BYTES = 4 * 1024 * 1024;
export const MAX_PROCARE_MULTIPART_LABEL = "4 MB";

export function procareSourceSizeBytes(files: ArrayLike<{ size: number }>) {
  return Array.from(files).reduce((total, file) => total + file.size, 0);
}

export function procareTextSizeBytes(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

export function procareSourceFitsBrowserUpload(files: ArrayLike<{ size: number }>) {
  return files.length <= MAX_PROCARE_SOURCE_FILES
    && procareSourceSizeBytes(files) <= MAX_PROCARE_SOURCE_BYTES;
}

export async function procareMultipartSizeBytes(formData: FormData) {
  return (await new Response(formData).blob()).size;
}
