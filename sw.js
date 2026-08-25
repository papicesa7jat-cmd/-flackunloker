const CACHE_NAME = "flackunloker-offline-v8";
const PAGE_FALLBACK = "./index.html";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest"
];

const EXTERNAL_SHELL = [
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"
];

async function precacheLocal() {
  const cache = await caches.open(CACHE_NAME);
  for (const url of APP_SHELL) {
    try {
      const response = await fetch(url, {cache:"reload"});
      if (response && response.ok) await cache.put(url, response.clone());
    } catch (err) {
      console.warn("No se pudo precachear", url, err);
    }
  }
}

async function precacheExternal() {
  const cache = await caches.open(CACHE_NAME);
  for (const url of EXTERNAL_SHELL) {
    try {
      const response = await fetch(url, {mode:"no-cors", cache:"reload"});
      if (response) await cache.put(url, response.clone());
    } catch (err) {
      console.warn("No se pudo precachear recurso externo", url, err);
    }
  }
}

self.addEventListener("install", event => {
  event.waitUntil(Promise.all([precacheLocal(), precacheExternal()]));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil((async()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Supabase API/Auth/REST: nunca cachear datos de negocio.
  if (
    url.hostname.includes("supabase.co") ||
    url.pathname.includes("/rest/v1/") ||
    url.pathname.includes("/auth/v1/") ||
    url.pathname.includes("/rpc/")
  ) {
    return;
  }

  // Navegación: red primero para recibir actualizaciones; offline usa index cacheado.
  if (request.mode === "navigate") {
    event.respondWith((async()=>{
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          await cache.put("./index.html", response.clone());
          await cache.put("./", response.clone());
        }
        return response;
      } catch (err) {
        return (
          await cache.match("./index.html") ||
          await cache.match("./") ||
          Response.error()
        );
      }
    })());
    return;
  }

  // Supabase JS CDN: cache-first. Acepta respuesta opaque (cross-origin).
  if (url.hostname === "cdn.jsdelivr.net" && url.pathname.includes("@supabase/supabase-js")) {
    event.respondWith((async()=>{
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response) await cache.put(request, response.clone());
        return response;
      } catch (err) {
        return (await cache.match("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2")) || Response.error();
      }
    })());
    return;
  }

  // Recursos locales: caché primero, con actualización no bloqueante cuando hay red.
  event.respondWith((async()=>{
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);

    if (cached) {
      if (self.navigator?.onLine !== false) {
        event.waitUntil(
          fetch(request).then(response => {
            if (response && (response.ok || response.type === "opaque")) {
              return cache.put(request, response.clone());
            }
          }).catch(()=>{})
        );
      }
      return cached;
    }

    try {
      const response = await fetch(request);
      if (response && (response.ok || response.type === "opaque")) {
        await cache.put(request, response.clone());
      }
      return response;
    } catch (err) {
      return Response.error();
    }
  })());
});
