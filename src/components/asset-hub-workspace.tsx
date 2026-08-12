"use client";

import { useId, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { SchoolDateTime } from "@/components/school-time-zone-context";
import {
  Archive,
  Download,
  File,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Grid2X2,
  List,
  Printer,
  Presentation,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  assetKind,
  ASSET_HUB_CATEGORIES,
  type AssetHubCategory,
} from "@/lib/asset-hub";
import { cn } from "@/lib/utils";

export type AssetHubItem = {
  id: string;
  name: string;
  contentType: string;
  size: number;
  category: AssetHubCategory;
  description: string;
  tags: string[];
  uploadedBy: string;
  createdAt: string;
  previewUrl?: string | null;
};

const categoryLabels: Record<string, string> = {
  all: "All assets",
  social: "Social media",
  brand: "Brand",
  flyers: "Flyers",
  photos: "Photos",
  videos: "Videos",
  documents: "Documents",
  training: "Training",
  other: "Other",
};
const kindIcons = {
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  presentation: Presentation,
  spreadsheet: FileSpreadsheet,
  archive: Archive,
  document: FileText,
};
const formatBytes = (bytes: number) =>
  bytes
    ? `${(bytes / 1024 / 1024).toFixed(bytes > 10 * 1024 * 1024 ? 0 : 1)} MB`
    : "—";

export function AssetHubWorkspace({
  initialAssets,
  canManage,
}: {
  initialAssets: AssetHubItem[];
  canManage: boolean;
}) {
  const router = useRouter();
  const uploadFieldId = useId();
  const [assets, setAssets] = useState(initialAssets);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [kind, setKind] = useState("all");
  const [sort, setSort] = useState("newest");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<AssetHubItem | null>(
    initialAssets[0] || null,
  );
  const [uploadOpen, setUploadOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadCategory, setUploadCategory] =
    useState<AssetHubCategory>("social");
  const [tags, setTags] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(
    () =>
      assets
        .filter((asset) => {
          const haystack =
            `${asset.name} ${asset.description} ${asset.tags.join(" ")}`.toLowerCase();
          return (
            (!query || haystack.includes(query.toLowerCase())) &&
            (category === "all" || asset.category === category) &&
            (kind === "all" ||
              assetKind(asset.contentType, asset.name) === kind)
          );
        })
        .sort((a, b) =>
          sort === "name"
            ? a.name.localeCompare(b.name)
            : sort === "size"
              ? b.size - a.size
              : b.createdAt.localeCompare(a.createdAt),
        ),
    [assets, query, category, kind, sort],
  );

  async function uploadFiles() {
    if (!files.length) return;
    setBusy(true);
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setStatus(`Uploading ${index + 1} of ${files.length}: ${file.name}`);
        const preparedResponse = await fetch("/api/asset-hub/upload-url", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: file.name,
            size: file.size,
            contentType: file.type,
            category: uploadCategory,
            description,
            tags: tags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
          }),
        });
        const prepared = await preparedResponse.json();
        if (!preparedResponse.ok)
          throw new Error(prepared.error || "Upload could not be prepared.");
        if (!prepared.supabaseUrl || !prepared.supabaseKey)
          throw new Error("Public storage configuration is incomplete.");
        const client = createClient(
          prepared.supabaseUrl,
          prepared.supabaseKey,
          { auth: { persistSession: false } },
        );
        const { error } = await client.storage
          .from(prepared.bucket)
          .uploadToSignedUrl(prepared.storageKey, prepared.token, file, {
            contentType: file.type || "application/octet-stream",
            cacheControl: "3600",
          });
        if (error) throw new Error(error.message);
        const finalized = await fetch("/api/asset-hub/finalize", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ assetId: prepared.assetId }),
        });
        if (!finalized.ok)
          throw new Error(
            (await finalized.json()).error || "Upload could not be finalized.",
          );
      }
      setStatus("Upload complete.");
      setUploadOpen(false);
      setFiles([]);
      setTags("");
      setDescription("");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function removeAsset(asset: AssetHubItem) {
    if (!window.confirm(`Remove ${asset.name} from the corporate library?`))
      return;
    const response = await fetch(`/api/asset-hub/${asset.id}`, {
      method: "DELETE",
    });
    if (response.ok) {
      setAssets((current) => current.filter((item) => item.id !== asset.id));
      setSelected(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border bg-card p-5 text-card-foreground md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 text-sm font-medium text-muted-foreground">
              Corporate content library
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Asset Hub</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Find, download, and print approved forms, templates, graphics,
              flyers, and training resources uploaded by the executive team.
            </p>
          </div>
          {canManage && (
            <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
              <DialogTrigger
                render={
                  <Button type="button" />
                }
              >
                <Upload /> Upload assets
              </DialogTrigger>
              <DialogContent className="max-w-xl bg-popover text-popover-foreground">
                <DialogHeader>
                  <DialogTitle>Upload corporate assets</DialogTitle>
                  <DialogDescription>
                    Add one or more files to every director’s secure library.
                  </DialogDescription>
                </DialogHeader>
                <label htmlFor={`${uploadFieldId}-files`} className="grid min-h-32 cursor-pointer place-items-center rounded-xl border border-dashed bg-muted/30 p-5 text-center hover:bg-muted/50 focus-within:outline-none focus-within:ring-2 focus-within:ring-ring">
                  <div>
                    <Upload aria-hidden="true" className="mx-auto mb-2 text-amber-600 dark:text-amber-400" />
                    <div className="font-medium">Choose files</div>
                    <div className="text-xs text-muted-foreground">
                      Images, video, audio, PDFs, Office files, archives, and
                      more
                    </div>
                  </div>
                  <input
                    id={`${uploadFieldId}-files`}
                    className="sr-only"
                    type="file"
                    multiple
                    onChange={(event) =>
                      setFiles(Array.from(event.target.files || []))
                    }
                  />
                </label>
                {files.length > 0 && (
                  <div className="max-h-28 space-y-1 overflow-auto text-xs text-foreground">
                    {files.map((file) => (
                      <div
                        key={`${file.name}-${file.size}`}
                        className="flex justify-between gap-3 rounded-md border bg-muted/40 px-2 py-1.5"
                      >
                        <span className="truncate">{file.name}</span>
                        <span className="shrink-0 text-muted-foreground">{formatBytes(file.size)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label htmlFor={`${uploadFieldId}-category`} className="text-xs text-muted-foreground">
                    Category
                    <select
                      id={`${uploadFieldId}-category`}
                      value={uploadCategory}
                      onChange={(e) =>
                        setUploadCategory(e.target.value as AssetHubCategory)
                      }
                      className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {ASSET_HUB_CATEGORIES.map((item) => (
                        <option key={item} value={item}>
                          {categoryLabels[item]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label htmlFor={`${uploadFieldId}-tags`} className="text-xs text-muted-foreground">
                    Tags
                    <Input
                      id={`${uploadFieldId}-tags`}
                      value={tags}
                      onChange={(e) => setTags(e.target.value)}
                      placeholder="summer, enrollment"
                      className="mt-1"
                    />
                  </label>
                </div>
                <label htmlFor={`${uploadFieldId}-description`} className="text-xs text-muted-foreground">
                  Description
                  <Input
                    id={`${uploadFieldId}-description`}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="How directors should use these files"
                    className="mt-1"
                  />
                </label>
                {status && <p className="text-sm text-foreground" role="status" aria-live="polite">{status}</p>}
                <Button
                  type="button"
                  disabled={busy || !files.length}
                  aria-busy={busy}
                  onClick={uploadFiles}
                >
                  {busy
                    ? "Uploading…"
                    : `Upload ${files.length || ""} file${files.length === 1 ? "" : "s"}`}
                </Button>
              </DialogContent>
            </Dialog>
          )}
        </div>
        <div className="mt-6 flex items-center gap-2 rounded-xl border bg-background px-3">
          <Search aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
          <Input
            aria-label="Search asset library"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files, descriptions, or tags…"
            className="h-12 border-0 bg-transparent px-1 text-base text-foreground shadow-none focus-visible:ring-0"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear asset search" className="grid size-11 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X aria-hidden="true" className="size-4" />
            </button>
          )}
        </div>
      </section>
      <div className="grid gap-4 xl:grid-cols-[190px_minmax(0,1fr)_280px]">
        <aside className="rounded-2xl border border-border/70 bg-card/70 p-3" aria-label="Asset collections">
          <div className="px-2 pb-2 text-sm font-medium text-muted-foreground">
            Collections
          </div>
          {["all", ...ASSET_HUB_CATEGORIES].map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={category === item}
              onClick={() => setCategory(item)}
              className={cn(
                "flex min-h-11 w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                category === item
                  ? "bg-amber-500/10 text-amber-800 dark:text-amber-300"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <span>{categoryLabels[item]}</span>
              <span className="text-xs">
                {item === "all"
                  ? assets.length
                  : assets.filter((asset) => asset.category === item).length}
              </span>
            </button>
          ))}
        </aside>
        <main className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">{categoryLabels[category]}</h2>
              <p className="text-xs text-muted-foreground">
                {filtered.length} approved asset
                {filtered.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                aria-label="Filter assets by file type"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="h-11 rounded-lg border border-border bg-card px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="all">All file types</option>
                {Object.keys(kindIcons).map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <select
                aria-label="Sort assets"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="h-11 rounded-lg border border-border bg-card px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="newest">Newest</option>
                <option value="name">Name</option>
                <option value="size">Largest</option>
              </select>
              <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label="Asset layout">
                <button
                  type="button"
                  aria-label="Grid view"
                  aria-pressed={view === "grid"}
                  className={cn("grid size-11 place-items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", view === "grid" && "bg-muted")}
                  onClick={() => setView("grid")}
                >
                  <Grid2X2 aria-hidden="true" className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label="List view"
                  aria-pressed={view === "list"}
                  className={cn("grid size-11 place-items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", view === "list" && "bg-muted")}
                  onClick={() => setView("list")}
                >
                  <List aria-hidden="true" className="size-4" />
                </button>
              </div>
            </div>
          </div>
          {filtered.length === 0 ? (
            <div className="grid min-h-80 place-items-center rounded-2xl border border-dashed border-border text-center">
              <div>
                <Search aria-hidden="true" className="mx-auto mb-2 text-muted-foreground" />
                <div className="font-medium">No matching assets</div>
                <p className="text-sm text-muted-foreground">
                  Try another search or collection.
                </p>
              </div>
            </div>
          ) : (
            <div
              className={cn(
                view === "grid"
                  ? "grid gap-3 sm:grid-cols-2 2xl:grid-cols-3"
                  : "space-y-2",
              )}
            >
              {filtered.map((asset) => {
                const Icon =
                  kindIcons[
                    assetKind(
                      asset.contentType,
                      asset.name,
                    ) as keyof typeof kindIcons
                  ] || File;
                return (
                  <button
                    key={asset.id}
                    type="button"
                    aria-label={`Show details for ${asset.name}`}
                    aria-pressed={selected?.id === asset.id}
                    onClick={() => setSelected(asset)}
                    className={cn(
                      "group overflow-hidden rounded-xl border text-left transition-colors hover:border-amber-400/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected?.id === asset.id
                        ? "border-amber-400/60 bg-amber-400/5"
                        : "border-border bg-card",
                      view === "list" && "flex items-center gap-3 p-3",
                    )}
                  >
                    {view === "grid" && (
                      <div className="relative grid aspect-[16/9] place-items-center overflow-hidden bg-muted">
                        {asset.previewUrl &&
                        assetKind(asset.contentType, asset.name) === "image" ? (
                          <Image
                            src={asset.previewUrl}
                            alt=""
                            fill
                            sizes="(min-width: 1536px) 33vw, (min-width: 640px) 50vw, 100vw"
                            unoptimized
                            className="object-cover"
                          />
                        ) : (
                          <Icon aria-hidden="true" className="size-12 text-amber-600/75 dark:text-amber-400/75" />
                        )}
                      </div>
                    )}
                    <div
                      className={cn(
                        "min-w-0",
                        view === "grid"
                          ? "p-3"
                          : "flex flex-1 items-center justify-between gap-3",
                      )}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {asset.name}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {categoryLabels[asset.category]} ·{" "}
                          {formatBytes(asset.size)}
                        </div>
                      </div>
                      {view === "list" && (
                        <div className="text-xs text-muted-foreground">
                          <SchoolDateTime value={asset.createdAt} options={{ month: "short", day: "numeric", year: "numeric" }} />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </main>
        <aside className="h-fit rounded-2xl border border-amber-400/20 bg-card/80 p-4 xl:sticky xl:top-4">
          {selected ? (
            <>
              <div className="relative grid aspect-video place-items-center overflow-hidden rounded-xl bg-muted">
                {selected.previewUrl &&
                assetKind(selected.contentType, selected.name) === "image" ? (
                  <Image
                    src={selected.previewUrl}
                    alt=""
                    fill
                    sizes="(min-width: 1280px) 280px, 100vw"
                    unoptimized
                    className="object-cover"
                  />
                ) : (
                  (() => {
                    const Icon =
                      kindIcons[
                        assetKind(
                          selected.contentType,
                          selected.name,
                        ) as keyof typeof kindIcons
                      ] || File;
                    return <Icon aria-hidden="true" className="size-14 text-amber-600 dark:text-amber-400" />;
                  })()
                )}
              </div>
              <h3 className="mt-4 break-words font-semibold">
                {selected.name}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {selected.description || "Corporate-approved resource"}
              </p>
              <dl className="mt-4 space-y-2 text-xs">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Collection</dt>
                  <dd>{categoryLabels[selected.category]}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Size</dt>
                  <dd>{formatBytes(selected.size)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Uploaded</dt>
                  <dd><SchoolDateTime value={selected.createdAt} options={{ month: "short", day: "numeric", year: "numeric" }} /></dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">By</dt>
                  <dd className="text-right">{selected.uploadedBy}</dd>
                </div>
              </dl>
              <Button
                render={<a href={`/api/asset-hub/download/${selected.id}`} />}
                className="mt-4 w-full"
              >
                <Download aria-hidden="true" /> Download
              </Button>
              <Button
                render={
                  <a
                    href={`/api/asset-hub/download/${selected.id}?mode=print`}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
                variant="outline"
                className="mt-2 w-full"
              >
                <Printer aria-hidden="true" /> Print
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                {selected.contentType === "application/pdf" ||
                selected.name.toLowerCase().endsWith(".pdf")
                  ? "Opens securely in a new tab so you can print the PDF."
                  : "Downloads the editable template so you can open and print it in Word."}
              </p>
              {canManage && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => removeAsset(selected)}
                  className="mt-2 w-full"
                >
                  <Trash2 aria-hidden="true" /> Remove asset
                </Button>
              )}
            </>
          ) : (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Select an asset to see details.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
