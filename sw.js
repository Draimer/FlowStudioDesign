/* Flow Studio — Service Worker
 * 改了網站內容後，把下面的 VERSION 數字 +1，使用者下次開啟就會自動更新。
 */
const VERSION = 'v2';
const CACHE = `flowstudio-${VERSION}`;

/* 安裝時先抓下來的核心檔案。缺檔不會導致安裝失敗。 */
const PRECACHE = [
  './',
  './index.html',
  './ceramics.html',
  './pc-builds.html',
  './manifest.json',
  './images/favicon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // 逐個加入：某個檔案 404 也不會讓整個 SW 安裝失敗
      Promise.all(
        PRECACHE.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => null)
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

/* 只有完整的 200、basic 回應才值得存。
   音訊的 Range 請求會回 206，存進去會壞掉播放。 */
function isCacheable(res) {
  return res && res.status === 200 && res.type === 'basic';
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 跨網域（Google Analytics、Cloudflare、Instagram…）一律放行，不介入
  if (url.origin !== self.location.origin) return;

  // 音訊串流的分段請求交給瀏覽器自己處理
  if (req.headers.has('range')) return;

  // 頁面導覽：先連網拿最新的，斷線才用快取
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (isCacheable(res)) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches
            .match(req)
            .then((hit) => hit || caches.match('./index.html'))
        )
    );
    return;
  }

  // 圖片、CSS、JS 等靜態資源：先給快取，同時背景更新
  event.respondWith(
    caches.match(req).then((hit) => {
      const fresh = fetch(req)
        .then((res) => {
          if (isCacheable(res)) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || fresh;
    })
  );
});
