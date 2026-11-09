/* ジャズ・ステップ
 * 音はすべてブラウザ内で合成（Web Audio API）。音源ファイルは不要。
 */
(() => {
'use strict';

/* ========== 音楽の基本データ ========== */
const NOTE = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const NOTE_JA = ['ド', 'レ♭', 'レ', 'ミ♭', 'ミ', 'ファ', 'ソ♭', 'ソ', 'ラ♭', 'ラ', 'シ♭', 'シ'];
const TYPES = {
  'maj7':  { iv: [0, 4, 7, 11], feel: '明るい・ふんわり' },
  'm7':    { iv: [0, 3, 7, 10], feel: '落ち着き・少し切ない' },
  '7':     { iv: [0, 4, 7, 10], feel: '緊張・次へ進みたい' },
  'm7♭5':  { iv: [0, 3, 6, 10], feel: '暗い・不安定' },
  '6':     { iv: [0, 4, 7, 9],  feel: '明るい・レトロ' },
  'm6':    { iv: [0, 3, 7, 9],  feel: '切ない・ミステリアス' },
  '':      { iv: [0, 4, 7],     feel: '普通の明るい和音' },
  'm':     { iv: [0, 3, 7],     feel: '普通の暗い和音' },
};
const BLUES_SCALE = [0, 3, 5, 6, 7, 10];

function parseChord(sym) {
  const m = /^([A-G])(♭|#)?(.*)$/.exec(sym);
  let pc = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
  if (m[2] === '♭') pc = (pc + 11) % 12;
  if (m[2] === '#') pc = (pc + 1) % 12;
  return { root: pc, type: m[3], iv: TYPES[m[3]].iv };
}
const sym = (pc, type) => NOTE[((pc % 12) + 12) % 12] + type;
const bassOf = pc => { const n = 36 + pc; return n > 43 ? n - 12 : n; };
// 中音域に寄せたボイシング（自然になめらかにつながる）
const voicing = ch => ch.iv.map(i => { let n = 48 + (ch.root + i) % 12; while (n < 55) n += 12; return n; });

/* ========== 音エンジン ========== */
let ctx, master;
const live = new Set();
let timers = [], loops = [];

function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor();
    master = ctx.createGain(); master.gain.value = 0.8;
    master.connect(comp); comp.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
const hz = m => 440 * Math.pow(2, (m - 69) / 12);

function track(node, end) {
  live.add(node);
  node.onended = () => live.delete(node);
  node.stop(end);
}
// エレピ風の音
function tone(midi, t, dur, vol = 0.14) {
  const c = ac();
  const g = c.createGain(), f = c.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 2600;
  const o1 = c.createOscillator(), o2 = c.createOscillator(), g2 = c.createGain();
  o1.type = 'triangle'; o1.frequency.value = hz(midi);
  o2.type = 'sine'; o2.frequency.value = hz(midi) * 2; g2.gain.value = 0.25;
  o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(f); f.connect(master);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(vol * 0.35, t + Math.min(0.5, dur));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.25);
  o1.start(t); o2.start(t);
  track(o1, t + dur + 0.3); track(o2, t + dur + 0.3);
}
// ウッドベース風
function bass(midi, t, dur) {
  const c = ac();
  const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
  o.type = 'triangle'; o.frequency.value = hz(midi);
  f.type = 'lowpass'; f.frequency.value = 700;
  o.connect(f); f.connect(g); g.connect(master);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.42, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t); track(o, t + dur + 0.05);
}
// シンバル（ハイハット）
let noiseBuf;
function hat(t, vol = 0.12, len = 0.08) {
  const c = ac();
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = 7000;
  s.connect(f); f.connect(g); g.connect(master);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  s.start(t); track(s, t + len + 0.02);
}

function stopAll() {
  live.forEach(n => { try { n.stop(); } catch (e) {} });
  live.clear();
  timers.forEach(clearTimeout); timers = [];
  loops.forEach(clearInterval); loops = [];
  document.querySelectorAll('.btn.on[data-toggle]').forEach(b => b.classList.remove('on'));
}
function at(t, fn) { timers.push(setTimeout(fn, Math.max(0, (t - ac().currentTime) * 1000))); }

function playChordSym(s, { arp = false, withBass = true } = {}) {
  stopAll();
  const c = ac(), t = c.currentTime + 0.05, ch = parseChord(s);
  if (withBass) bass(bassOf(ch.root), t, 1.6);
  voicing(ch).forEach((n, i) => tone(n, t + (arp ? i * 0.35 : 0), arp ? 1.6 - i * 0.2 : 1.8));
}
function playNotes(notes, { arp = false } = {}) {
  stopAll();
  const t = ac().currentTime + 0.05;
  notes.forEach((n, i) => tone(n, t + (arp ? i * 0.3 : 0), 1.6));
}

/* 進行を伴奏つきで演奏（ウォーキングベース＋コンピング＋シンバル）
 * items: "Dm7"（4拍） or "Dm7:2"（2拍） */
function playProg(items, { bpm = 120, loop = false, onStep } = {}) {
  stopAll();
  const c = ac(), spb = 60 / bpm;
  const list = items.map(x => { const [s, b] = x.split(':'); return { s, b: +(b || 4), ch: parseChord(s) }; });
  let i = 0, t = c.currentTime + 0.1;
  const tick = () => {
    while (t < c.currentTime + 0.6) {
      if (i >= list.length) {
        if (!loop) { at(t, () => onStep && onStep(-1)); clearInterval(id); return; }
        i = 0;
      }
      const it = list[i], next = list[(i + 1) % list.length];
      const r = bassOf(it.ch.root), nr = bassOf(next.ch.root);
      const walk = it.b >= 4 ? [r, r + it.ch.iv[1], r + it.ch.iv[2], nr - 1] : [r, nr + 1];
      walk.forEach((n, k) => bass(n, t + k * spb, spb * 0.95));
      const v = voicing(it.ch);
      v.forEach(n => tone(n, t, spb * 0.8, 0.09));
      if (it.b >= 4) v.forEach(n => tone(n, t + spb * 1.67, spb * 0.4, 0.07)); // 2拍目の裏（スウィング）
      for (let k = 0; k < it.b; k++) {
        hat(t + k * spb, k % 2 ? 0.1 : 0.05);
        if (k % 2) hat(t + (k + 0.67) * spb, 0.04);
      }
      const idx = i; at(t, () => onStep && onStep(idx));
      t += it.b * spb; i++;
    }
  };
  const id = setInterval(tick, 100); loops.push(id); tick();
}

/* 8分音符のメロディ：ストレート or スウィング */
function playEighths(swing) {
  stopAll();
  const c = ac(), spb = 0.5;
  const mel = [60, 62, 64, 65, 67, 69, 67, 64, 65, 64, 62, 60, 62, 59, 60, 60];
  const t0 = c.currentTime + 0.1;
  mel.forEach((n, i) => {
    const beat = Math.floor(i / 2), off = i % 2 ? (swing ? 0.67 : 0.5) : 0;
    const t = t0 + (beat + off) * spb;
    tone(n + 12, t, (i % 2 ? (swing ? 0.3 : 0.45) : (swing ? 0.6 : 0.45)) * spb + 0.05, i % 2 && swing ? 0.1 : 0.13);
  });
  for (let b = 0; b < 8; b++) hat(t0 + b * spb, b % 2 ? 0.12 : 0.04);
}
/* フレーズ: [midi or null, 拍数] */
function playPhrase(ph, bpm = 120) {
  stopAll();
  const spb = 60 / bpm; let t = ac().currentTime + 0.1;
  ph.forEach(([n, b]) => { if (n) tone(n, t, b * spb * 0.9 + 0.05, 0.15); t += b * spb; });
}
function playScale(root, iv) {
  stopAll();
  const t = ac().currentTime + 0.05;
  [...iv, 12].forEach((i, k) => tone(root + i, t + k * 0.28, 0.4));
}

/* ========== レッスン内容 ========== */
const F_BLUES = ['F7', 'B♭7', 'F7', 'F7', 'B♭7', 'B♭7', 'F7', 'D7', 'Gm7', 'C7', 'F7', 'C7'];
const AUTUMN = ['Cm7', 'F7', 'B♭maj7', 'E♭maj7', 'Am7♭5', 'D7', 'Gm7', 'Gm7'];
const LICK = [[72, .67], [75, .33], [77, 1], [75, .67], [72, .33], [70, 1], [null, 1],
              [72, .67], [75, .33], [77, 1], [75, .67], [72, .33], [65, 2]];

const LESSONS = [
  {
    id: 'swing', title: 'ジャズの「ノリ」を知る', sub: 'スウィング・2拍目と4拍目',
    cards: [
      { h: 'ジャズらしさの正体は「リズム」', t: 'ジャズの一番の特徴は<b>スウィング</b>という跳ねるリズム。同じメロディでも、リズムを変えるだけでジャズっぽくなります。' },
      { h: '聴きくらべてみよう', t: '同じメロディを2通りで弾きます。違いを感じてみてください。',
        btns: [{ l: '▶ まっすぐ', s: 'タタ タタ', fn: () => playEighths(false) },
               { l: '▶ スウィング', s: 'タッカ タッカ', fn: () => playEighths(true) }],
        tip: 'スウィングは「長い・短い」の繰り返し。「タッカ タッカ」と口で言うのが近道です。' },
      { h: '手拍子は2拍目と4拍目', t: 'ジャズでは「1・<b>2</b>・3・<b>4</b>」の<b>2と4</b>にアクセントがきます。シンバルの「チッ」が強く鳴るところで手を叩いてみましょう。',
        btns: [{ l: '▶ もう一度スウィング', s: '2と4で手拍子', fn: () => playEighths(true) }] },
      { quiz: { q: 'ジャズで手拍子を打つのは何拍目？', opts: ['1拍目と3拍目', '2拍目と4拍目', '全部の拍'], a: 1,
        ex: '2と4で叩くと、一気にジャズのノリになります。' } },
    ],
  },
  {
    id: 'seventh', title: 'ジャズの和音「セブンス」', sub: '4つの音でできたおしゃれな響き',
    cards: [
      { h: '和音に1音足すとジャズになる', t: 'ポップスの和音は3つの音（ド・ミ・ソ）が基本。ジャズはもう1音足した<b>4音の和音</b>を使います。',
        btns: [{ l: '▶ C（3音）', s: 'ド・ミ・ソ', fn: () => playChordSym('C') },
               { l: '▶ Cmaj7（4音）', s: 'ド・ミ・ソ・シ', fn: () => playChordSym('Cmaj7') }] },
      { h: 'まず覚えるのは3種類', t: '表情を言葉で覚えるのがコツです。',
        btns: [{ l: '▶ Cmaj7', s: '明るい・ふんわり', fn: () => playChordSym('Cmaj7') },
               { l: '▶ Cm7', s: '落ち着き・少し切ない', fn: () => playChordSym('Cm7') },
               { l: '▶ C7', s: '緊張・次へ進みたい', fn: () => playChordSym('C7') }] },
      { h: '名前の読み方', t: '<span class="chord">C</span> は「ド」のこと。<span class="chord">maj7</span>＝メジャーセブンス、<span class="chord">m7</span>＝マイナーセブンス、<span class="chord">7</span>＝セブンス（ドミナント）と読みます。',
        tip: '1音ずつ鳴らすと、どの音が違うか分かりやすくなります。',
        btns: [{ l: '▶ Cmaj7 を1音ずつ', s: '', fn: () => playChordSym('Cmaj7', { arp: true }) },
               { l: '▶ C7 を1音ずつ', s: '最後の音が半音低い', fn: () => playChordSym('C7', { arp: true }) }] },
      { quiz: { q: '「緊張感があって、次に進みたがる」和音は？', opts: ['maj7', 'm7', '7'], a: 2,
        ex: '7（ドミナント）は不安定。だから次の和音に「解決」したくなります。' } },
      { quiz: { q: '耳で答えよう。今の和音は？', play: () => playChordSym('Fm7'), opts: ['maj7（明るい）', 'm7（切ない）', '7（緊張）'], a: 1,
        ex: '少し暗くて落ち着いた響き。これが m7 です。' } },
    ],
  },
  {
    id: 'twofive', title: '最重要パターン ii-V-I', sub: 'ジャズの曲の大半はこれ',
    cards: [
      { h: 'ジャズの「決まり文句」', t: '<span class="chord">Dm7 → G7 → Cmaj7</span>。この3つの流れを<b>ツー・ファイブ・ワン</b>と呼びます。ジャズの曲の大部分はこの形の組み合わせです。',
        btns: [{ l: '▶ ii-V-I を聴く', s: 'Dm7 → G7 → Cmaj7', fn: () => playProg(['Dm7', 'G7', 'Cmaj7', 'Cmaj7']) }] },
      { h: '物語で覚える', t: '<span class="chord">Dm7</span> 出発 → <span class="chord">G7</span> 盛り上がり（緊張）→ <span class="chord">Cmaj7</span> 到着（ほっとする）。',
        tip: 'レッスン2の「7は次へ進みたい」が、ここで活きてきます。' },
      { h: 'どのキーでも同じ形', t: '高さが変わっても「m7 → 7 → maj7」の並びは同じ。形で覚えると楽になります。',
        btns: [{ l: '▶ キーF', s: 'Gm7 → C7 → Fmaj7', fn: () => playProg(['Gm7', 'C7', 'Fmaj7', 'Fmaj7']) },
               { l: '▶ キーB♭', s: 'Cm7 → F7 → B♭maj7', fn: () => playProg(['Cm7', 'F7', 'B♭maj7', 'B♭maj7']) }] },
      { quiz: { q: 'ii-V-I の「V」（真ん中）に来る和音の種類は？', opts: ['maj7', 'm7', '7'], a: 2,
        ex: 'm7 → <b>7</b> → maj7。真ん中が緊張役の 7 です。' } },
    ],
  },
  {
    id: 'blues', title: 'ブルース：12小節の型', sub: 'セッションで一番よく演奏される形',
    cards: [
      { h: 'ジャズの土台はブルース', t: 'ブルースは<b>12小節で1周</b>する決まった型。世界中のジャムセッションで最初に演奏されることが多い形です。' },
      { h: '12小節を目で追おう', t: '今どこを弾いているか光ります。', grid: F_BLUES,
        btns: [{ l: '▶ Fのブルース', s: '12小節', fn: 'grid' }] },
      { h: '全部「7」なのがブルース', t: 'ふつうは緊張役の <span class="chord">7</span> を、ブルースではずっと使います。このザラッとした響きがブルースらしさです。',
        tip: '9〜10小節目に ii-V（Gm7 → C7）が隠れています。' },
      { quiz: { q: 'ブルースは何小節で1周？', opts: ['8小節', '12小節', '32小節'], a: 1, ex: '12小節。数えながら聴くと迷子になりません。' } },
    ],
  },
  {
    id: 'adlib', title: 'アドリブの第一歩', sub: 'ブルース・スケールで弾いてみる',
    cards: [
      { h: 'アドリブ＝その場で作るメロディ', t: '難しく考えなくて大丈夫。最初は<b>6つの音だけ</b>で弾けます。それが<b>ブルース・スケール</b>です。',
        btns: [{ l: '▶ Fブルース・スケール', s: 'F A♭ B♭ B C E♭', fn: () => playScale(65, BLUES_SCALE) }] },
      { h: 'うまく聴こえる3つのコツ', t: '① 短いフレーズを<b>くり返す</b><br>② <b>休む</b>（音を出さない時間をつくる）<br>③ 2〜3音だけでもOK',
        btns: [{ l: '▶ お手本フレーズ', s: '同じ形をくり返す', fn: () => playPhrase(LICK) }] },
      { h: '伴奏に合わせて弾こう', t: '「鍵盤」タブでキーを F、種類を「ブルース音階」にして「伴奏」を押します。光っている鍵盤だけタップすればOK。',
        tip: '間違えても大丈夫。ジャズでは「外した音」も味になります。' },
      { quiz: { q: 'アドリブを上手に聴かせるコツは？', opts: ['できるだけ多くの音を弾く', 'くり返しと休みを使う', 'とにかく速く弾く'], a: 1,
        ex: 'プロも「休み」と「くり返し」をたくさん使っています。' } },
    ],
  },
  {
    id: 'standard', title: 'スタンダード曲を聴く', sub: '「枯葉」で全部がつながる',
    cards: [
      { h: '名曲「枯葉」', t: 'ジャズの定番曲。じつは<b>ii-V-I の連続</b>でできています。',
        btns: [{ l: '▶ 枯葉の進行', s: 'Cm7 F7 B♭maj7 …', fn: 'grid' }], grid: AUTUMN },
      { h: '演奏の流れを知ると聴きやすい', t: '① <b>テーマ</b>（みんなで曲のメロディ）<br>② <b>ソロ</b>（順番にアドリブ）<br>③ <b>テーマ</b>（もう一度メロディで終わる）',
        tip: '拍手はソロが終わるたびにしてOK。ライブで迷わなくなります。' },
      { h: 'まず聴きたい名盤', albums: [
        ['Somethin\' Else', 'キャノンボール・アダレイ（1958）／「枯葉」の決定版'],
        ['Kind of Blue', 'マイルス・デイヴィス（1959）／ジャズで最も売れたアルバム'],
        ['Portrait in Jazz', 'ビル・エヴァンス（1960）／ピアノトリオの「枯葉」'],
        ['We Get Requests', 'オスカー・ピーターソン（1964）／明るく聴きやすい'],
      ] },
      { quiz: { q: 'ジャズ演奏のよくある流れは？', opts: ['ソロ → ソロ → ソロ', 'テーマ → ソロ → テーマ', 'テーマだけ'], a: 1,
        ex: '「テーマ → ソロ → テーマ」。これが分かると、どの曲も追いやすくなります。' } },
    ],
  },
];

/* ========== 保存（この端末のブラウザ内） ========== */
const KEY = 'jazzsteps.v1';
let store = { done: [], best: 0 };
try { store = Object.assign(store, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} };

/* ========== 画面：共通 ========== */
const $ = s => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

function updateTop() {
  $('#topStat').textContent = `達成 ${store.done.length}/${LESSONS.length}・最高 ${store.best}連続`;
}
function showView(name) {
  stopAll();
  document.querySelectorAll('.view').forEach(v => { v.hidden = v.id !== 'view-' + name; });
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === name));
  if (name === 'ear' && !ear.cur) newEar();
}
$('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) showView(b.dataset.view); });

/* ========== 学ぶ ========== */
function nextLessonIndex() { const i = LESSONS.findIndex(l => !store.done.includes(l.id)); return i < 0 ? 0 : i; }
function renderRoadmap() {
  const ul = $('#roadmap'); ul.innerHTML = '';
  const nx = nextLessonIndex();
  LESSONS.forEach((l, i) => {
    const done = store.done.includes(l.id);
    const li = el('li');
    const b = el('button', done ? 'done' : (i === nx ? 'next' : ''),
      `<span class="no">${done ? '✓' : i + 1}</span><span class="t">${l.title}<span class="s">${l.sub}</span></span><span class="mark">${done ? '復習' : (i === nx ? 'つぎ' : '')}</span>`);
    b.addEventListener('click', () => openLesson(i));
    li.appendChild(b); ul.appendChild(li);
  });
  $('#nextLessonBtn').textContent = store.done.length === LESSONS.length ? '全部クリア！ 復習する' : `▶ レッスン${nx + 1}を始める`;
  updateTop();
}
$('#nextLessonBtn').addEventListener('click', () => openLesson(nextLessonIndex()));

/* ========== レッスン画面 ========== */
let L = null; // { i, step, ok }
function openLesson(i) { stopAll(); L = { i, step: 0, ok: true }; $('#lesson').hidden = false; renderCard(); }
function closeLesson() { stopAll(); L = null; $('#lesson').hidden = true; renderRoadmap(); }
$('#lessonClose').addEventListener('click', closeLesson);
$('#lessonNext').addEventListener('click', () => {
  const les = LESSONS[L.i];
  if (L.step >= les.cards.length) { closeLesson(); return; }
  stopAll(); L.step++;
  if (L.step === les.cards.length && !store.done.includes(les.id)) { store.done.push(les.id); save(); }
  renderCard();
});

function renderCard() {
  const les = LESSONS[L.i], n = les.cards.length, card = $('#card');
  card.innerHTML = '';
  $('#lessonBar').style.width = (Math.min(L.step, n) / n * 100) + '%';
  $('#lessonCount').textContent = `${Math.min(L.step + 1, n)}/${n}`;
  const next = $('#lessonNext');
  next.disabled = false;

  if (L.step >= n) { // 完了画面
    card.append(el('div', 'done-mark', '♪'), el('h2', '', 'レッスン完了！'),
      el('p', '', `「${les.title}」をクリアしました。<br>このあと<b>耳トレ</b>を数問やると、ぐっと定着します。`));
    next.textContent = 'ロードマップへ';
    return;
  }
  const c = les.cards[L.step];
  next.textContent = L.step === n - 1 ? '完了する' : '次へ';
  card.append(el('p', 'lead', `LESSON ${L.i + 1}`));

  if (c.quiz) {
    const q = c.quiz;
    card.append(el('h2', '', q.q));
    if (q.play) {
      const pb = el('button', 'btn play', '▶ 聴く'); pb.addEventListener('click', q.play);
      card.append(pb);
    }
    const box = el('div', 'quiz-opts'), fb = el('p', 'feedback');
    q.opts.forEach((o, k) => {
      const b = el('button', '', o);
      b.addEventListener('click', () => {
        if (k === q.a) {
          box.querySelectorAll('button').forEach(x => x.disabled = true);
          b.classList.add('right'); fb.innerHTML = `<span class="ok">正解！</span> ${q.ex}`; next.disabled = false;
        } else { b.classList.add('wrong'); fb.innerHTML = '<span class="ng">おしい！</span> もう一度えらんでみよう。'; }
      });
      box.append(b);
    });
    card.append(box, fb);
    next.disabled = true;
    return;
  }

  card.append(el('h2', '', c.h));
  if (c.t) card.append(el('p', '', c.t));
  let grid;
  if (c.grid) {
    grid = el('div', 'grid');
    c.grid.forEach(s => grid.append(el('div', '', s)));
  }
  if (c.btns) {
    const box = el('div', 'btns');
    c.btns.forEach(bd => {
      const b = el('button', 'btn play', `<span>${bd.l}</span><small>${bd.s}</small>`);
      if (bd.fn === 'grid') {
        b.dataset.toggle = '1';
        b.addEventListener('click', () => {
          if (b.classList.contains('on')) { stopAll(); grid.querySelectorAll('div').forEach(d => d.classList.remove('now')); return; }
          playProg(c.grid, { bpm: 132, onStep: idx => {
            grid.querySelectorAll('div').forEach((d, k) => d.classList.toggle('now', k === idx));
            if (idx < 0) b.classList.remove('on');
          } });
          b.classList.add('on');
        });
      } else b.addEventListener('click', bd.fn);
      box.append(b);
    });
    if (grid) card.append(grid);
    card.append(box);
  } else if (grid) card.append(grid);
  if (c.albums) {
    const ul = el('ul', 'albums');
    c.albums.forEach(([a, d]) => ul.append(el('li', '', `<b>${a}</b><span>${d}</span>`)));
    card.append(ul);
  }
  if (c.tip) card.append(el('p', 'tip', c.tip));
}

/* ========== 耳トレ ========== */
const ear = { level: 1, cur: null, n: 0, ok: 0, streak: 0, answered: false, missed: false };
const earTypes = () => ear.level === 1 ? ['maj7', 'm7', '7'] : ['maj7', 'm7', '7', 'm7♭5'];
function newEar() {
  const types = earTypes();
  ear.cur = { root: Math.floor(Math.random() * 12), type: types[Math.floor(Math.random() * types.length)] };
  ear.answered = false; ear.missed = false;
  $('#earFb').innerHTML = '';
  $('#earNext').hidden = true;
  const box = $('#earChoices'); box.innerHTML = '';
  types.forEach(t => {
    const b = el('button', 'choice', `<b>${t}</b><small>${TYPES[t].feel}</small>`);
    b.addEventListener('click', () => answerEar(t, b));
    box.append(b);
  });
  $('#earScore').textContent = `${ear.ok} / ${ear.n}`;
}
const earSym = () => sym(ear.cur.root, ear.cur.type);
function answerEar(t, b) {
  if (ear.answered) { playChordSym(sym(ear.cur.root, t)); return; } // 答えた後は聴きくらべ用
  if (t === ear.cur.type) {
    ear.answered = true;
    if (!ear.missed) { ear.n++; ear.ok++; ear.streak++; }
    if (ear.streak > store.best) { store.best = ear.streak; save(); updateTop(); }
    b.classList.add('right');
    const msg = ear.missed ? '' : `（${ear.streak}連続）`;
    $('#earFb').innerHTML = `<span class="ok">正解！</span> ${earSym()}${msg}<br><small>ほかのボタンを押すと聴きくらべできます</small>`;
    $('#earNext').hidden = false;
  } else {
    if (!ear.missed) { ear.missed = true; ear.n++; } // 最初のまちがいで1問カウント
    b.classList.add('wrong'); ear.streak = 0;
    $('#earFb').innerHTML = `<span class="ng">ちがうかも。</span> もう一度聴いてみよう。`;
    playChordSym(earSym());
  }
  $('#earScore').textContent = `${ear.ok} / ${ear.n}`;
}
$('#earPlay').addEventListener('click', () => playChordSym(earSym()));
$('#earArp').addEventListener('click', () => playChordSym(earSym(), { arp: true }));
$('#earNext').addEventListener('click', () => { newEar(); playChordSym(earSym()); });
$('#earLevel').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  ear.level = +b.dataset.level;
  document.querySelectorAll('#earLevel button').forEach(x => x.classList.toggle('on', x === b));
  newEar();
});

