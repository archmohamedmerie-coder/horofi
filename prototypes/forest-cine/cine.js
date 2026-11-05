/* ── انتقالات الرحلة السينمائية: مشتركة بين المحطات الخمس عشرة ──
   أثناء الرحلة تظهر كلمات تُقرأ أمام الطفل وهو يركض (بلا توقّف)، وحيث يقفز مقطع الرحلة فجأة إلى المكان الجديد
   يُدخَل مقطع وصل يركض فيه الطفل في طريق حقيقي. الصفحة السابقة تنتهي على آخر لقطة في مقطع الرحلة.
   الصفحة التالية تبدأ بتلك اللقطة نفسها (مثبّتة في موضعها تماماً)، ثم تنزلق وتذوب ببطء في صورة المحطة النظيفة.
   سبب القفزة القديمة: الصورة النظيفة أُعيد رسمها فلا تطابق اللقطة الأخيرة تماماً (قياس ومقاس وألوان)،
   والذوبان كان 0.6ث، والصورة النظيفة كانت تظهر أحياناً قبل اللقطة لأنها أخفّ تحميلاً. */
import { LETTER_BA } from '/prototypes/forest-env/data.js';

export const VD = '/prototypes/assets/magiclight/';
const IW = 768, IH = 1364;
export const ORDER = ['fig', 'river2', 'bridge', 'glade', 'meadow', 'oasis', 'beach', 'savanna', 'snow', 'damascus', 'rain', 'autumn', 'olive', 'aqsa', 'kaaba'];

/* بداية كل محطة: آخر لقطة في الرحلة إليها، ومحاذاتها على الصورة النظيفة [قياس، إزاحة س، إزاحة ص] بإحداثيات الصورة
   (قيست آلياً بأقلّ فرق بين الصورتين، أغلبه على منطقة الطفل لأنه ما تتبعه العين)؛ intro: مقطع وصول معكوس يُعرض قبل المحطة
   (مولَّد من صورة المحطة الصحيحة والكاميرا تبتعد، ثم عُكس بـffmpeg فتقترب وينتهي بالضبط على الصورة)، ومركز التأطير في الصفحة السابقة (fig وriver2 مؤطّرتان حول مركز مختلف) */
const SEAMS = {
  river2:   {cover: 'travel_fig_river3_last.png',     align: [0.99, -2, -8], fromCX: 450},
  bridge:   {cover: 'travel_river_bridge_last.png',   align: [1.002, 0, -50],     fromCX: 425},
  glade:    {cover: 'travel_bridge_glade_last.png',   align: [1.002, -10, -56]},
  meadow:   {cover: 'link_glade_meadow_last.png',     align: [0.91, -4, 60]},     // آخر لقطة في مقطع الوصل
  oasis:    {cover: 'link_meadow_oasis_b_last.png',  align: [0.96, -32, 56]},
  beach:    {cover: 'link_oasis_beach2_last.png',     align: [1.16, -12, -120]},
  savanna:  {cover: 'approach_savanna3_last.png',    align: [0.93, 20, -156]},   // يركض نحو الزرافة والفيل
  snow:     {cover: 'link_savanna_snow_last.png',     align: [1.1, 4, -28]},
  damascus: {cover: 'approach_damascus_last.png',  align: [1.02, 12, 40]},     // دخل من الباب إلى صحن الدار
  rain:     {cover: 'travel_damascus_rain_last.png',  align: [0.984, -6, -12]},
  autumn:   {cover: 'link_rain_autumn_b_last.png',   align: [1.18, 44, -196]},
  olive:    {cover: 'link_autumn_olive_last.png',     align: [1.04, 8, -100]},
  aqsa:     {cover: 'approach_aqsa_last.png',      align: [0.95, 28, 4]},      // ركض في طريق السرو حتى الساحة
  kaaba:    {white: true, run: 'run_kaaba.mp4', cover: 'run_kaaba_last.png', align: [0.96, -4, 44]},   // من النور يركض على ممرّ رخامي نحو الكعبة على مستوى كتفه (كالطريق الصحراوي)   // الثياب تتبدّل إلى الإحرام عبر نور أبيض، ثم تهبط الكاميرا على الطفل
};
/* مقاطع الوصل: حيث يقفز مقطع الرحلة فجأة (أو يذوب) إلى المكان الجديد، يُقطع عند cut، وتكمل بعده مقاطع clips بالترتيب:
   - مقطع وصل مولَّد من لقطة القطع نفسها (فلا قطع) يركض فيه الطفل وتتبدّل الطبيعة تدريجياً؛ وحيث يكون التبدّل كبيراً
     قُسم على مقطعين (الثاني مولَّد من آخر لقطة في الأول، فلا قطع بينهما) كي لا يذيب المولّد المكانين في ثانية.
   - مقطع اقتراب: من «صورة أفق» رُسمت من آخر لقطة الوصل نفسها والمكان القادم صغيراً في آخر الطريق، يركض نحوه
     حتى يقف أمامه؛ join: محاذاة آخر لقطة الوصل على أول لقطة فيه [قياس، س، ص] فيذوب الأول في الثاني منزلقاً.
   آخر لقطة في آخر مقطع هي بداية المحطة التالية (SEAMS). المفتاح: صفحة المغادرة. سطر لكل محطة: تعليق في وسط
   السطر يبتلع ما بعده (أوقف سابقاً وصلَي الشاطئ والخريف دون أن يُلاحَظ) */
