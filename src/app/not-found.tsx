import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#05070a] px-6 text-white">
      <section className="max-w-md space-y-5 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">The BEE Suite</p>
        <h1 className="text-3xl font-semibold">Page not found.</h1>
        <p className="text-sm leading-6 text-slate-300">
          The link may be outdated, or the page may have moved. Choose a destination below.
        </p>
        <div className="flex flex-col gap-3">
          <Link
            href="/parents"
            className="inline-flex items-center justify-center rounded-md bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
          >
            Open Parent Portal
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-white/15 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-white/35 hover:text-white"
          >
            Go to The BEE Suite home
          </Link>
        </div>
      </section>
    </main>
  );
}

