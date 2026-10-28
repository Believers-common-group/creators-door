const CACHE='creators-door-v2';
const ASSETS=['./','./index.html','./manifest.webmanifest','./src/main.js','./src/data.js','./src/influencers.js','./src/styles.css'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener('fetch',event=>{ const url=new URL(event.request.url); if(url.origin!==self.location.origin || url.pathname.startsWith('/api/') || event.request.method!=='GET') return; event.respondWith(fetch(event.request).catch(()=>caches.match(event.request))); });
