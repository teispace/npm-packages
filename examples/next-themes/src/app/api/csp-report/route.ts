/**
 * Collects CSP violation reports sent by the browser (`report-uri` in
 * src/proxy.ts) so the e2e suite can assert there were none. Kept in memory:
 * this is a demo and test fixture, not a production report sink.
 */

type Store = { reports: unknown[] };
const store: Store = ((globalThis as { __cspReports?: Store }).__cspReports ??= { reports: [] });

export async function POST(request: Request) {
  try {
    store.reports.push(await request.json());
  } catch {
    store.reports.push({ unparsable: true });
  }
  return new Response(null, { status: 204 });
}

export function GET() {
  return Response.json(store.reports);
}

export function DELETE() {
  store.reports.length = 0;
  return new Response(null, { status: 204 });
}

export const dynamic = 'force-dynamic';
