"use client";

import { Moon, Sun } from "lucide-react";

const themeStorageKey = "bee-suite-theme";

export function PublicThemeToggle() {
  function toggleTheme() {
    const root = document.documentElement;
    const nextDark = !root.classList.contains("dark");

    root.classList.toggle("dark", nextDark);
    root.style.colorScheme = nextDark ? "dark" : "light";
    window.localStorage.setItem(themeStorageKey, nextDark ? "dark" : "light");
  }

  return (
    <button
      type="button"
      aria-label="Toggle color theme"
      title="Toggle color theme"
      onClick={toggleTheme}
      className="grid size-11 shrink-0 touch-manipulation place-items-center rounded-xl border border-slate-900/10 bg-white/65 text-slate-700 shadow-sm transition-[background-color,border-color,color,transform] motion-safe:hover:-translate-y-0.5 hover:border-amber-500/35 hover:bg-white hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbf7ec] dark:border-white/15 dark:bg-white/[0.055] dark:text-zinc-300 dark:shadow-none dark:hover:border-white/25 dark:hover:bg-white/[0.09] dark:hover:text-white dark:focus-visible:ring-amber-200 dark:focus-visible:ring-offset-[#03070d]"
    >
      <Moon aria-hidden="true" className="size-4 dark:hidden" />
      <Sun aria-hidden="true" className="hidden size-4 dark:block" />
    </button>
  );
}
