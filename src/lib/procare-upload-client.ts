export async function stageProcareSourceFiles(centerId: string, files: File[], onProgress: (percent: number) => void) {
  const descriptors = [];
  for (const file of files) {
    const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    descriptors.push({ name: file.name, size: file.size, sha256: Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("") });
  }
  const response = await fetch("/api/imports/procare/upload", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ centerId, files: descriptors }),
  });
  const result = await response.json().catch(() => null) as { error?: string; receipt?: string; expiresAt?: number; uploads?: Array<{ signedUrl: string }> } | null;
  if (!response.ok || !result?.receipt || !result.expiresAt || result.uploads?.length !== files.length) throw new Error(result?.error || "Secure upload could not be prepared. Your selected files are retained.");
  const total = files.reduce((sum, file) => sum + file.size, 0);
  let completed = 0;
  for (const [index, file] of files.entries()) {
    await new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("PUT", result.uploads![index].signedUrl);
      request.setRequestHeader("x-upsert", "false");
      request.timeout = 120_000;
      request.upload.onprogress = event => onProgress(Math.min(9, 1 + Math.round(((completed + event.loaded) / total) * 8)));
      request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error("A report did not finish uploading. Keep the files selected and retry."));
      request.onerror = request.ontimeout = request.onabort = () => reject(new Error("Report upload was interrupted. Keep the same files selected and retry."));
      const body = new FormData();
      body.append("cacheControl", "0");
      body.append("", file);
      request.send(body);
    });
    completed += file.size;
  }
  return { receipt: result.receipt, expiresAt: result.expiresAt };
}
