/*
 * 云轨社区 Service Worker —— 只做浏览器推送，不做离线缓存。
 *
 * 推送正文由后端按 aes128gcm 加密，这里拿到的是明文 JSON：
 *   { title, body, url, tag }
 * 点击通知时优先复用已开的站点窗口，没有才新开。
 */

const FALLBACK_ICON = '/logo-192.png';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.resolve());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: '云轨社区', body: event.data ? event.data.text() : '' };
  }

  const title = typeof data.title === 'string' && data.title ? data.title : '云轨社区';
  const options = {
    body: typeof data.body === 'string' ? data.body : '',
    icon: FALLBACK_ICON,
    badge: FALLBACK_ICON,
    // 同类通知合并：后台重复推送同一条时只保留最新
    tag: typeof data.tag === 'string' && data.tag ? data.tag : undefined,
    renotify: Boolean(data.tag),
    data: { url: typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if (client.url.startsWith(self.location.origin)) {
          await client.focus();
          if ('navigate' in client) {
            try {
              await client.navigate(target);
            } catch (e) {
              /* 跨域或无权限时忽略，聚焦已经足够 */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

/* 占位 fetch：保持可安装的 PWA 形态，不改动任何请求 */
self.addEventListener('fetch', () => {});
