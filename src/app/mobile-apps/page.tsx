import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import QRCode from "qrcode";
import { BrandLogo } from "@/components/brand-logo";
import { MobileSupportIntake } from "@/components/mobile-support-intake";
import { launchApps, launchCheckedAt, launchGuides, launchSafety, mobileFaqs, verifiedStoreUrl } from "@/lib/mobile-launch";

export const metadata: Metadata = { title: "Mobile Apps & Onboarding | The BEE Suite", description: "Find the right BEE Suite app, use your existing login, and get role-specific onboarding and support." };
const linkClass = "inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700";

export default async function MobileAppsPage() {
  const apps = await Promise.all(launchApps.map(async (app) => { const url = verifiedStoreUrl(app); return { ...app, url, qr: url ? await QRCode.toDataURL(url, { width: 160, margin: 2 }) : null }; }));
  return <main className="min-h-screen bg-[#eef7ff] text-slate-950 selection:bg-amber-200">
    <a href="#downloads" className="sr-only focus:not-sr-only focus:p-4">Skip to downloads</a>
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4"><BrandLogo href="/" size="md" textClassName="[&>span]:text-slate-700" priority /><Link className={linkClass} href="/app">Web sign-in</Link></header>
      <section className="my-8 rounded-3xl border border-white bg-white p-6 shadow-sm sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-widest text-slate-600">Your school. One connected day.</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">The BEE Suite Mobile Apps</h1>
        <p className="mt-5 max-w-2xl text-lg leading-8">A familiar login for your family, classroom, and school. Start with your role below, then follow the guide at your own pace.</p>
        <p className="mt-6 rounded-2xl bg-[#fff2b8] p-5 leading-7">{launchSafety}</p>
        <nav aria-label="Onboarding sections" className="mt-6 flex flex-wrap gap-5 text-sm font-semibold underline"><a href="#downloads">Downloads</a><a href="#guides">Role guides</a><a href="#faq">FAQ</a><a href="#support">Get support</a></nav>
      </section>
      <section id="downloads" className="scroll-mt-6"><h2 className="text-2xl font-bold">Choose your app</h2><p className="mt-2 text-sm">Availability checked {launchCheckedAt}. Download links appear only after public verification.</p>
        <div className="mt-5 grid gap-5 md:grid-cols-2">{apps.map((app) => <article key={app.bundleId} className="rounded-3xl border border-blue-100 bg-white p-6"><p className="text-sm font-semibold text-slate-600">{app.role}</p><h3 className="mt-2 text-2xl font-bold">{app.name}</h3><p className="my-4 text-sm">{app.devices}</p>{app.url ? <div className="flex flex-wrap items-center gap-5"><a className={linkClass} href={app.url}>Download on the App Store</a>{app.qr && <Image src={app.qr} width={160} height={160} alt={`QR code for ${app.name} on the App Store`} unoptimized />}</div> : <p className="inline-block rounded-xl bg-amber-100 px-4 py-3 font-semibold">Coming shortly</p>}</article>)}</div>
        <div className="mt-5 rounded-3xl bg-[#d9ecff] p-6"><h3 className="text-xl font-bold">Keep going on the web</h3><p className="mt-2 leading-7">Directors, executives, and school kiosks use their web workspace. Parents and teachers can use the web while store availability is confirmed. Android users can use the web; no Android store release is verified here.</p><div className="mt-5 flex flex-wrap gap-3">{[...launchGuides.map((g) => [g.title, g.login]), ["Executive", "/executives"]].map(([title, login]) => <Link key={login} className={linkClass} href={login}>{title} sign-in</Link>)}</div><p className="mt-4 text-sm">The source iOS targets specify iPhone / iOS 16+. Approved-binary compatibility and iPad support still require verification in the public listing.</p></div>
      </section>
      <section id="guides" className="mt-12 scroll-mt-6"><h2 className="text-2xl font-bold">Your first-day guide</h2><p className="mt-2">Open your role. Printable PDFs use the same guide content.</p><div className="mt-5 grid gap-5 md:grid-cols-2">{launchGuides.map((guide) => <article id={guide.id} key={guide.id} className="scroll-mt-6 rounded-3xl bg-white p-6"><h3 className="text-2xl font-bold">{guide.title}</h3><p className="mt-3 leading-7">{guide.intro}</p><a className="mt-4 inline-block min-h-11 py-2 font-semibold underline" href={`/guides/mobile-${guide.id}.pdf`}>Download {guide.title.toLowerCase()} PDF</a><ol className="mt-3 space-y-5">{guide.steps.map(([title, body], index) => <li key={title}><h4 className="font-bold">{index + 1}. {title}</h4><p className="mt-1 text-sm leading-7 text-slate-700">{body}</p></li>)}</ol></article>)}</div></section>
      <section id="faq" className="mt-12 scroll-mt-6 rounded-3xl bg-white p-6 sm:p-8"><h2 className="text-2xl font-bold">Frequently asked questions</h2><div className="mt-4 divide-y divide-slate-200">{mobileFaqs.map(([q, a]) => <details key={q} className="py-4"><summary className="cursor-pointer py-2 font-semibold">{q}</summary><p className="mt-3 max-w-3xl text-sm leading-7">{a}</p></details>)}</div></section>
      <section id="support" className="mt-12 scroll-mt-6 rounded-3xl bg-white p-6 sm:p-8"><h2 className="mb-5 text-2xl font-bold">Get help with your launch</h2><MobileSupportIntake /></section>
      <footer className="flex flex-wrap gap-6 py-10 text-sm font-semibold underline"><Link href="/privacy">Privacy policy</Link><Link href="/terms">Terms</Link><Link href="/support">Support & account deletion</Link><Link href="/resources">All guides</Link><Link href="/app">Web sign-in</Link></footer>
    </div>
  </main>;
}
