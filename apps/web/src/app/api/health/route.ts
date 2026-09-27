// Liveness for the web process (Phase 18, plan.md AC21): the container
// healthcheck and the reverse proxy call it. It calls no upstream, so a
// commerce-api or ai-service outage never gets a healthy web server
// restarted — their own readiness probes cover them. Rendered per request,
// so a 200 means this server answered, not a cached file.
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
