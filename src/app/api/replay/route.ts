import { NextResponse } from "next/server";
import { z } from "zod";
import { runReplaySweep } from "@/lib/analysis/portfolio";
import { RULES } from "@/lib/metrics/rules";
import { migrate } from "@/lib/db/migrate";

const bodySchema = z.object({
  ruleId: z.string().min(1),
  params: z.record(z.string(), z.number()).default({}),
  policy: z.enum(["cash", "benchmark", "prorata"]),
});

export async function GET(): Promise<NextResponse> {
  migrate();
  return NextResponse.json({
    rules: RULES.map((r) => ({
      id: r.id,
      label: r.label,
      params: r.params,
    })),
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  migrate();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const rule = RULES.find((r) => r.id === parsed.data.ruleId);
  if (!rule) {
    return NextResponse.json({ error: "Unknown rule" }, { status: 400 });
  }

  try {
    const sweep = runReplaySweep(parsed.data);
    return NextResponse.json({
      ruleId: parsed.data.ruleId,
      policy: parsed.data.policy,
      sweep: sweep.map(({ params, result }) => ({
        params,
        deltaXirr: result.deltaXirr,
        deltaGbp: result.deltaGbp,
        nAffected: result.nAffected,
        capitalAffectedGbp: result.capitalAffectedGbp,
        splitHalf: result.splitHalf,
        clamps: result.clamps,
        actual: result.actual,
        counterfactual: result.counterfactual,
        perPosition: result.perPosition,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Replay failed";
    const status = message.includes("too large") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
