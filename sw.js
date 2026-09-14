const CACHE_NAME = "flackunloker-offline-v14-audit-estabilidad-6223";
const PAGE_FALLBACK = "./index.html";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest"
];

const EXTERNAL_SHELL = [
  // v62.22 ESTABILIDAD: fijar la MISMA versión exacta que usa index.html
  // (ver flk-supabase-loader-v6186-login-fix). Si se sube la versión en
  // index.html, hay que actualizar también esta constante.
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0"
];

async function precacheLocal() {
  const cache = await caches.open(CACHE_NAME);

  for (const url of APP_SHELL) {
    try {
      // Siempre intentar obtener una copia realmente fresca durante instalación.
      const response = await fetch(url, {
        cache: "no-store",
        credentials: "same-origin"
      });

      if (response && response.ok) {
        await cache.put(url, response.clone());
      }
    } catch (err) {
      console.warn("No se pudo precachear", url, err);
    }
  }
}

async function precacheExternal() {
  const cache = await caches.open(CACHE_NAME);

  for (const url of EXTERNAL_SHELL) {
    try {
      // jsDelivr sí soporta CORS: usamos el modo normal (no "no-cors") para
      // poder ver el status real y no cachear un 404/500 como si fuera la
      // librería válida.
      const response = await fetch(url, {
        cache: "reload"
      });

      if (response && response.ok) {
        await cache.put(url, response.clone());
      } else if (response) {
        console.warn("Precache externo descartado por status no-ok:", url, response.status);
      }
    } catch (err) {
      console.warn("No se pudo precachear recurso externo", url, err);
    }
  }
}

self.addEventListener("install", event => {
  event.waitUntil(
    Promise.all([
      precacheLocal(),
      precacheExternal()
    ])
  );

  // Activa esta versión sin esperar que se cierren todas las pestañas antiguas.
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    // Elimina cualquier caché anterior de Flackunloker.
    await Promise.all(
      keys
        .filter(key => key.startsWith("flackunloker-offline-") && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    );

    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Supabase API/Auth/REST/RPC: jamás cachear datos de negocio ni autenticación.
  if (
    url.hostname.includes("supabase.co") ||
    url.pathname.includes("/rest/v1/") ||
    url.pathname.includes("/auth/v1/") ||
    url.pathname.includes("/rpc/")
  ) {
    return;
  }

  // DOCUMENTOS / NAVEGACIÓN:
  // RED REAL PRIMERO, ignorando caché HTTP del navegador.
  // Solo si no hay internet usamos el index.html guardado.
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);

      try {
        const response = await fetch(request, {
          cache: "no-store",
          credentials: "same-origin",
          redirect: "follow"
        });

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

  // Supabase JS CDN: caché primero porque es una dependencia necesaria offline.
  if (
    url.hostname === "cdn.jsdelivr.net" &&
    url.pathname.includes("@supabase/supabase-js")
  ) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);

      if (cached) return cached;

      try {
        const response = await fetch(request, {
          cache: "reload"
        });

        // v62.22 ESTABILIDAD: solo cachear si la respuesta fue realmente
        // exitosa. Antes, un 404/500 transitorio de la CDN se guardaba
        // como si fuera la librería válida y dejaba la app rota (sin
        // Supabase) hasta que alguien borrara el caché a mano.
        if (response && response.ok) {
          await cache.put(request, response.clone());
        } else if (response) {
          console.warn("supabase-js: respuesta no-ok, no se cachea:", url.href, response.status);
        }

        return response;
      } catch (err) {
        return (
          await cache.match(
            "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0"
          ) ||
          Response.error()
        );
      }
    })());

    return;
  }

  // Recursos locales distintos de navegación:
  // caché disponible inmediatamente y actualización en segundo plano.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);

    if (cached) {
      event.waitUntil(
        fetch(request, {
          cache: "no-store",
          credentials: "same-origin"
        })
          .then(response => {
            if (
              response &&
              (response.ok || response.type === "opaque")
            ) {
              return cache.put(request, response.clone());
            }
          })
          .catch(() => {})
      );

      return cached;
    }

    try {
      const response = await fetch(request, {
        cache: "no-store",
        credentials: "same-origin"
      });

      if (
        response &&
        (response.ok || response.type === "opaque")
      ) {
        await cache.put(request, response.clone());
      }

      return response;
    } catch (err) {
      return Response.error();
    }
  })());
});
