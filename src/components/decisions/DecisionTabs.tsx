"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/decisions/buying", label: "Buying" },
  { href: "/decisions/selling", label: "Selling" },
  { href: "/decisions/pipeline", label: "Pipeline" },
] as const;

export function DecisionTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-5 text-[14px]">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={active ? "text-ink" : "text-ink-secondary hover:text-ink"}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