const CHAINS = {
  glade:   {cut: 1.3, clips: ['link_glade_meadow.mp4']},
  meadow:  {cut: 2.6, clips: ['link_meadow_oasis_a.mp4', 'link_meadow_oasis_b.mp4']},
  oasis:   {cut: .4,  clips: ['link_oasis_beach2.mp4']},                       // قبل بركة الواحة: الوصل يدور حولها
  beach:   {cut: 1.4, clips: ['link_beach_savanna.mp4', {src: 'approach_savanna3.mp4', join: [1.34, 16, -164]}]},
  savanna: {cut: 1.5, clips: ['link_savanna_snow.mp4']},
  snow:    {cut: .9,  clips: ['link_snow_damascus.mp4', {src: 'approach_damascus.mp4', join: [0.97, -4, -8]}]},
  rain:    {cut: 1.4, clips: ['link_rain_autumn_a.mp4', 'link_rain_autumn_b.mp4']},  // على حافة البركة لا فوق الماء
  autumn:  {cut: 1.2, clips: ['link_autumn_olive.mp4']},
  olive:   {cut: .5,  clips: ['link_olive_aqsa.mp4', {src: 'approach_aqsa.mp4', join: [1.01, -4, -80]}]},  // قبل أن تُرسم القبة
};
const PAGE = location.pathname.split('/').pop().replace('.html', '');
/* مقطع لاحق لصفحة بلا مقطع رحلة: يبدأ من آخر لقطة في مقطع الفرح (فلا قطع) ويُعرض بعده.
   القدس: يركض يميناً بمحاذاة السرو، يخرج إلى طريق صحراوي، ويدخل نوراً أبيض يملأ الشاشة، ومنه تبدأ مكة */
