import { DecisionTabs } from "@/components/decisions/DecisionTabs";

export default function DecisionsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-medium text-ink">Decisions</h1>
        <p className="mt-1 text-sm text-muted">Trade-quality review</p>
        <div className="mt-4">
          <DecisionTabs />
        </div>
      </header>
      {children}
    </div>
  );
}
