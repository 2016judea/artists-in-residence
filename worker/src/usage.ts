/**
 * Per-day, per-tool call counts in D1, and the hard daily cap that refuses past it.
 *
 * WHY A CAP ON A SERVER THAT CALLS NO PAID API. Nothing here bills per call: no model,
 * no paid storage. But the account's free allowances are finite (Workers Free: 100,000
 * requests a day; D1 free: 100,000 rows written a day), and the goal is a $0 bill under any
 * traffic. So the server stops itself well inside them: one upsert per tool call, refused
 * once today's total reaches DAILY_CALL_CAP. tools/list and initialize are not counted.
 *
 * ONE STATEMENT, SO IT IS ATOMIC. The INSERT ... SELECT ... WHERE (total < cap) only writes
 * when there is room, and `meta.changes` says whether it did. Two concurrent calls cannot
 * both slip past the cap, which a read-then-write in KV could.
 *
 * The counts double as the usage log Aidan reads (README: "Expected use").
 */
export interface UsageEnv {
  DB: D1Database;
  DAILY_CALL_CAP?: string;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10); // UTC day: resets 00:00 UTC
}

export async function admit(env: UsageEnv, tool: string): Promise<{ ok: boolean; used: number; cap: number }> {
  const cap = Number(env.DAILY_CALL_CAP ?? 20000);
  const day = today();
  try {
    const res = await env.DB.prepare(
      `INSERT INTO calls (day, tool, n)
         SELECT ?1, ?2, 1 WHERE (SELECT COALESCE(SUM(n), 0) FROM calls WHERE day = ?1) < ?3
       ON CONFLICT(day, tool) DO UPDATE SET n = n + 1`,
    )
      .bind(day, tool, cap)
      .run();
    const ok = (res.meta?.changes ?? 0) > 0;
    return { ok, used: ok ? -1 : cap, cap };
  } catch (e) {
    // If the counter itself is unavailable (D1 down, or its own free limit hit), fail closed:
    // the cap exists to protect the bill, so an unknown count is treated as a full one.
    console.log(JSON.stringify({ ev: "usage_error", tool, error: String(e) }));
    return { ok: false, used: cap, cap };
  }
}
