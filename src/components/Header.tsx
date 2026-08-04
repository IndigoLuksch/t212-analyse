"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SyncPill } from "./SyncPill";
import { StockSwitcher } from "./StockSwitcher";

const NAV = [
  { href: "/", label: "Portfolio" },
  { href: "/pies", label: "Pies" },
  { href: "/decisions", label: "Decisions" },
] as const;

export function Header({
  instruments,
}: {
  instruments: { ticker: string; name: string }[];
}) {
  const pathname = usePathname();

  return (
    <header className="border-b border-border px-6 py-4">
      <div className="mx-auto flex max-w-6xl items-center gap-8">
        <Link href="/" className="text-[15px] font-medium tracking-tight text-ink">
          t212‑analyse
        </Link>
        <nav className="flex items-center gap-5 text-[14px]">
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  active ? "text-ink" : "text-ink-secondary hover:text-ink"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <StockSwitcher instruments={instruments} />
          <SyncPill />
        </div>
      </div>
    </header>
  );
}
