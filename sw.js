/**
 * วาว Print Center — Service Worker (v3)
 * - เปิดแอปได้ทันทีจาก cache แม้เน็ตช้า/หลุด (ข้อมูลยังซิงค์ผ่าน API ตามปกติ)
 * - cache ฟอนต์ Google และ xlsx จาก CDN ด้วย ไม่ต้องโหลดใหม่ทุกครั้ง
 * - ไม่ยุ่งกับคำขอไป Google Apps Script (ให้เบราว์เซอร์จัดการเอง แอปมี timeout/retry ของตัวเอง)
 *
 * ทุกครั้งที่แก้ไฟล์ของแอป ให้เปลี่ยนเลขเวอร์ชันด้านล่าง (v3 → v4 → ...)
 */
const CACHE_NAME = 'waow-print-center-v3';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './print.css',
  './app.js',
  './config.js',
  './manifest.json',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-144.png',
  './icons/icon-152.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-384.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/favicon-16.png',
  './icons/favicon-32.png',
  './icons/logo-slip.png'
];

// โดเมนภายนอกที่อนุญาตให้ cache (ฟอนต์ + ไลบรารี Excel)
const CACHEABLE_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // เดิมใช้ addAll ซึ่งล้มทั้งชุดถ้ามีไฟล์เดียวหาย (404) → SW ติดตั้งไม่สำเร็จ
      // เปลี่ยนเป็นใส่ทีละไฟล์ ไฟล์ไหนหายก็ข้ามไป ไม่ทำให้ทั้งระบบพัง
      .then((cache) => Promise.allSettled(ASSETS_TO_CACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });

  const network = fetch(request).then((response) => {
    // เก็บเฉพาะที่โหลดสำเร็จ (opaque = ฟอนต์/สไตล์ข้ามโดเมนแบบ no-cors ก็เก็บได้)
    if (response && (response.ok || response.type === 'opaque')) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  });

  if (cached) {
    // ตอบจาก cache ทันที แล้วอัปเดตเงียบ ๆ เบื้องหลังเพื่อใช้ครั้งหน้า
    event.waitUntil(network.catch(() => {}));
    return cached;
  }

  try {
    return await network;
  } catch (err) {
    if (request.mode === 'navigate') {
      const fallback = await cache.match('./index.html');
      if (fallback) return fallback;
    }
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return; // POST ไป API ไม่ผ่าน SW

  const url = new URL(request.url);

  // API ของ Google Apps Script: ไม่แตะ ปล่อยให้เบราว์เซอร์ส่งตรง (สดใหม่เสมอ และ error จริงถึงแอป → retry ได้)
  if (url.hostname === 'script.google.com' || url.hostname.endsWith('.googleusercontent.com')) return;

  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && CACHEABLE_HOSTS.indexOf(url.hostname) === -1) return;

  event.respondWith(staleWhileRevalidate(event, request));
});