const TAILS = {aqsa: 'travel_aqsa_kaaba.mp4'};
let tailVid = null;                                  // يُحمَّل مع الصفحة كي لا يتأخّر بعد الفرح
if (TAILS[PAGE]){ tailVid = document.createElement('video'); Object.assign(tailVid, {src: VD + TAILS[PAGE], muted: true, playsInline: true, preload: 'auto'}); tailVid.load(); }
let run = null;                                      // الرحلة الجارية: {t: مقطع الرحلة, words: وعد الكلمات}
const tf = (k, x, y) => `translate(${x}px,${y}px) scale(${k})`;
function setupJourney(){
  const stage = document.getElementById('stage'), t = stage && [...stage.querySelectorAll('video')].find(v => v.src.includes('/travel_'));
  if (!t) return;
  const c = CHAINS[PAGE], specs = c ? c.clips.map(x => typeof x === 'string' ? {src: x} : x) : [];
  const vids = specs.map(sp => { const v = document.createElement('video'); Object.assign(v, {src: VD + sp.src, muted: true, playsInline: true, preload: 'auto'});
    v.style.transition = 'none'; stage.appendChild(v); v.load(); return v; });
  let state = 0;
  const end = v => new Promise(r => { v.onended = r; });
  const chain = async () => {                        // كل مقطع فوق الذي قبله؛ السابق يبقى متجمّداً تحته على آخر لقطة
    for (let i = 0; i < vids.length; i++){
      const v = vids[i], sp = specs[i], ended = end(v); v.currentTime = 0;
      if (sp.join){                                  // اقتراب من صورة أفق: ينزلق آخر الوصل إلى موضعها ويذوب فيها
        const [s, dx, dy] = sp.join, prev = vids[i - 1], o = {duration: 900, easing: 'ease-in-out', fill: 'forwards'};
        v.style.opacity = 0; v.classList.add('on'); await v.play().catch(() => {});
        await Promise.all([prev.animate([{transform: tf(1, 0, 0)}, {transform: tf(s, dx, dy)}], o).finished,
          v.animate([{transform: tf(1/s, -dx/s, -dy/s), opacity: 0}, {transform: tf(1, 0, 0), opacity: 1}], o).finished]);
        v.style.opacity = '';
      } else { await v.play().catch(() => {}); v.classList.add('on'); }
      if (i === 0) t.pause();
      await ended;
    }
    // نهاية آخر مقطع = نهاية الرحلة: مقطع الرحلة المتوقّف تحتها يُقفز إلى آخره كي تكمل الصفحة (onended أو TRAVEL_END)
    state = 2; t.currentTime = Math.max(0, t.duration - .05); t.play().catch(() => {});
  };
  const go = () => { if (state) return; state = 1; chain(); };
  t.addEventListener('play', () => {
    if (run) return;
    const runLen = c ? c.cut + vids.reduce((a, v) => a + (v.duration || 5.9), 0) : t.duration;
    run = {t, words: W(2000).then(() => words(PAGE, Math.max(1, Math.min(3, Math.floor((runLen - 2.4)/2.3)))))};
    if (!c) return;
    const w = (now, m) => { if (state) return; m.mediaTime >= c.cut - .02 ? go() : t.requestVideoFrameCallback(w); };
    t.requestVideoFrameCallback && t.requestVideoFrameCallback(w);
    t.addEventListener('timeupdate', () => { if (!state && t.currentTime >= c.cut + .1) go(); });
  });
}
setTimeout(setupJourney, 0);                         // بعد أن تنشئ الصفحة مقاطعها
// الصورة النظيفة لكل محطة: تُحمَّل مسبقاً أثناء فاصل الكلمات في الصفحة السابقة
const STILLS = {river2: 'station_riv2.jpg', bridge: 'station_bridge.jpg', glade: 'station_glade.jpg', meadow: 'station_meadow.jpg',
  oasis: 'station_oasis.jpg', beach: 'station_beach.jpg', savanna: 'station_savanna.jpg', snow: 'station_snow.jpg',
  damascus: 'station_damascus.jpg', rain: 'station_rain.jpg', autumn: 'station_autumn.jpg', olive: 'station_olive.jpg',
  aqsa: 'station_aqsa.jpg', kaaba: 'station_kaaba.jpg'};

/* كلمات الرحلة بعد كل محطة: من كلمات الباء في التطبيق، **في الموضع نفسه** الذي اختُبر فيه الطفل للتو (بداية،
   وسط بعد متّصل، وسط بعد غير متّصل، نهاية بعد متّصل، نهاية بعد غير متّصل)، وغير كلمات المحطات حتى لا تكشف جواباً */
const WORDS = {
  fig: ['باب', 'بحر', 'بقرة'],             river2: ['ملعب', 'كواكب', 'مكاتب'],   bridge: ['بحيرة', 'بستان', 'برتقال'],   // بداية | نهاية بعد متّصل | بداية
  glade: ['لبن', 'كبير', 'حقيبة'],         meadow: ['زبدة', 'ربطة', 'أربعة'],    oasis: ['شراب', 'أقارب', 'عرب'],        // وسط بعد متّصل | وسط بعد غير متّصل | نهاية بعد غير متّصل
  beach: ['عرب', 'تجارب', 'مشارب'],        savanna: ['ملاعب', 'مكاتب', 'كواكب'], snow: ['ملعب', 'ملاعب', 'كواكب'],       // نهاية بعد غير متّصل | نهاية بعد متّصل ×2
  damascus: ['باب', 'بحيرة', 'برتقال'],    rain: ['نبض', 'جبهة', 'مكتبة'],      autumn: ['ملعب', 'مكاتب', 'كواكب'],     // بداية | وسط بعد متّصل | نهاية بعد متّصل
  olive: ['زبد', 'مربية', 'أربعة'],        aqsa: ['بحر', 'بستان', 'بقرة'],                                                // وسط بعد غير متّصل | بداية
};
// تشكيل الكلمة من بيانات التطبيق (مصفوفة حركات لكل حرف)
function voweled(w){
  for (const lv of Object.values(LETTER_BA.levels)) for (const [k, list] of Object.entries(lv)){
    if (k.endsWith('D')) continue; const i = list.indexOf(w);
    if (i >= 0){ const d = lv[k + 'D'][i] || []; return Array.from(w).map((c, j) => [c, d[j] || '']); } }
  return Array.from(w).map(c => [c, '']);
}

