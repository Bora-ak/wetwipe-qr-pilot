interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

const MEMES = [
  "/memes/canvas-weekend.png",
  "/memes/thirty-minute-assignment.png",
  "/memes/office-hours.png",
  "/memes/expensive-lunch.png",
  "/memes/academic-comeback.png",
] as const;

const VISITOR_COOKIE = "wetwipe_id";
const ONE_YEAR_SECONDS = 31_536_000;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      if (request.method !== "GET") return methodNotAllowed("GET");
      return new Response(
        "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><title>Wet Wipe QR Pilot</title><body>Wet Wipe QR Pilot</body></html>",
        { headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    if (url.pathname === "/s") {
      if (request.method !== "GET") return methodNotAllowed("GET");
      return serveScanPage(request, env);
    }

    if (url.pathname === "/api/scan") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      return handleScan(request, env);
    }

    if (url.pathname === "/stats") {
      if (request.method !== "GET") return methodNotAllowed("GET");
      return handleStats(env);
    }

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

async function serveScanPage(request: Request, env: Env): Promise<Response> {
  const assetUrl = new URL("/scan.html", request.url);
  const assetResponse = await env.ASSETS.fetch(new Request(assetUrl, request));
  const headers = new Headers(assetResponse.headers);
  headers.set("Cache-Control", "no-store");

  return new Response(assetResponse.body, {
    status: assetResponse.status,
    statusText: assetResponse.statusText,
    headers,
  });
}

async function handleScan(request: Request, env: Env): Promise<Response> {
  const cookies = parseCookies(request.headers.get("Cookie"));
  let visitorId = cookies.get(VISITOR_COOKIE);
  let shouldSetCookie = false;

  if (!visitorId || !isUuid(visitorId)) {
    visitorId = crypto.randomUUID();
    shouldSetCookie = true;
  }

  const meme = selectRandomMeme();

  try {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO visitors (visitor_id) VALUES (?)",
      ).bind(visitorId),
      env.DB.prepare(
        "INSERT INTO scan_events (visitor_id, meme) VALUES (?, ?)",
      ).bind(visitorId, meme),
    ]);
  } catch {
    return jsonResponse(
      { ok: false, error: "Unable to record scan. Please try again." },
      500,
    );
  }

  const headers = new Headers();
  if (shouldSetCookie) {
    headers.set("Set-Cookie", makeVisitorCookie(visitorId));
  }

  return jsonResponse({ ok: true, memeUrl: meme }, 200, headers);
}

async function handleStats(env: Env): Promise<Response> {
  try {
    const [scanResult, visitorResult] = await env.DB.batch<{ count: number }>([
      env.DB.prepare("SELECT COUNT(*) AS count FROM scan_events"),
      env.DB.prepare("SELECT COUNT(*) AS count FROM visitors"),
    ]);

    const totalScans = readCount(scanResult.results[0]?.count);
    const uniqueScans = readCount(visitorResult.results[0]?.count);

    return jsonResponse({
      totalScans,
      uniqueScans,
      repeatScans: totalScans - uniqueScans,
      uniqueRate: totalScans === 0 ? 0 : uniqueScans / totalScans,
    });
  } catch {
    return jsonResponse(
      { ok: false, error: "Unable to load scan statistics." },
      500,
    );
  }
}

function parseCookies(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!header) return cookies;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;

    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name) cookies.set(name, value);
  }

  return cookies;
}

function makeVisitorCookie(visitorId: string): string {
  return `${VISITOR_COOKIE}=${visitorId}; Max-Age=${ONE_YEAR_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function selectRandomMeme(): (typeof MEMES)[number] {
  return MEMES[Math.floor(Math.random() * MEMES.length)];
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function readCount(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders?: Headers,
): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");

  return new Response(JSON.stringify(body), { status, headers });
}

function methodNotAllowed(allowedMethod: string): Response {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: allowedMethod, "Cache-Control": "no-store" },
  });
}