/* ========== 鍵盤 ========== */
const KB_LOW = 60, KB_HIGH = 83;
const keyState = { root: 0, type: 'maj7' };
const KEY_TYPES = ['maj7', 'm7', '7', 'm7♭5', 'ブルース音階'];
function buildKeyboard() {
  const kb = $('#kb'); kb.innerHTML = '';
  let w = 0;
  for (let m = KB_LOW; m <= KB_HIGH; m++) {
    const pc = m % 12, black = [1, 3, 6, 8, 10].includes(pc);
    const k = el('button', black ? 'b' : 'w');
    k.dataset.m = m; k.setAttribute('aria-label', NOTE[pc]);
    k.append(el('span', 'lbl', ''));
    if (black) k.style.left = `calc(100% / 14 * ${w} - 100% / 14 * .31)`; else w++;
    k.addEventListener('pointerdown', e => {
      e.preventDefault(); tone(m, ac().currentTime + 0.01, 0.9, 0.18);
      k.classList.add('press'); setTimeout(() => k.classList.remove('press'), 150);
    });
    kb.append(k);
  }
}
function renderKeys() {
  const { root, type } = keyState;
  const scale = type === 'ブルース音階';
  const pcs = (scale ? BLUES_SCALE : TYPES[type].iv).map(i => (root + i) % 12);
  const chordMidis = scale ? [] : TYPES[type].iv.map(i => KB_LOW + root + i);
  document.querySelectorAll('#kb button').forEach(k => {
    const m = +k.dataset.m, pc = m % 12;
    const on = scale ? pcs.includes(pc) : chordMidis.includes(m);
    k.classList.toggle('lit', on);
    k.classList.toggle('root', on && pc === root);
    k.querySelector('.lbl').textContent = on ? NOTE[pc] : (pc === 0 ? 'C' : '');
  });
  document.querySelectorAll('#keyType button').forEach(b => b.classList.toggle('on', b.dataset.t === type));
  const ja = pcs.map(p => NOTE_JA[p]).join('・');
  $('#keysInfo').innerHTML = scale
    ? `<b>${NOTE[root]} ブルース・スケール</b><br>${ja}`
    : `<b>${sym(root, type)}</b> ${TYPES[type].feel}<br>${ja}`;
}
(function initKeys() {
  const sel = $('#keyRoot');
  NOTE.forEach((n, i) => { const o = el('option', '', `${n}（${NOTE_JA[i]}）`); o.value = i; sel.append(o); });
  sel.addEventListener('change', () => { keyState.root = +sel.value; stopAll(); renderKeys(); });
  const chips = $('#keyType');
  KEY_TYPES.forEach(t => {
    const b = el('button', '', t); b.dataset.t = t;
    b.addEventListener('click', () => { keyState.type = t; renderKeys(); $('#keysPlay').click(); });
    chips.append(b);
  });
  buildKeyboard(); renderKeys();
  $('#keysPlay').addEventListener('click', () => {
    const { root, type } = keyState;
    if (type === 'ブルース音階') playScale(KB_LOW + root, BLUES_SCALE);
    else playNotes(TYPES[type].iv.map(i => KB_LOW + root + i));
  });
  $('#keys251').addEventListener('click', () => {
    const r = keyState.root;
    playProg([sym(r + 2, 'm7'), sym(r + 7, '7'), sym(r, 'maj7'), sym(r, 'maj7')]);
  });
  const blues = $('#keysBlues'); blues.dataset.toggle = '1';
  blues.addEventListener('click', () => {
    if (blues.classList.contains('on')) { stopAll(); return; }
    const r = keyState.root;
    const prog = [[0, '7'], [5, '7'], [0, '7'], [0, '7'], [5, '7'], [5, '7'], [0, '7'], [9, '7'], [2, 'm7'], [7, '7'], [0, '7'], [7, '7']]
      .map(([d, t]) => sym(r + d, t));
    playProg(prog, { bpm: 120, loop: true });
    blues.classList.add('on');
  });
})();

renderRoadmap();
})();