let cur = null;
const say = src => new Promise(res => { try{ cur && cur.pause(); }catch(e){} const a = new Audio(src); cur = a;
  a.onended = a.onerror = () => res(); a.play().catch(() => res()); });
const W = ms => new Promise(r => setTimeout(r, ms));
// جاهزية صورة: decode() قد يتأخّر في صفحة غير مرسومة (تبويب خلفي)، فيكفي حدث التحميل، ولا انتظار فوق 2ث
const ready = img => Promise.race([img.decode().catch(() => {}),
  new Promise(r => { if (img.complete) return r(); img.addEventListener("load", r, {once: true}); img.addEventListener("error", r, {once: true}); }).then(() => W(80)), W(2000)]);
function preload(src){ const i = new Image(); i.src = VD + src; return ready(i); }

const css = document.createElement('style');
css.textContent = `
#cine-words{position:fixed;left:0;right:0;top:20%;height:30%;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:6}
#cine-words .cw{position:absolute;padding:.12em .55em .2em;border-radius:.5em;background:rgba(20,14,4,.42);backdrop-filter:blur(3px);
  font:700 min(17vw,84px)/1.35 'Noto Naskh Arabic','Amiri',serif;color:#fffbe8;direction:rtl;white-space:nowrap;
  text-shadow:0 3px 0 #3d250e,0 0 18px rgba(0,0,0,.35)}
#cine-words .cw b{font-weight:inherit;color:#ffd84a;text-shadow:0 3px 0 #3d250e,0 0 16px rgba(255,210,70,.85)}
`;
document.head.appendChild(css);

/* ── إبعاد الخيارات عن اللافتة: مواضع الخيارات بإحداثيات الصورة، والصورة تملأ الشاشة وتُقصّ، فعلى الشاشات القصيرة
   أو العريضة تقع الخيارات العليا تحت اللافتة. بعد بناء الخيارات تُزاح كلها معاً بالقدر اللازم فقط:
   إلى الأسفل إن كانت اللافتة في الأعلى، وإلى الأعلى إن كانت في الأسفل (الأقصى). لوح التجميع يوضع تحت اللافتة مباشرة ── */
export function keepClear(stage){
  const sign = document.getElementById('sign'), tray = document.getElementById('tray'), GAP = 10;
  const sb = sign.getBoundingClientRect(), signLow = sb.top > innerHeight/2;
  const top = sb.top - 16, bottom = sb.bottom + 16;  // اللافتة قبل ظهورها مزاحة 16px عن موضعها
  const items = [...stage.querySelectorAll('.leaf,.pad')];
  if (items.length){
    // بالحجم الكامل لا بالظاهر: الخيارات تُبنى مصغّرة ثم تكبر عند ظهورها، ومركزها عند (left, top)
    const st = stage.getBoundingClientRect(), S = st.width / IW;
    const ys = items.map(e => [st.top + (e.offsetTop - e.offsetHeight/2)*S, st.top + (e.offsetTop + e.offsetHeight/2)*S]);
    const need = signLow ? Math.min(0, top - GAP - Math.max(...ys.map(y => y[1])))
                         : Math.max(0, bottom + GAP - Math.min(...ys.map(y => y[0])));
    if (need) items.forEach(e => e.style.top = (parseFloat(e.style.top) + need/S) + 'px');
  } else if (tray && !signLow){
    const tt = tray.getBoundingClientRect().top;      // لوح في النصف الأعلى (لا لوح الكعبة المثبّت في الأسفل)
    if (tt < innerHeight/2 && tt < bottom + GAP) tray.style.top = (bottom + GAP) + 'px';
  }
}

/* ── كلمات الرحلة: أثناء الركض، تظهر كل كلمة كبيرة أمام الطفل والباء فيها ذهبية، وتُقرأ بصوتها ثم تصعد وتختفي.
   عددها بقدر طول الرحلة (1 إلى 3) كي لا تطول عنها ── */
