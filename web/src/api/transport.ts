/**
 * The one door every API request leaves through.
 *
 * `client.ts` used to call `fetch('/api/...')` at ten sites, so the only way to
 * answer a request without a server was to stub the global. A transport makes
 * that door explicit: the live one issues exactly the request the ten sites
 * issued (same string, same `{ signal }` init), and the static one
 * (src/api/staticCatalog.ts) answers from a precomputed catalogue with a real
 * WHATWG `Response`, so every decoder downstream -- QVPC, the slice contract,
 * FastAPI error unwrapping -- runs unchanged in both modes.
 */
export interface Transport {
  request(route: string, query: URLSearchParams | null, signal?: AbortSignal): Promise<Response>
}

/**
 * The literal request string: `route`, or `route?query` in insertion order.
 *
 * It is also the static catalogue's lookup key, so it is spelled here once. An
 * empty query adds no `?`: the catalogue routes carry none, and `route?` would
 * be a second key for the same request.
 */
export function requestKey(route: string, query: URLSearchParams | null): string {
  const search = query === null ? '' : query.toString()
  return search === '' ? route : `${route}?${search}`
}

/**
 * `fetch` is looked up on every call rather than captured at import: specs
 * replace the global with `vi.stubGlobal` after this module has loaded, and a
 * captured reference would reach the network instead.
 */
export const liveTransport: Transport = {
  request(route, query, signal) {
    return fetch(requestKey(route, query), { signal })
  },
}

let current: Transport = liveTransport

export function getTransport(): Transport {
  return current
}

/** Install another transport: the static bootstrap in src/main.tsx, and specs. */
export function setTransport(transport: Transport): void {
  current = transport
}

export function resetTransport(): void {
  current = liveTransport
}
