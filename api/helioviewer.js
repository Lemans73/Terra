// api/helioviewer.js — CORS proxy for the Helioviewer API.
//
// The rules live in _helioviewer-policy.mjs, which serve.mjs imports too, so
// local development exercises the same allowlist as production. This file is
// only plumbing: validate, forward, stream back.
//
// EDGE RUNTIME, AND WHY THIS ONE DIFFERS FROM api/waqi.js
// A Node serverless function buffers its whole response, and Vercel's Hobby
// plan caps that at 4.5 MB. A 2048 px solar image measures 4.08 MB — under the
// cap, but not by enough to build on. The edge runtime returns a stream, so the
// image flows through without ever being held whole, and the size stops
// mattering. The cost is a different signature (Request in, Response out)
// than the (req, res) pair waqi.js uses.
//
// There is no API key here, and nothing secret passes through: the same data is
// public at api.helioviewer.org. What the allowlist protects is bandwidth.

import { planRequest } from './_helioviewer-policy.mjs';

export const config = { runtime: 'edge' };

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

export default async function handler(request) {
  const url = new URL(request.url);
  const params = url.searchParams;

  const plan = planRequest(
    params.get('endpoint'),
    key => params.get(key),
    params.keys()
  );
  if (!plan.ok) return json(plan.status, { status: 'error', data: plan.error });

  let upstream;
  try {
    upstream = await fetch(plan.url);
  } catch {
    // Deliberately opaque. An error response must not become a source of
    // information: no stack, no paths, no upstream URL.
    return json(502, { status: 'error', data: 'upstream unreachable' });
  }

  if (!upstream.ok) {
    return json(502, { status: 'error', data: 'upstream error ' + upstream.status });
  }

  // Cache only what came back whole and correct. Helioviewer sends no cache
  // headers of its own, so this is the only thing standing between a busy day
  // and re-rendering the same image for every visitor.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
      'Cache-Control': plan.cacheControl
    }
  });
}
