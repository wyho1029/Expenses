// 離線用嘅 app shell 快取。刻意用 network-first：有網一定攞最新（唔會卡住舊版），
// 冇網先至用快取。API（Apps Script POST）同匯率（跨網域）一律唔掂，直接放行。
const CACHE = 'expenses-v1';
const CORE = ['./', './settlement.js', './icon.svg', './manifest.webmanifest'];
const ROOT = new URL('./', self.location).pathname;   // '/Expenses/'

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys()
    .then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim()));
});
self.addEventListener('fetch', e=>{
  const req = e.request;
  if (req.method !== 'GET') return;                                  // 寫入 API：唔掂
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                   // Apps Script / 匯率：唔掂

  if (req.mode === 'navigate'){
    // 深連結 /Expenses/<slug> 離線時亦要開到 → 一律回 index.html，個 app 自己讀網址認 trip
    e.respondWith(
      fetch(req).then(res=>{
        // 淨係 base 網址（真 index.html，status 200）先更新快取；深連結攞返嘅 404.html 唔會入
        if (res.ok && url.pathname === ROOT){
          const copy = res.clone();
          caches.open(CACHE).then(c=>c.put('./', copy));
        }
        return res;
      }).catch(()=>caches.match('./'))
    );
    return;
  }
  e.respondWith(
    fetch(req).then(res=>{
      const copy = res.clone();
      caches.open(CACHE).then(c=>c.put(req, copy));
      return res;
    }).catch(()=>caches.match(req))
  );
});
