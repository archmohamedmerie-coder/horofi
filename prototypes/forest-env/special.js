// سؤال الحروف الستة غير المتصلة في الرحلة (الألف أولاً): كلمتان، الصحيحة والخاطئة، كتمرين التمييز في التطبيق.
// نسخة حرفية من دوالّ التطبيق (horofi-v11-9-29.html): shapeWord وnaturalFormAt وbuildSpecialWrongSet
// وforceJoinWord وbuildPrecedingJoinWrong، وترتيب الاختيار في buildSpecialIdentify — كي يرى الطفل الخطأ نفسه.
import { ARFORMS } from '/prototypes/forest-env/data.js';

const KASHIDA = 'ـ';
const HL = p => `<span class="tl">${p}</span>`;

export function shapeWord(letters, overrides = {}, diac = null, highlightIdx = -1){
  let out = '';
  for (let i = 0; i < letters.length; i++){
    const ch = letters[i], f = ARFORMS[ch], mark = (diac && diac[i]) ? diac[i] : '';
    let piece;
    if (!f) piece = ch + mark;
    else if (overrides[i]) piece = String.fromCodePoint(f[overrides[i]] || f.iso) + mark;
    else {
      const prev = letters[i-1], prevConnects = prev && ARFORMS[prev] && ARFORMS[prev].c, hasNext = letters[i+1] !== undefined;
      let form;
      if (prevConnects && hasNext && f.med) form = 'med';
      else if (prevConnects && f.fin) form = 'fin';
      else if (!prevConnects && hasNext && f.ini) form = 'ini';
      else form = 'iso';
      piece = String.fromCodePoint(f[form] || f.iso) + mark;
    }
    out += (i === highlightIdx) ? HL(piece) : piece;
  }
  return out;
}
function naturalFormAt(letters, i){
  const f = ARFORMS[letters[i]]; if (!f) return null;
  const prev = letters[i-1], prevConnects = prev && ARFORMS[prev] && ARFORMS[prev].c, hasNext = letters[i+1] !== undefined;
  if (prevConnects && hasNext && f.med) return 'med';
  if (prevConnects && f.fin) return 'fin';
  if (!prevConnects && hasNext && f.ini) return 'ini';
  return 'iso';
}
function _piece(letters, i, forceForm){
  const ch = letters[i], f = ARFORMS[ch]; if (!f) return ch;
  const fm = forceForm || naturalFormAt(letters, i);
  return String.fromCodePoint(f[fm] !== undefined ? f[fm] : f.iso);
}
const _naturalPiece = (letters, i) => _piece(letters, i, null);

function buildSpecialWrongSet(letters, idx, diac){
  const correct = shapeWord(letters, {}, diac), neighborSingles = [], selfSingles = [];
  const tf = ARFORMS[letters[idx]], natSelf = naturalFormAt(letters, idx);
  const next = letters[idx+1];
  if (next !== undefined && ARFORMS[next]){
    const natNext = naturalFormAt(letters, idx+1);
    if (ARFORMS[next].med !== undefined && natNext !== 'med') neighborSingles.push({[idx+1]: 'med'});
    if (ARFORMS[next].fin !== undefined && natNext !== 'fin') neighborSingles.push({[idx+1]: 'fin'});
    if (ARFORMS[next].ini !== undefined && natNext !== 'ini') neighborSingles.push({[idx+1]: 'ini'});
  }
  const prev = letters[idx-1];
  if (prev !== undefined && ARFORMS[prev]){
    const natPrev = naturalFormAt(letters, idx-1);
    if (ARFORMS[prev].iso !== undefined && natPrev !== 'iso') neighborSingles.push({[idx-1]: 'iso'});
    if (ARFORMS[prev].fin !== undefined && natPrev !== 'fin') neighborSingles.push({[idx-1]: 'fin'});
  }
  if (tf){
    if (tf.fin !== undefined && natSelf !== 'fin') selfSingles.push({[idx]: 'fin'});
    if (tf.iso !== undefined && natSelf !== 'iso') selfSingles.push({[idx]: 'iso'});
  }
  const allSingles = neighborSingles.concat(selfSingles), combos = [];
  for (let i = 0; i < allSingles.length; i++) for (let j = i + 1; j < allSingles.length; j++) combos.push(Object.assign({}, allSingles[i], allSingles[j]));
  const seen = new Set([correct]), wrongs = [];
  for (const ov of neighborSingles.concat(combos).concat(selfSingles)){
    const w = shapeWord(letters, ov, diac);
    if (!seen.has(w)){ seen.add(w); wrongs.push(w); }
    if (wrongs.length >= 3) break;
  }
  return wrongs;
}
function forceJoinWord(letters, idx, diac){
  const nextI = idx + 1;
  if (letters[nextI] === undefined){
    let out = ''; for (let i = 0; i < letters.length; i++) out += _naturalPiece(letters, i) + ((diac && diac[i]) || ''); return out;
  }
  const nf = ARFORMS[letters[nextI]], nextHasNext = letters[nextI+1] !== undefined;
  const forced = (nextHasNext && nf && nf.med !== undefined) ? 'med' : 'fin';
  let out = '';
  for (let i = 0; i < letters.length; i++){
    const mark = (diac && diac[i]) ? diac[i] : '';
    let piece;
    if (i === nextI) piece = _piece(letters, i, forced) + mark;
    else if (i === nextI + 1 && forced === 'med'){
      const f = ARFORMS[letters[i]], hn = letters[i+1] !== undefined;
      piece = _piece(letters, i, (hn && f && f.med !== undefined) ? 'med' : 'fin') + mark;
    } else piece = _naturalPiece(letters, i) + mark;
    out += piece;
    if (i === idx) out += KASHIDA;
  }
  return out;
}
function buildPrecedingJoinWrong(letters, idx, diac){
  const pi = idx - 1; if (pi < 0) return null;
  const pf = ARFORMS[letters[pi]]; if (!pf) return null;
  const natPrev = naturalFormAt(letters, pi);
  let detachForm = null;
  if (natPrev === 'med' && pf.fin !== undefined) detachForm = 'fin';
  else if (natPrev === 'ini' && pf.iso !== undefined) detachForm = 'iso';
  if (!detachForm) return null;
  let out = '';
  for (let i = 0; i < letters.length; i++) out += (i === pi ? _piece(letters, i, detachForm) : _naturalPiece(letters, i)) + ((diac && diac[i]) || '');
  return out;
}

// الكلمتان كما في buildSpecialIdentify: الصحيحة، والخاطئة (فصل ما قبل الحرف، ثم إلصاقه بما بعده، ثم بقية الأخطاء)
export function specialPair(w){
  const correct = shapeWord(w.letters, {}, w.diac);
  let wrong;
  if (w.idx > 0) wrong = buildPrecedingJoinWrong(w.letters, w.idx, w.diac);
  if (!wrong || wrong === correct) wrong = forceJoinWord(w.letters, w.idx, w.diac);
  if (!wrong || wrong === correct) wrong = buildSpecialWrongSet(w.letters, w.idx, w.diac)[0] || correct;
  return {correct, wrong, highlighted: shapeWord(w.letters, {}, w.diac, w.idx)};
}
