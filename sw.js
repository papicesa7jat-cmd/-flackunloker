const CACHE_NAME = "flackunloker-offline-web-cup-replicas-20260926";
const PAGE_FALLBACK = "./index.html";

const APP_SHELL = [
  "./",
  "./index.html",
  "./scripts/flk-localstorage-guard.js",
  "./scripts/flk-error-reporter.js",
  "./manifest.webmanifest",
  "./fotos-producto.js",
  "./fotos-producto.css",
  "./recorte-web.js",
  "./recorte-web/worker.js",
  "./recorte-web/assets/ort.wasm.min.js",
  "./recorte-web/assets/ort-wasm-simd-threaded.mjs",
  "./recorte-web/assets/ort-wasm-simd-threaded.wasm",
  "./recorte-web/assets/u2netp.onnx"
];

const EXTERNAL_SHELL = [
  // v62.33: caché renovada para reconexión inmediata; dependencias ejecutables siguen precacheadas.
  // Sustituye el antiguo patrón CDN -> localStorage -> eval().
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0",
  "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js",
  "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js",
  "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"
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

  // v62.41.59 · En el escritorio (Electron), index.html se carga con
  // ventana.loadFile(), es decir por file://. fetch() sobre file:// no es
  // confiable en Chromium (suele rechazar la promesa) y esta franja de
  // "red primero, caché de respaldo si no hay internet" se diseñó para una
  // PWA servida por https, no para un archivo local. Al interceptar la
  // navegación sobre file://, ese fetch() fallaba, la caché de respaldo
  // solía estar vacía por el mismo motivo, y el resultado era
  // Response.error() -> pantalla en blanco al recargar (por ejemplo, justo
  // después de cerrar sesión). No existe un "sin internet" para un archivo
  // local: se deja pasar sin intervenir.
  if (url.protocol === "file:") return;

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

  // Dependencias externas versionadas: caché primero para funcionamiento offline.
  if (EXTERNAL_SHELL.includes(url.href)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request, { cache: "reload" });
        if (response && response.ok) await cache.put(request, response.clone());
        return response;
      } catch (err) {
        return (await cache.match(url.href)) || Response.error();
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
