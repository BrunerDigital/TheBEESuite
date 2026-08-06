import Link from "next/link";

export default function ParentsNotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#05070a] px-6 text-white">
      <section className="max-w-md space-y-5 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">The BEE Suite</p>
        <h1 className="text-3xl font-semibold">Parent portal path not found.</h1>
        <p className="text-sm leading-6 text-slate-300">
          That parent URL is no longer active. Use the links below to continue in your family workspace.
        </p>
        <div className="flex flex-col gap-3">
          <Link
            href="/parents"
            className="inline-flex items-center justify-center rounded-md bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
          >
            Parent login
          </Link>
          <Link
            href="/parent-portal"
            className="inline-flex items-center justify-center rounded-md border border-white/15 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-white/35 hover:text-white"
          >
            Parent portal workspace
          </Link>
        </div>
      </section>
    </main>
  );
}

