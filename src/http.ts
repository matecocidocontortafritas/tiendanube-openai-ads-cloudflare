export function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

export function redirect(location: string, headers: HeadersInit = {}): Response {
  return new Response(null, {
    status: 302,
    headers: {
      ...headers,
      "cache-control": "no-store",
      location,
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

export function methodNotAllowed(allow: string): Response {
  return new Response(JSON.stringify({ error: "method_not_allowed" }), {
    status: 405,
    headers: {
      allow,
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}

