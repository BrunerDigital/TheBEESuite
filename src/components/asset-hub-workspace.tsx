"use client";

import { useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Archive, Download, File, FileAudio, FileImage, FileSpreadsheet, FileText, FileVideo, Grid2X2, List, Presentation, Search, Sparkles, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { assetKind, ASSET_HUB_CATEGORIES, type AssetHubCategory } from "@/lib/asset-hub";
import { cn } from "@/lib/utils";

export type AssetHubItem = { id: string; name: string; contentType: string; size: number; category: AssetHubCategory; description: string; tags: string[]; uploadedBy: string; createdAt: string; previewUrl?: string | null };

const categoryLabels: Record<string, string> = { all: "All assets", social: "Social media", brand: "Brand", flyers: "Flyers", photos: "Photos", videos: "Videos", documents: "Documents", training: "Training", other: "Other" };
const kindIcons = { image: FileImage, video: FileVideo, audio: FileAudio, presentation: Presentation, spreadsheet: FileSpreadsheet, archive: Archive, document: FileText };
const formatBytes = (bytes: number) => bytes ? `${(bytes / 1024 / 1024).toFixed(bytes > 10 * 1024 * 1024 ? 0 : 1)} MB` : "—";

export function AssetHubWorkspace({ initialAssets, canManage }: { initialAssets: AssetHubItem[]; canManage: boolean }) {
  const router = useRouter();
  const [assets, setAssets] = useState(initialAssets);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [kind, setKind] = useState("all");
  const [sort, setSort] = useState("newest");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<AssetHubItem | null>(initialAssets[0] || null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadCategory, setUploadCategory] = useState<AssetHubCategory>("social");
  const [tags, setTags] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => assets.filter((asset) => {
    const haystack = `${asset.name} ${asset.description} ${asset.tags.join(" ")}`.toLowerCase();
    return (!query || haystack.includes(query.toLowerCase())) && (category === "all" || asset.category === category) && (kind === "all" || assetKind(asset.contentType, asset.name) === kind);
  }).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "size" ? b.size - a.size : b.createdAt.localeCompare(a.createdAt)), [assets, query, category, kind, sort]);

  async function uploadFiles() {
    if (!files.length) return;
    setBusy(true);
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setStatus(`Uploading ${index + 1} of ${files.length}: ${file.name}`);
        const preparedResponse = await fetch("/api/asset-hub/upload-url", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type, category: uploadCategory, description, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean) }) });
        const prepared = await preparedResponse.json();
        if (!preparedResponse.ok) throw new Error(prepared.error || "Upload could not be prepared.");
        if (!prepared.supabaseUrl || !prepared.supabaseKey) throw new Error("Public storage configuration is incomplete.");
        const client = createClient(prepared.supabaseUrl, prepared.supabaseKey, { auth: { persistSession: false } });
        const { error } = await client.storage.from(prepared.bucket).uploadToSignedUrl(prepared.storageKey, prepared.token, file, { contentType: file.type || "application/octet-stream", cacheControl: "3600" });
        if (error) throw new Error(error.message);
        const finalized = await fetch("/api/asset-hub/finalize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetId: prepared.assetId }) });
        if (!finalized.ok) throw new Error((await finalized.json()).error || "Upload could not be finalized.");
      }
      setStatus("Upload complete.");
      setUploadOpen(false); setFiles([]); setTags(""); setDescription("");
      router.refresh();
    } catch (error) { setStatus(error instanceof Error ? error.message : "Upload failed."); }
    finally { setBusy(false); }
  }

  async function removeAsset(asset: AssetHubItem) {
    if (!window.confirm(`Remove ${asset.name} from the corporate library?`)) return;
    const response = await fetch(`/api/asset-hub/${asset.id}`, { method: "DELETE" });
    if (response.ok) { setAssets((current) => current.filter((item) => item.id !== asset.id)); setSelected(null); }
  }

  return <div className="space-y-5">
    <section className="relative overflow-hidden rounded-2xl border border-amber-400/25 bg-[radial-gradient(circle_at_top_right,rgba(245,180,0,.15),transparent_35%),linear-gradient(135deg,rgba(20,20,18,.98),rgba(4,5,7,.98))] p-6 shadow-2xl">
      <div className="absolute right-8 top-5 text-amber-400/10"><Sparkles className="size-28" /></div>
      <div className="relative flex flex-wrap items-start justify-between gap-4"><div><div className="mb-2 text-xs font-semibold uppercase tracking-[.2em] text-amber-400">Corporate content library</div><h1 className="text-3xl font-semibold text-white">Asset Hub</h1><p className="mt-2 max-w-2xl text-sm text-zinc-400">Find approved graphics, videos, documents, flyers, and training resources uploaded by the executive team.</p></div>
      {canManage && <Dialog open={uploadOpen} onOpenChange={setUploadOpen}><DialogTrigger render={<Button className="bg-amber-400 text-black hover:bg-amber-300" />}><Upload /> Upload assets</DialogTrigger><DialogContent className="max-w-xl border-amber-400/20 bg-zinc-950 text-white"><DialogHeader><DialogTitle>Upload corporate assets</DialogTitle><DialogDescription>Add one or more files to every director’s secure library.</DialogDescription></DialogHeader><label className="grid min-h-32 cursor-pointer place-items-center rounded-xl border border-dashed border-amber-400/40 bg-amber-400/5 p-5 text-center"><div><Upload className="mx-auto mb-2 text-amber-400"/><div className="font-medium">Choose files</div><div className="text-xs text-zinc-500">Images, video, audio, PDFs, Office files, archives, and more</div></div><input className="sr-only" type="file" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))}/></label>{files.length > 0 && <div className="max-h-28 space-y-1 overflow-auto text-xs text-zinc-300">{files.map((file) => <div key={`${file.name}-${file.size}`} className="flex justify-between rounded bg-zinc-900 px-2 py-1"><span className="truncate">{file.name}</span><span>{formatBytes(file.size)}</span></div>)}</div>}<div className="grid grid-cols-2 gap-3"><label className="text-xs text-zinc-400">Category<select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value as AssetHubCategory)} className="mt-1 h-9 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-white">{ASSET_HUB_CATEGORIES.map((item) => <option key={item} value={item}>{categoryLabels[item]}</option>)}</select></label><label className="text-xs text-zinc-400">Tags<Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="summer, enrollment" className="mt-1"/></label></div><label className="text-xs text-zinc-400">Description<Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="How directors should use these files" className="mt-1"/></label>{status && <p className="text-xs text-amber-300">{status}</p>}<Button disabled={busy || !files.length} onClick={uploadFiles} className="bg-amber-400 text-black hover:bg-amber-300">{busy ? "Uploading…" : `Upload ${files.length || ""} file${files.length === 1 ? "" : "s"}`}</Button></DialogContent></Dialog>}
      </div><div className="relative mt-6 flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-4"><Search className="text-amber-400"/><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search files, descriptions, or tags…" className="h-12 border-0 bg-transparent text-base shadow-none focus-visible:ring-0"/>{query && <button onClick={() => setQuery("")}><X className="size-4 text-zinc-500"/></button>}</div>
    </section>
    <div className="grid gap-4 xl:grid-cols-[190px_minmax(0,1fr)_280px]">
      <aside className="rounded-2xl border border-border/70 bg-card/70 p-3"><div className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Collections</div>{["all", ...ASSET_HUB_CATEGORIES].map((item) => <button key={item} onClick={() => setCategory(item)} className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm", category === item ? "bg-amber-400/12 text-amber-400" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><span>{categoryLabels[item]}</span><span className="text-xs">{item === "all" ? assets.length : assets.filter((asset) => asset.category === item).length}</span></button>)}</aside>
      <main className="min-w-0"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">{categoryLabels[category]}</h2><p className="text-xs text-muted-foreground">{filtered.length} approved asset{filtered.length === 1 ? "" : "s"}</p></div><div className="flex gap-2"><select value={kind} onChange={(e) => setKind(e.target.value)} className="h-8 rounded-lg border border-border bg-card px-2 text-xs"><option value="all">All file types</option>{Object.keys(kindIcons).map((item) => <option key={item}>{item}</option>)}</select><select value={sort} onChange={(e) => setSort(e.target.value)} className="h-8 rounded-lg border border-border bg-card px-2 text-xs"><option value="newest">Newest</option><option value="name">Name</option><option value="size">Largest</option></select><div className="flex rounded-lg border border-border p-0.5"><button className={cn("rounded p-1", view === "grid" && "bg-muted")} onClick={() => setView("grid")}><Grid2X2 className="size-4"/></button><button className={cn("rounded p-1", view === "list" && "bg-muted")} onClick={() => setView("list")}><List className="size-4"/></button></div></div></div>
      {filtered.length === 0 ? <div className="grid min-h-80 place-items-center rounded-2xl border border-dashed border-border text-center"><div><Search className="mx-auto mb-2 text-muted-foreground"/><div className="font-medium">No matching assets</div><p className="text-sm text-muted-foreground">Try another search or collection.</p></div></div> : <div className={cn(view === "grid" ? "grid gap-3 sm:grid-cols-2 2xl:grid-cols-3" : "space-y-2")}>{filtered.map((asset) => { const Icon = kindIcons[assetKind(asset.contentType, asset.name) as keyof typeof kindIcons] || File; return <button key={asset.id} onClick={() => setSelected(asset)} className={cn("group overflow-hidden rounded-xl border text-left transition hover:-translate-y-0.5 hover:border-amber-400/50 hover:shadow-lg", selected?.id === asset.id ? "border-amber-400/60 bg-amber-400/5" : "border-border bg-card", view === "list" && "flex items-center gap-3 p-3")}>{view === "grid" && <div className="relative grid aspect-[16/9] place-items-center overflow-hidden bg-gradient-to-br from-zinc-900 to-zinc-800">{asset.previewUrl && assetKind(asset.contentType, asset.name) === "image" ? <Image src={asset.previewUrl} alt="" fill sizes="(min-width: 1536px) 33vw, (min-width: 640px) 50vw, 100vw" unoptimized className="object-cover"/> : <Icon className="size-12 text-amber-400/75"/>}</div>}<div className={cn("min-w-0", view === "grid" ? "p-3" : "flex flex-1 items-center justify-between gap-3")}><div className="min-w-0"><div className="truncate text-sm font-medium">{asset.name}</div><div className="mt-1 text-xs text-muted-foreground">{categoryLabels[asset.category]} · {formatBytes(asset.size)}</div></div>{view === "list" && <div className="text-xs text-muted-foreground">{new Date(asset.createdAt).toLocaleDateString()}</div>}</div></button>})}</div>}</main>
      <aside className="h-fit rounded-2xl border border-amber-400/20 bg-card/80 p-4 xl:sticky xl:top-4">{selected ? <><div className="relative grid aspect-video place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-zinc-900 to-zinc-800">{selected.previewUrl && assetKind(selected.contentType, selected.name) === "image" ? <Image src={selected.previewUrl} alt="" fill sizes="(min-width: 1280px) 280px, 100vw" unoptimized className="object-cover"/> : (() => { const Icon = kindIcons[assetKind(selected.contentType, selected.name) as keyof typeof kindIcons] || File; return <Icon className="size-14 text-amber-400"/>; })()}</div><h3 className="mt-4 break-words font-semibold">{selected.name}</h3><p className="mt-1 text-sm text-muted-foreground">{selected.description || "Corporate-approved resource"}</p><dl className="mt-4 space-y-2 text-xs"><div className="flex justify-between"><dt className="text-muted-foreground">Collection</dt><dd>{categoryLabels[selected.category]}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Size</dt><dd>{formatBytes(selected.size)}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Uploaded</dt><dd>{new Date(selected.createdAt).toLocaleDateString()}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">By</dt><dd className="text-right">{selected.uploadedBy}</dd></div></dl><Button render={<a href={`/api/asset-hub/download/${selected.id}`} />} className="mt-4 w-full bg-amber-400 text-black hover:bg-amber-300"><Download/> Download</Button>{canManage && <Button variant="destructive" onClick={() => removeAsset(selected)} className="mt-2 w-full"><Trash2/> Remove asset</Button>}</> : <div className="py-12 text-center text-sm text-muted-foreground">Select an asset to see details.</div>}</aside>
    </div>
  </div>;
}