async function words(page, n){
  const list = (WORDS[page] || []).slice(0, n); if (!list.length) return;
  const box = document.createElement('div'); box.id = 'cine-words'; document.body.appendChild(box);
  for (const w of list){
    const e = document.createElement('div'); e.className = 'cw';
    e.innerHTML = voweled(w).map(([c, m]) => c === 'ب' ? `<b>${c}${m}</b>` : c + m).join('');
    box.appendChild(e);
    await e.animate([{opacity: 0, transform: 'translateY(26px) scale(.7)'}, {opacity: 1, transform: 'none'}], {duration: 400, easing: 'cubic-bezier(.2,.9,.3,1.25)', fill: 'forwards'}).finished;
    await Promise.all([say(`/audio/words/${w}.mp3`), W(1000)]); await W(250);
    await e.animate([{opacity: 1, transform: 'none'}, {opacity: 0, transform: 'translateY(-40px) scale(.92)'}], {duration: 380, easing: 'ease-in', fill: 'forwards'}).finished;
    e.remove();
  }
  box.remove();
}

/* ── مغادرة المحطة (بعد نهاية الرحلة): تحميل بداية المحطة التالية مسبقاً، وانتظار آخر كلمة، ثم الانتقال ── */
export async function leave(page, before){
  const next = ORDER[ORDER.indexOf(page) + 1], seam = SEAMS[next];
  const ready = Promise.all([seam.cover && preload(seam.cover), preload(STILLS[next])]);
  if (run) await run.words;
  else if (tailVid){                                 // الكلمات تُقرأ أثناء الركض في المقطع اللاحق
    document.getElementById('stage').appendChild(tailVid);
    await Promise.all([new Promise(r => { tailVid.onended = r; tailVid.play().then(() => tailVid.classList.add('on')).catch(r); }),
      W(1200).then(() => words(page, 2))]);
  }
  if (before) await before();                        // الأقصى: النور الأبيض بعد الكلمات
  await Promise.race([ready, W(2500)]);
  location.href = next + '?cont=1';                  // بلا .html: الخادم يعيد التوجيه ويُسقط الاستعلام
}

/* ── وصول المحطة (?cont=1): الصفحة مخفية حتى تُفكّ اللقطة والصورة النظيفة معاً (كي يكون أول ما يُرسم هو اللقطة
   نفسها التي انتهت عليها الصفحة السابقة)، ثم تنزلق اللقطة إلى موضع الصورة النظيفة وتذوب فيها خلال 1.8ث ── */
