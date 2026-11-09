// تنزيل مقاطع الرحلات عند الحاجة (09.11): حجم التطبيق ثابت، وكل رحلة تُنزَّل مرة واحدة من Firebase Hosting
// وتُحفظ في IndexedDB، ثم تعمل بلا إنترنت. ملف JSON لكل رحلة يبقى داخل التطبيق (صغير)، والمقاطع وحدها على الخادم.
// على خادم التطوير (localhost:4174) تُقرأ المقاطع من المجلد المحلي كما كانت؛ ?remote=1 يجرّب طريق الخادم.
export const JD = '/prototypes/assets/journeys/';
const QS = new URLSearchParams(location.search);
// rbase: لتجربة طريق الخادم على خادم التطوير (مثلاً ?remote=1&rbase=/hosting/journeys/)
export const REMOTE = QS.get('rbase') || 'https://horofi.web.app/journeys/';
// داخل التطبيق: https://localhost (أندرويد) أو capacitor://localhost (iOS)، بلا منفذ
export const useRemote = () => QS.has('remote') || (location.hostname === 'localhost' && location.port === '');

// أسماء ASCII على الخادم: ب ⇐ L628
const remoteDir = ch => 'L' + ch.codePointAt(0).toString(16);
const remoteUrl = path => { const i = path.indexOf('/'); return REMOTE + remoteDir(path.slice(0, i)) + path.slice(i); };

export const mediaList = J => [...new Set([J.film, ...J.stops.flatMap(s => [s.sad, s.happy])])];
const key = (J, p) => (J.v || 1) + ':' + p;

let dbp = null;
function db(){
  return dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('horofi-journeys', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('media');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
}
const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => {
  const t = d.transaction('media', mode), q = fn(t.objectStore('media'));
  t.oncomplete = () => res(q && q.result); t.onerror = t.onabort = () => rej(t.error); }); };
const getBlob = k => tx('readonly', s => s.get(k));
const putBlob = (k, b) => tx('readwrite', s => s.put(b, k));

async function download(url, onBytes){
  let last;
  for (let a = 0; a < 3; a++){
    try {
      const r = await fetch(url, {cache: 'no-store'});
      if (!r.ok) throw new Error('HTTP ' + r.status);
      if (!r.body){ const b = await r.blob(); onBytes(b.size); return b; }
      const rd = r.body.getReader(), parts = [];
      for (;;){ const {done, value} = await rd.read(); if (done) break; parts.push(value); onBytes(value.length); }
      return new Blob(parts, {type: 'video/mp4'});
    } catch (e){ last = e; await new Promise(r => setTimeout(r, 1500 * (a + 1))); }
  }
  throw last;
}

// يضمن وجود كل مقاطع الرحلة في الجهاز ويعيد دالة path ⇒ رابط قابل للتشغيل.
// onProgress(0..1). يرمي خطأً إن تعذّر التنزيل (لا إنترنت) وبعض المقاطع غير محفوظ.
export async function ensure(J, onProgress = () => {}){
  if (!useRemote()) { onProgress(1); return p => JD + p; }
  const list = mediaList(J), urls = {};
  const run = async () => {
    const missing = [];
    for (const p of list){ const b = await getBlob(key(J, p)).catch(() => null); if (b && b.size) urls[p] = URL.createObjectURL(b); else missing.push(p); }
    if (!missing.length){ onProgress(1); return; }
    try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e){}
    // التقدّم بعدد المقاطع مع أجزاء المقطع الحالي (حجم المقطع غير معروف مسبقاً بدقة)
    const total = list.length; let doneN = list.length - missing.length;
    for (const p of missing){
      let got = 0;
      const b = await download(remoteUrl(p), n => { got += n; onProgress(Math.min(.99, (doneN + Math.min(.95, got / 4e6)) / total)); });
      await putBlob(key(J, p), b);
      urls[p] = URL.createObjectURL(b); doneN++; onProgress(doneN / total);
    }
  };
  // التطبيق قد يبدأ التنزيل مسبقاً والرحلة تفتح أثناءه: قفل واحد لكل رحلة كي لا يُنزَّل الملف مرتين
  if (navigator.locks) await navigator.locks.request('horofi-journey:' + J.letter, run); else await run();
  return p => urls[p] || JD + p;
}

// تنزيل مسبق صامت (يستدعيه التطبيق عند بدء درس فيه رحلة) — لا يرمي أبداً
export async function prefetch(ch){
  try {
    if (!useRemote()) return;
    const J = await (await fetch(JD + encodeURIComponent(ch) + '.json')).json();
    J.letter = J.letter || ch;
    const u = await ensure(J); for (const p of mediaList(J)){ const s = u(p); if (s.startsWith('blob:')) URL.revokeObjectURL(s); }
  } catch (e){}
}