export async function arrive(page, stage, CX){
  const seam = SEAMS[page], still = stage.querySelector('img'), root = document.documentElement;
  let intro = null;                                  // مقطع الوصول المعكوس: يحلّ محلّ الصورة حتى ينتهي عليها
  if (seam.intro){ intro = document.createElement('video'); Object.assign(intro, {src: VD + seam.intro, muted: true, playsInline: true, preload: 'auto'});
    intro.className = 'on'; intro.style.transition = 'none'; stage.appendChild(intro);
    await new Promise(r => { if (intro.readyState >= 2) return r(); intro.addEventListener('loadeddata', r, {once: true}); setTimeout(r, 3000); });
    if (seam.introFrom){ intro.currentTime = seam.introFrom; await new Promise(r => { intro.addEventListener('seeked', r, {once: true}); setTimeout(r, 1500); }); } }
  const playIntro = async () => { if (!intro) return;
    await new Promise(r => { intro.onended = r; intro.play().catch(r); });
    still.classList.add('on'); intro.remove(); };
  if (seam.white && seam.run){                       // من النور: يركض الطفل بالإحرام على ممرّ نحو الكعبة، والكاميرا على مستوى كتفه
    const glow = document.createElement('div'); glow.style.cssText = 'position:fixed;inset:0;background:#fffdf4;z-index:9';
    document.body.appendChild(glow);
    const v = document.createElement('video'); Object.assign(v, {src: VD + seam.run, muted: true, playsInline: true, preload: 'auto'});
    v.className = 'on'; v.style.transition = 'none'; stage.appendChild(v);
    await new Promise(r => { if (v.readyState >= 2) return r(); v.addEventListener('loadeddata', r, {once: true}); setTimeout(r, 3000); });
    root.classList.remove('cont'); await W(300);
    const ran = new Promise(r => { v.onended = r; v.play().catch(r); });
    await glow.animate([{opacity: 1}, {opacity: 0}], {duration: 1400, easing: 'ease-out', fill: 'forwards'}).finished;
    glow.remove(); await ran;
    // آخر لقطة في الركض صورةً ثابتة تحلّ محلّ الفيديو، ثم الانزلاق والذوبان في صورة المحطة كما في باقي المحطات
    seam.white = false;                              // (بلا إخفاء الصفحة: الفيديو يبقى ظاهراً حتى تُحمَّل اللقطة)
    const p = arrive(page, stage, CX); await W(60); v.remove(); return p;
  }
  if (seam.white){
    const glow = document.createElement('div'); glow.style.cssText = 'position:fixed;inset:0;background:#fffdf4;z-index:9';
    document.body.appendChild(glow); await ready(still);
    root.classList.remove('cont'); await W(500);
    const done = playIntro();                        // الكاميرا تبدأ الهبوط والنور ينقشع عنها
    await glow.animate([{opacity: 1}, {opacity: 0}], {duration: 1600, easing: 'ease-out', fill: 'forwards'}).finished;
    glow.remove(); await done; return;
  }
  const target = intro || still;
  const cover = new Image(); cover.src = VD + seam.cover; cover.className = 'on';
  await Promise.all([ready(cover), ready(still)]);
  [cover, still].forEach(e => e.style.transition = 'none');
  still.classList.add('on'); stage.appendChild(cover);  // (المقطع المعكوس إن وُجد فوق الصورة وتحت اللقطة)
  const S = Math.max(innerWidth/IW, innerHeight/IH), clamp = c => Math.min(Math.max(c, innerWidth/S/2), IW - innerWidth/S/2);
  const pan = (clamp(CX) - clamp(seam.fromCX ?? CX)) * S, [s, dx, dy] = seam.align;
  // اللقطة تنتقل من موضعها إلى موضع الصورة النظيفة، والصورة تبدأ مطابقة لها وتعود إلى موضعها: كلا التحويلين خطّي
  // في الزمن بالتسهيل نفسه، فتبقيان متطابقتين في كل لحظة بينما تذوب اللقطة
  const tf = (k, x, y) => `translate(${x}px,${y}px) scale(${k})`, D = 1800, opt = {duration: D, easing: 'ease-in-out', fill: 'forwards'};
  const from = [tf(1, 0, 0), tf(1/s, -dx/s, -dy/s)], to = [tf(s, dx, dy), tf(1, 0, 0)];
  if (s < .98) cover.style.cssText += ';-webkit-mask-image:linear-gradient(90deg,#0000,#000 7%,#000 93%,#0000),linear-gradient(#0000,#000 6%,#000 94%,#0000);-webkit-mask-composite:source-in;mask-composite:intersect';
  cover.style.transform = from[0]; target.style.transform = from[1]; stage.style.translate = `${pan}px 0`;
  const glow = document.createElement('div'); glow.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2;opacity:0;' +
    'background:radial-gradient(ellipse at 50% 55%,rgba(255,250,230,.75),rgba(255,244,210,.35) 55%,rgba(255,240,200,0) 85%)';
  document.body.appendChild(glow);
  root.classList.remove('cont');
  await W(250);
  const anims = [cover.animate([{transform: from[0]}, {transform: to[0]}], opt), target.animate([{transform: from[1]}, {transform: to[1]}], opt),
    stage.animate([{translate: `${pan}px 0`}, {translate: '0px 0'}], opt),
    cover.animate([{opacity: 1}, {opacity: 1, offset: .1}, {opacity: 0}], {duration: D, easing: 'ease-in-out', fill: 'forwards'}),
    // وهج ضوء خفيف في منتصف الذوبان يُخفي ما بقي من ازدواج الحواف حيث لا تتطابق اللقطتان تماماً
    glow.animate([{opacity: 0}, {opacity: .55, offset: .45}, {opacity: 0}], {duration: D, easing: 'ease-in-out', fill: 'forwards'})];
  await Promise.all(anims.map(a => a.finished));
  cover.remove(); glow.remove(); anims.forEach(a => a.cancel()); target.style.transform = ''; still.style.transition = ''; stage.style.translate = '';
  await playIntro();
}
