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
function makeNoise(c) {
  if (noiseBuf) return;
  noiseBuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
function hat(t, vol = 0.12, len = 0.08) {
  const c = ac();
  makeNoise(c);
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
  if (typeof keepAwake === 'function') keepAwake(false);
  document.querySelectorAll('.btn.on[data-toggle]').forEach(b => b.classList.remove('on'));
}
function at(t, fn) { timers.push(setTimeout(fn, Math.max(0, (t - ac().currentTime) * 1000))); }

const guideOf = (ch, v) => [v[1], v[3]]; // 3度と7度
function playChordSym(s, { arp = false, withBass = true, guide = false } = {}) {
  stopAll();
  const c = ac(), t = c.currentTime + 0.05, ch = parseChord(s);
  let v = voicing(ch); if (guide) v = guideOf(ch, v);
  if (withBass) bass(bassOf(ch.root), t, 1.6);
  v.forEach((n, i) => tone(n, t + (arp ? i * 0.35 : 0), arp ? 1.6 - i * 0.2 : 1.8));
}
function playNotes(notes, { arp = false } = {}) {
  stopAll();
  const t = ac().currentTime + 0.05;
  notes.forEach((n, i) => tone(n, t + (arp ? i * 0.3 : 0), 1.6));
}

/* 進行を伴奏つきで演奏（ウォーキングベース＋コンピング＋シンバル）
 * items: "Dm7"（4拍） or "Dm7:2"（2拍）
 * guide: ガイドトーン（3度・7度）だけで和音を弾く
 * extra(t0, spb): 伴奏に重ねるメロディなどを予約する */
function playProg(items, { bpm = 120, loop = false, onStep, guide = false, extra, noBass = false } = {}) {
  stopAll();
  const c = ac(), spb = 60 / bpm;
  const list = items.map(x => { const [s, b] = x.split(':'); return { s, b: +(b || 4), ch: parseChord(s) }; });
  let i = 0, t = c.currentTime + 0.1;
  if (extra) extra(t, spb);
  const tick = () => {
    while (t < c.currentTime + 0.6) {
      if (i >= list.length) {
        if (!loop) { at(t, () => onStep && onStep(-1)); clearInterval(id); return; }
        i = 0;
      }
      const it = list[i], next = list[(i + 1) % list.length];
      const r = bassOf(it.ch.root), nr = bassOf(next.ch.root);
      const walk = it.b >= 4 ? [r, r + it.ch.iv[1], r + it.ch.iv[2], nr - 1] : [r, nr + 1];
      if (!noBass) walk.forEach((n, k) => bass(n, t + k * spb, spb * 0.95));
      let v = voicing(it.ch);
      if (guide) {
        v = guideOf(it.ch, v);
        v.forEach(n => tone(n, t, it.b * spb * 0.95, 0.12)); // のばして「つながり」を聴かせる
      } else {
        v.forEach(n => tone(n, t, spb * 0.8, 0.09));
        if (it.b >= 4) v.forEach(n => tone(n, t + spb * 1.67, spb * 0.4, 0.07)); // 2拍目の裏（スウィング）
      }
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

/* 手拍子 */
function clap(t) {
  const c = ac();
  makeNoise(c);
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.8;
  s.connect(f); f.connect(g); g.connect(master);
  g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  s.start(t); track(s, t + 0.15);
}

/* 8分音符のメロディ（リズムの聴きくらべ用）
 * swing: 跳ねる / ratio: 跳ね具合（0.5=まっすぐ, 0.67=3連符）
 * accent: 'up'=裏拍を強く 'down'=表拍を強く / delay: 拍に対して何秒うしろに置くか
 * claps: 手拍子を打つ拍（0始まり） */
function playEighths({ swing = true, bpm = 120, ratio = 0.67, accent = null, delay = 0, claps = null } = {}) {
  stopAll();
  const c = ac(), spb = 60 / bpm;
  const base = [60, 62, 64, 65, 67, 69, 67, 64, 65, 64, 62, 60, 62, 59, 60, 60];
  const reps = bpm > 180 ? 2 : 1;
  const mel = Array.from({ length: reps }, () => base).flat();
  const r = swing ? ratio : 0.5;
  const t0 = c.currentTime + 0.15;
  mel.forEach((n, i) => {
    const beat = Math.floor(i / 2), up = i % 2 === 1;
    const t = t0 + (beat + (up ? r : 0)) * spb + delay;
    let vol = up ? (swing ? 0.1 : 0.12) : 0.13;
    if (accent === 'up') vol = up ? 0.17 : 0.07;
    if (accent === 'down') vol = up ? 0.06 : 0.17;
    const len = (up ? 1 - r : r) * spb;
    tone(n + 12, t, len * 0.9 + 0.04, vol);
  });
  const beats = mel.length / 2;
  for (let b = 0; b < beats; b++) {
    hat(t0 + b * spb, b % 2 ? 0.12 : 0.04);
    bass(bassOf(0) + (b % 4 === 2 ? 7 : 0), t0 + b * spb, spb * 0.9);
    if (claps && claps.includes(b % 4)) clap(t0 + b * spb);
  }
}
/* フレーズ: [midi or null, 拍数] */
function schedPhrase(ph, t, spb, shift = 0) {
  ph.forEach(([n, b]) => { if (n) tone(n + shift, t, b * spb * 0.9 + 0.05, 0.16); t += b * spb; });
}
function playPhrase(ph, bpm = 120, shift = 0) {
  stopAll();
  schedPhrase(ph, ac().currentTime + 0.1, 60 / bpm, shift);
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
const CALL = [[72, .67], [75, .33], [77, 1], [75, .67], [72, .33], [70, 1.67], [68, .33], [65, 3]];
const THREE = [[65, .67], [68, .33], [70, 1], [null, 1], [70, .67], [68, .33], [65, 2], [null, 2],
               [68, .67], [70, .33], [68, .67], [65, .33], [70, 2]];

const PILLARS = [
  { name: 'リズム', note: '一番大事な土台' },
  { name: '文法', note: '和音と進行のルール' },
  { name: '語彙', note: '名演のフレーズをまねる' },
  { name: '実践', note: '制限して弾く・会話する' },
];

const LESSONS = [
  {
    id: 'swing', p: 0, title: 'スウィングのノリ', sub: 'ジャズらしさの正体',
    cards: [
      { h: 'ジャズらしさの正体は「リズム」', t: 'ジャズの一番の特徴は<b>スウィング</b>という跳ねるリズム。同じメロディでも、リズムを変えるだけでジャズになります。' },
      { h: '聴きくらべてみよう', t: '同じメロディを2通りで弾きます。',
        btns: [{ l: '▶ まっすぐ', s: 'タタ タタ', fn: () => playEighths({ swing: false }) },
               { l: '▶ スウィング', s: 'タッカ タッカ', fn: () => playEighths() }],
        tip: 'スウィングは「長・短」のくり返し。土台は<b>3連符</b>（タ・タ・タの1つ目と3つ目）です。' },
      { h: '跳ね具合はテンポで変わる', t: 'ゆっくりの曲は深く跳ね、速い曲ほど跳ねが浅く、まっすぐに近づきます。楽譜どおりに一定ではありません。',
        btns: [{ l: '▶ ゆっくり', s: '深く跳ねる', fn: () => playEighths({ bpm: 96, ratio: 0.7 }) },
               { l: '▶ 速い', s: '浅く跳ねる', fn: () => playEighths({ bpm: 220, ratio: 0.58 }) }] },
      { h: '楽器で：1音だけでスウィング', practice: { prog: ['Cmaj7'], mode: 'root', bpm: 96 },
        task: { all: '光っている音<b>1つだけ</b>で「タッカ タッカ」と弾こう。音が1つでも、リズムでジャズになります。',
                line: '光っている音<b>1つだけ</b>で「ドゥ・ダ ドゥ・ダ」と吹こう（歌おう）。音が1つでも、リズムでジャズになります。' } },
      { quiz: { q: 'スウィングの跳ね方の土台になるのは？', opts: ['16分音符', '3連符', '2分音符'], a: 1,
        ex: '3連符の「1つ目と3つ目」が基本。そこからテンポに合わせて加減します。' } },
    ],
  },
  {
    id: 'backbeat', p: 0, title: '2・4拍と後ノリ', sub: '重心と裏拍のアクセント',
    cards: [
      { h: '重心は2拍目と4拍目', t: 'クラシックや童謡は1・3拍が強い。ジャズは<b>2・4拍</b>に重心があります。手拍子で比べてみましょう。',
        btns: [{ l: '▶ 1・3で手拍子', s: 'ジャズっぽくない', fn: () => playEighths({ claps: [0, 2] }) },
               { l: '▶ 2・4で手拍子', s: 'ジャズのノリ', fn: () => playEighths({ claps: [1, 3] }) }] },
      { h: '裏拍にアクセント', t: '「タッカ」の<b>「カ」（裏拍）を少し強く</b>弾くと、ぐっとジャズらしい訛りになります。',
        btns: [{ l: '▶ 表を強く', s: 'のっぺり', fn: () => playEighths({ accent: 'down' }) },
               { l: '▶ 裏を強く', s: 'ジャズの訛り', fn: () => playEighths({ accent: 'up' }) }] },
      { h: '後ノリ（レイドバック）', t: 'シンバルの拍に対して、メロディを<b>ほんの少しうしろ</b>に置くと、ゆったりした大人のノリになります。',
        btns: [{ l: '▶ 前ノリ', s: '急いだ感じ', fn: () => playEighths({ delay: -0.03 }) },
               { l: '▶ 後ノリ', s: 'ゆったり', fn: () => playEighths({ delay: 0.06 }) }],
        tip: '違いはごくわずか。何度か聴きくらべて「落ち着く方」を探してみてください。' },
      { h: '楽器で：2・4拍で足ぶみ', practice: { prog: ['Cmaj7'], mode: 'root', bpm: 96 },
        task: { all: '足で<b>2拍目と4拍目</b>をふみながら、光っている音を「タッカ」で。<b>「カ」を少し強く</b>弾くのがコツ。',
                line: '足で<b>2拍目と4拍目</b>をふみながら、光っている音を「ドゥ・<b>ダ</b>」と<b>裏を強く</b>吹こう。' } },
      { quiz: { q: 'ジャズで手拍子を打つのは何拍目？', opts: ['1拍目と3拍目', '2拍目と4拍目', '全部の拍'], a: 1,
        ex: '2と4で叩くと、一気にジャズのノリになります。' } },
    ],
  },
  {
    id: 'seventh', p: 1, title: 'セブンス和音', sub: '4つの音でできたおしゃれな響き',
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
    id: 'twofive', p: 1, title: 'ii-V-I', sub: 'ジャズの決まり文句',
    cards: [
      { h: 'ジャズの「決まり文句」', t: '<span class="chord">Dm7 → G7 → Cmaj7</span>。この流れを<b>ツー・ファイブ・ワン</b>と呼びます。スタンダード曲のあちこちに出てくる、ジャズの基本の形です。',
        btns: [{ l: '▶ ii-V-I を聴く', s: 'Dm7 → G7 → Cmaj7', fn: () => playProg(['Dm7', 'G7', 'Cmaj7', 'Cmaj7']) }] },
      { h: '物語で覚える', t: '<span class="chord">Dm7</span> 出発 → <span class="chord">G7</span> 盛り上がり（緊張）→ <span class="chord">Cmaj7</span> 到着（ほっとする）。',
        tip: '「7は次へ進みたい」が、ここで活きてきます。' },
      { h: 'どのキーでも同じ形', t: '高さが変わっても「m7 → 7 → maj7」の並びは同じ。形で覚えると楽になります。',
        btns: [{ l: '▶ キーF', s: 'Gm7 → C7 → Fmaj7', fn: () => playProg(['Gm7', 'C7', 'Fmaj7', 'Fmaj7']) },
               { l: '▶ キーB♭', s: 'Cm7 → F7 → B♭maj7', fn: () => playProg(['Cm7', 'F7', 'B♭maj7', 'B♭maj7']) }],
        tip: '上達した人は<b>12のキーすべて</b>で反射的に弾けるまでくり返します。「練習」タブでキーを変えて、ii-V-I に合わせて弾けます。' },
      { h: '楽器で：根音でついていく', practice: { prog: ['Dm7', 'G7', 'Cmaj7', 'Cmaj7'], mode: 'root', bpm: 92 },
        task: { all: 'コードが変わるたびに、光っている<b>根音</b>を弾こう。のばすだけでOK。表示は伴奏に合わせて自動で切り替わります。',
                bass: 'コードが変わるたびに<b>根音</b>を1拍ずつ4回。伴奏のベースは抜いてあるので、あなたが土台です。' } },
      { quiz: { q: 'ii-V-I の「V」（真ん中）に来る和音の種類は？', opts: ['maj7', 'm7', '7'], a: 2,
        ex: 'm7 → <b>7</b> → maj7。真ん中が緊張役の 7 です。' } },
    ],
  },
  {
    id: 'guide', p: 1, title: 'ガイドトーン', sub: '3度と7度で進行が聴こえる',
    cards: [
      { h: '和音の「顔」は2つの音で決まる', t: '4つの音のうち、明るい・暗いなどの性格を決めるのは<b>3番目の音（3度）</b>と<b>7番目の音（7度）</b>。この2音を<b>ガイドトーン</b>と呼びます。',
        btns: [{ l: '▶ Cmaj7 全部の音', s: 'ド・ミ・ソ・シ', fn: () => playChordSym('Cmaj7') },
               { l: '▶ 3度と7度だけ', s: 'ミ・シ', fn: () => playChordSym('Cmaj7', { guide: true }) }],
        tip: '2音だけでも、ちゃんと Cmaj7 の響きに聴こえます。' },
      { h: 'ii-V-I をガイドトーンだけで', t: '<span class="chord">Dm7</span>（ファ・ド）→ <span class="chord">G7</span>（ファ・シ）→ <span class="chord">Cmaj7</span>（ミ・シ）。毎回<b>1音が半音動くだけ</b>。このなめらかなつながりが「進行が聴こえる」正体です。',
        btns: [{ l: '▶ 全部の音で', s: '', fn: () => playProg(['Dm7', 'G7', 'Cmaj7', 'Cmaj7']) },
               { l: '▶ ガイドトーンだけ', s: 'ド→シ、ファ→ミ', fn: () => playProg(['Dm7', 'G7', 'Cmaj7', 'Cmaj7'], { guide: true }) }] },
      { h: 'アドリブの「道しるべ」', t: '和音が変わる瞬間に<b>ガイドトーンに着地</b>するだけで、伴奏がなくてもコード進行が聴こえるメロディになります。',
        tip: '「練習」タブで「3度・7度」を選ぶと、どの曲でもガイドトーンが光ります。' },
      { h: '楽器で：ガイドトーンをつなぐ', practice: { prog: ['Dm7', 'G7', 'Cmaj7', 'Cmaj7'], mode: 'guide', bpm: 84 },
        task: { keys: '左手で<b>根音</b>、右手で光った<b>2音（3度と7度）</b>。これがジャズピアノの基本の形です。',
                guitar: '光った<b>3か所（根音・3度・7度）</b>を同時に押さえよう。ジャズギターの基本「シェル・ボイシング」です。',
                bass: '<b>根音 → 3度 → 7度</b>の順に1拍ずつ弾こう。コードの形が指に入ります。',
                line: '光った<b>2音</b>のどちらかを、コードが変わるたびに<b>長くのばして</b>つなごう。半音で動くところを味わって。' } },
      { quiz: { q: 'ガイドトーンは何度と何度？', opts: ['1度と5度', '3度と7度', '9度と13度'], a: 1,
        ex: '3度で明るい／暗い、7度で落ち着き／緊張が決まります。' } },
    ],
  },
  {
    id: 'blues', p: 1, title: 'ブルース12小節', sub: 'セッションで一番よく演奏される形',
    cards: [
      { h: 'ジャズの土台はブルース', t: 'ブルースは<b>12小節で1周</b>する決まった型。ジャムセッションで最初に演奏されることが多い形です。' },
      { h: '12小節を目で追おう', t: '今どこを弾いているか光ります。', grid: F_BLUES,
        btns: [{ l: '▶ Fのブルース', s: '12小節', fn: 'grid' }] },
      { h: '全部「7」なのがブルース', t: 'ふつうは緊張役の <span class="chord">7</span> を、ブルースではずっと使います。このザラッとした響きがブルースらしさです。',
        tip: '9〜10小節目に ii-V（Gm7 → C7）が隠れています。' },
      { h: '楽器で：12小節を1周', practice: { prog: F_BLUES, mode: 'root', bpm: 100 },
        task: { all: '光っている<b>根音</b>で12小節を1周。迷子にならずに最初に戻れたら合格です。',
                bass: '<b>根音を1拍ずつ4回</b>で12小節を1周。ウォーキング・ベースの第一歩です。' } },
      { quiz: { q: 'ブルースは何小節で1周？', opts: ['8小節', '12小節', '32小節'], a: 1, ex: '12小節。数えながら聴くと迷子になりません。' } },
    ],
  },
  {
    id: 'copy', p: 2, title: '耳コピ入門', sub: 'フレーズを「言葉」として覚える',
    cards: [
      { h: 'ジャズは「言葉」と同じ', t: '子どもがまねから言葉を覚えるように、ジャズも<b>名演のフレーズ（リック）を耳でまねる</b>ことで身につきます。これを<b>耳コピ</b>（トランスクリプション）と言います。' },
      { h: '耳コピの3ステップ', t: '① 何度も聴いて<b>歌えるようにする</b><br>② 楽器で同じ音を探す<br>③ 原曲と<b>いっしょに</b>弾く（音だけでなく、ノリや強弱もまねる）',
        tip: '最初は楽譜に書かなくてOK。耳と指を直接つなぐほうが早く身につきます。' },
      { h: 'フレーズを分解する', t: 'このお手本は、Fのブルースの上で<b>ド・ミ♭・ファ</b>を往復しています。Fから数えると<b>5度・♭7度・1度</b>の音です。',
        btns: [{ l: '▶ お手本フレーズ', s: 'キーF', fn: () => playPhrase(LICK) }] },
      { h: '他のキーに移して自分の言葉に', t: '形はそのままで、高さだけ変えると別のキーでも使えます。こうしてまねたフレーズが「自分の語彙」になります。',
        btns: [{ l: '▶ キーFで', s: '', fn: () => playPhrase(LICK) },
               { l: '▶ キーB♭で', s: '同じ形を5つ上へ', fn: () => playPhrase(LICK, 120, 5) }] },
      { h: '「まねっこ」で練習', t: '<b>耳トレ</b>タブの<b>まねっこ</b>では、短いフレーズを聴いて<b>あなたの楽器</b>（または画面の鍵盤）でまねる練習ができます。毎日数問やってみましょう。' },
      { h: '楽器で：お手本をまねる', practice: { prog: ['F7', 'F7'], mode: 'scale', scale: { root: 5, iv: BLUES_SCALE, name: 'ブルース・スケール' }, bpm: 100 },
        task: { all: 'さっきのお手本を思い出して、光っている音の中から<b>同じ音を探して</b>弾いてみよう。まずは最初の3音だけでOK。' } },
      { quiz: { q: '耳コピで最初にやることは？', opts: ['楽譜に書き起こす', '何度も聴いて歌えるようにする', 'とにかく速く弾く'], a: 1,
        ex: '歌えるフレーズは弾けるフレーズ。まずは耳と口で覚えます。' } },
    ],
  },
  {
    id: 'adlib', p: 3, title: '制限してアドリブ', sub: '少ない音で歌うように弾く',
    cards: [
      { h: 'アドリブ＝その場で作るメロディ', t: '当てずっぽうではなく、和音のルールの上で作ります。最初は<b>ブルース・スケール</b>の6音だけで十分です。',
        btns: [{ l: '▶ Fブルース・スケール', s: 'F A♭ B♭ B C E♭', fn: () => playScale(65, BLUES_SCALE) }] },
      { h: '制限するとうまくなる', t: '使える音を絞ると、リズムと「間」に集中できます。<br>① まず<b>3音だけ</b>（ファ・ラ♭・シ♭）<br>② 次に<b>和音の音だけ</b><br>③ 最後にスケール全部',
        btns: [{ l: '▶ 3音だけの例', s: 'ファ・ラ♭・シ♭', fn: () => playPhrase(THREE) }],
        tip: 'くり返す・休む。3音でもこれだけで立派なアドリブです。' },
      { h: 'コール＆レスポンス（会話）', t: 'お手本が2小節弾いたら、次の2小節は<b>あなたの番</b>。まねしても、答えを返してもOK。',
        grid: ['お手本', '〃', 'あなた', '〃', 'お手本', '〃', 'あなた', '〃'],
        prog: ['F7', 'B♭7', 'F7', 'F7', 'B♭7', 'B♭7', 'F7', 'F7'],
        extra: (t, spb) => { schedPhrase(CALL, t, spb); schedPhrase(CALL, t + 16 * spb, spb); },
        btns: [{ l: '▶ 会話してみる', s: '8小節', fn: 'grid' }],
        tip: '弾くときは、次のカードの光っている音を使えば外れません。' },
      { h: '楽器で：3音アドリブ', practice: { prog: F_BLUES, mode: 'scale', scale: { root: 5, iv: BLUES_SCALE, name: 'ブルース・スケール' }, bpm: 100 },
        task: { all: '光っている音から<b>3つだけ</b>選んで、<b>2小節弾いて2小節休む</b>。休みのあいだは伴奏を聴こう。' } },
      { quiz: { q: 'アドリブを上手に聴かせるコツは？', opts: ['できるだけ多くの音を弾く', 'くり返しと休みを使う', 'とにかく速く弾く'], a: 1,
        ex: '休符は会話の「間」。相手の音を聴く時間にもなります。' } },
    ],
  },
  {
    id: 'standard', p: 3, title: 'スタンダード曲', sub: '「枯葉」で全部がつながる',
    cards: [
      { h: '名曲「枯葉」', t: 'ジャズの定番曲。じつは<b>ii-V-I の連続</b>でできています。',
        btns: [{ l: '▶ 枯葉の進行', s: 'Cm7 F7 B♭maj7 …', fn: 'grid' }], grid: AUTUMN },
      { h: '1曲を身につける手順', t: '① <b>ベースライン</b>（各和音の一番下の音）を弾く<br>② <b>ガイドトーン</b>だけでつなぐ<br>③ 名演のソロを<b>少しだけ耳コピ</b>する',
        btns: [{ l: '▶ 枯葉をガイドトーンで', s: '②の見本', fn: () => playProg(AUTUMN, { bpm: 132, guide: true }) }],
        tip: '最初の1曲は「枯葉」のほか「C Jam Blues」「Fly Me to the Moon」もおすすめ。' },
      { h: '演奏の流れを知ると聴きやすい', t: '① <b>テーマ</b>（みんなで曲のメロディ）<br>② <b>ソロ</b>（順番にアドリブ）<br>③ <b>テーマ</b>（もう一度メロディで終わる）',
        tip: 'ソロのあいだ、ピアノやドラムがソロに「返事」をしているのにも耳をすませてみてください。' },
      { h: 'まず聴きたい名盤', albums: [
        ['Somethin\' Else', 'キャノンボール・アダレイ（1958）／「枯葉」の決定版'],
        ['Kind of Blue', 'マイルス・デイヴィス（1959）／ジャズで最も売れたアルバム'],
        ['Portrait in Jazz', 'ビル・エヴァンス（1960）／ピアノトリオの「枯葉」'],
        ['We Get Requests', 'オスカー・ピーターソン（1964）／明るく聴きやすい'],
      ] },
      { h: '楽器で：枯葉をガイドトーンで', practice: { prog: AUTUMN, mode: 'guide', bpm: 92 },
        task: { all: '1曲を身につける手順の②。光っている音でコードをつないで「枯葉」を1周しよう。むずかしければ「−」でテンポを下げて。',
                bass: '手順の①。まず<b>根音</b>で1周、慣れたら<b>3度・7度</b>も入れてみよう。' } },
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
  $('#topStat').textContent = `今日の10分　｜　達成 ${store.done.length}/${LESSONS.length}・耳トレ最高 ${store.best}連続`;
}
function showView(name) {
  stopAll();
  document.querySelectorAll('.view').forEach(v => { v.hidden = v.id !== 'view-' + name; });
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === name));
  if (name === 'ear' && !ear.cur) setEarMode('chord');
}
$('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) showView(b.dataset.view); });

/* ========== 学ぶ ========== */
function nextLessonIndex() { const i = LESSONS.findIndex(l => !store.done.includes(l.id)); return i < 0 ? 0 : i; }
function renderRoadmap() {
  const box = $('#roadmap'); box.innerHTML = '';
  const nx = nextLessonIndex();
  PILLARS.forEach((p, pi) => {
    const items = LESSONS.map((l, i) => ({ l, i })).filter(x => x.l.p === pi);
    const doneN = items.filter(x => store.done.includes(x.l.id)).length;
    const sec = el('li', 'pillar');
    sec.append(el('div', 'p-head', `<span class="p-no">柱${pi + 1}</span><b>${p.name}</b><span class="p-note">${p.note}</span><span class="p-prog">${doneN}/${items.length}</span>`));
    const row = el('div', 'p-lessons');
    items.forEach(({ l, i }) => {
      const done = store.done.includes(l.id);
      const b = el('button', 'lchip' + (done ? ' done' : '') + (i === nx && !done ? ' next' : ''),
        `<span class="no">${done ? '✓' : i + 1}</span>${l.title}`);
      b.addEventListener('click', () => openLesson(i));
      row.append(b);
    });
    sec.append(row); box.append(sec);
  });
  $('#nextLessonBtn').textContent = store.done.length === LESSONS.length
    ? '全部クリア！ 復習する' : `▶ 次：${nx + 1}. ${LESSONS[nx].title}`;
  updateTop();
}
$('#nextLessonBtn').addEventListener('click', () => openLesson(nextLessonIndex()));

/* ========== レッスン画面 ========== */
let L = null; // { i, step }
function openLesson(i) { stopAll(); L = { i, step: 0 }; $('#lesson').hidden = false; renderCard(); }
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
  card.append(el('p', 'lead', `LESSON ${L.i + 1}・柱${les.p + 1} ${PILLARS[les.p].name}`));

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

  if (c.practice) {
    card.lastChild.textContent = `LESSON ${L.i + 1}・楽器で弾こう（${I().name}）`;
    card.append(el('h2', '', c.h));
    const task = c.task[store.inst] || c.task[I().kind] || c.task.all;
    card.append(el('p', 'task', task));
    const box = el('div'); card.append(box);
    makePlayer(box, { ...c.practice, compact: true });
    return;
  }
  card.append(el('h2', '', c.h));
  if (c.t) card.append(el('p', '', c.t));
  let grid;
  if (c.grid) {
    grid = el('div', 'grid');
    c.grid.forEach(s => grid.append(el('div', '', s)));
    card.append(grid);
  }
  if (c.btns) {
    const box = el('div', 'btns');
    c.btns.forEach(bd => {
      const b = el('button', 'btn play', `<span>${bd.l}</span><small>${bd.s}</small>`);
      if (bd.fn === 'grid') {
        b.dataset.toggle = '1';
        b.addEventListener('click', () => {
          if (b.classList.contains('on')) { stopAll(); grid.querySelectorAll('div').forEach(d => d.classList.remove('now')); return; }
          playProg(c.prog || c.grid, { bpm: 132, extra: c.extra, onStep: idx => {
            grid.querySelectorAll('div').forEach((d, k) => d.classList.toggle('now', k === idx));
            if (idx < 0) b.classList.remove('on');
          } });
          b.classList.add('on');
        });
      } else b.addEventListener('click', bd.fn);
      box.append(b);
    });
    card.append(box);
  }
  if (c.albums) {
    const ul = el('ul', 'albums');
    c.albums.forEach(([a, d]) => ul.append(el('li', '', `<b>${a}</b><span>${d}</span>`)));
    card.append(ul);
  }
  if (c.tip) card.append(el('p', 'tip', c.tip));
}

/* ========== 共通：鍵盤をつくる ========== */
function buildKb(box, low, high, onPress) {
  box.innerHTML = '';
  let whites = 0;
  for (let m = low; m <= high; m++) if (![1, 3, 6, 8, 10].includes(m % 12)) whites++;
  box.style.setProperty('--wn', whites);
  let w = 0;
  for (let m = low; m <= high; m++) {
    const pc = m % 12, black = [1, 3, 6, 8, 10].includes(pc);
    const k = el('button', black ? 'b' : 'w');
    k.dataset.m = m; k.setAttribute('aria-label', NOTE[pc]);
    k.append(el('span', 'lbl', ''));
    if (black) k.style.left = `calc(100% / ${whites} * ${w} - 100% / ${whites} * .31)`; else w++;
    k.addEventListener('pointerdown', e => {
      e.preventDefault(); tone(m, ac().currentTime + 0.01, 0.9, 0.18);
      k.classList.add('press'); setTimeout(() => k.classList.remove('press'), 150);
      onPress && onPress(m, k);
    });
    box.append(k);
  }
}

/* ========== 耳トレ ========== */
const ear = { mode: 'chord', level: 1, cur: null, n: 0, ok: 0, streak: 0, answered: false, missed: false };
const copy = { target: [], pos: 0, n: 0, ok: 0, missed: false, done: false, input: 'screen', shown: false };
const earTypes = () => ear.level === 1 ? ['maj7', 'm7', '7'] : ['maj7', 'm7', '7', 'm7♭5'];
const COPY_POOL = [60, 63, 65, 67, 70, 72]; // Cブルース系の音だけ
function setScore() {
  $('#earScore').textContent = ear.mode === 'chord' ? `${ear.ok} / ${ear.n}` : `${copy.ok} / ${copy.n}`;
}
function bumpStreak(ok) {
  ear.streak = ok ? ear.streak + 1 : 0;
  if (ear.streak > store.best) { store.best = ear.streak; save(); updateTop(); }
}

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
  setScore();
}
const earSym = () => sym(ear.cur.root, ear.cur.type);
function answerEar(t, b) {
  if (ear.answered) { playChordSym(sym(ear.cur.root, t)); return; } // 答えた後は聴きくらべ用
  if (t === ear.cur.type) {
    ear.answered = true;
    if (!ear.missed) { ear.n++; ear.ok++; bumpStreak(true); }
    b.classList.add('right');
    const msg = ear.missed ? '' : `（${ear.streak}連続）`;
    $('#earFb').innerHTML = `<span class="ok">正解！</span> ${earSym()}${msg}<br><small>ほかのボタンを押すと聴きくらべできます</small>`;
    $('#earNext').hidden = false;
  } else {
    if (!ear.missed) { ear.missed = true; ear.n++; bumpStreak(false); }
    b.classList.add('wrong');
    $('#earFb').innerHTML = `<span class="ng">ちがうかも。</span> もう一度聴いてみよう。`;
    playChordSym(earSym());
  }
  setScore();
}

/* まねっこ：短いフレーズを聴いて鍵盤でまねる */
function newCopy() {
  const len = ear.level === 1 ? 3 : 4;
  let idx = Math.floor(Math.random() * 4);
  const tg = [COPY_POOL[idx]];
  while (tg.length < len) {
    const step = [-2, -1, 1, 2][Math.floor(Math.random() * 4)];
    const ni = Math.min(COPY_POOL.length - 1, Math.max(0, idx + step));
    if (ni === idx) continue;
    idx = ni; tg.push(COPY_POOL[idx]);
  }
  Object.assign(copy, { target: tg, pos: 0, missed: false, done: false, shown: false });
  $('#copyNext').hidden = true;
  $('#copyFb').innerHTML = copy.input === 'inst'
    ? `最初の音は<b>${iJa(tg[0] % 12)}</b>。楽器でまねしたら「答えを見る」。`
    : `最初の音は<b>${NOTE_JA[tg[0] % 12]}</b>（光っている鍵盤）。`;
  renderCopy(); setScore();
}
function renderCopy() {
  const dots = $('#copyDots'); dots.innerHTML = '';
  const inst = copy.input === 'inst';
  copy.target.forEach((m, i) => {
    const show = inst ? copy.shown : i < copy.pos;
    dots.append(el('span', show ? 'got' : '', show ? (inst ? iJa(m % 12) : NOTE_JA[m % 12]) : '?'));
  });
  $('#copyKb').hidden = inst;
  $('#copyQ').textContent = inst ? `聴いたフレーズを、${I().name}でまねしよう` : '聴いたフレーズを、鍵盤でまねしよう';
  $('#copySelf').hidden = !inst;
  $('#copyReveal').hidden = !inst || copy.shown;
  $('#copyGrade').hidden = !inst || !copy.shown || copy.done;
  document.querySelectorAll('#copyKb button').forEach(k => {
    const m = +k.dataset.m;
    const usable = COPY_POOL.includes(m);
    k.classList.toggle('lit', usable);
    k.classList.toggle('root', m === copy.target[0] && copy.pos === 0);
    k.classList.toggle('dim', !usable);
    k.querySelector('.lbl').textContent = usable ? NOTE_JA[m % 12] : '';
  });
}
function playCopy() {
  stopAll();
  const t = ac().currentTime + 0.1;
  copy.target.forEach((m, i) => tone(m, t + i * 0.45, 0.4, 0.17));
}
function pressCopy(m) {
  if (copy.done || !copy.target.length) return;
  if (m === copy.target[copy.pos]) {
    copy.pos++;
    if (copy.pos === copy.target.length) {
      copy.done = true;
      if (!copy.missed) { copy.n++; copy.ok++; bumpStreak(true); }
      $('#copyFb').innerHTML = `<span class="ok">完璧！</span> ${copy.missed ? '' : `（${ear.streak}連続）`}`;
      $('#copyNext').hidden = false;
    }
  } else {
    if (!copy.missed) { copy.missed = true; copy.n++; bumpStreak(false); }
    copy.pos = 0;
    $('#copyFb').innerHTML = `<span class="ng">ちがう音。</span> もう一度お手本を聴いて、最初から。`;
  }
  renderCopy(); setScore();
}

const copyDefaultInput = () => (I().kind === 'keys' ? 'screen' : 'inst');
function setCopyInput(v) {
  copy.input = v;
  document.querySelectorAll('#copyInput button').forEach(b => b.classList.toggle('on', b.dataset.in === v));
  $('#copyInput button[data-in=inst]').textContent = `${I().name}で`;
  newCopy();
}
function gradeCopy(ok) {
  copy.done = true; copy.n++;
  if (ok) copy.ok++;
  bumpStreak(ok);
  $('#copyFb').innerHTML = ok ? `<span class="ok">ナイス！</span>（${ear.streak}連続）` : '<span class="ng">次はできる！</span> 何度も聴くのが耳コピの近道です。';
  $('#copyNext').hidden = false;
  renderCopy(); setScore();
}
function setEarMode(mode) {
  stopAll();
  ear.mode = mode;
  document.querySelectorAll('#earMode button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
  $('#earChord').hidden = mode !== 'chord';
  $('#earCopy').hidden = mode !== 'copy';
  const [a, b] = document.querySelectorAll('#earLevel button');
  a.textContent = mode === 'chord' ? '3種類' : '3音';
  b.textContent = mode === 'chord' ? '4種類' : '4音';
  if (mode === 'chord') newEar(); else setCopyInput(copyDefaultInput());
}
$('#earMode').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setEarMode(b.dataset.mode); });
$('#earPlay').addEventListener('click', () => playChordSym(earSym()));
$('#earArp').addEventListener('click', () => playChordSym(earSym(), { arp: true }));
$('#earNext').addEventListener('click', () => { newEar(); playChordSym(earSym()); });
$('#copyPlay').addEventListener('click', playCopy);
$('#copyNext').addEventListener('click', () => { newCopy(); playCopy(); });
$('#earLevel').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  ear.level = +b.dataset.level;
  document.querySelectorAll('#earLevel button').forEach(x => x.classList.toggle('on', x === b));
  if (ear.mode === 'chord') newEar(); else newCopy();
});
buildKb($('#copyKb'), 60, 72, pressCopy);
$('#copyInput').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setCopyInput(b.dataset.in); });
$('#copyReveal').addEventListener('click', () => { copy.shown = true; renderCopy(); playCopy(); });
$('#copyYes').addEventListener('click', () => gradeCopy(true));
$('#copyNo').addEventListener('click', () => gradeCopy(false));

/* ========== 楽器 ========== */
const INSTR = {
  piano:   { name: 'ピアノ', kind: 'keys', trans: 0 },
  guitar:  { name: 'ギター', kind: 'fret', trans: 0, strings: [64, 59, 55, 50, 45, 40] },
  bass:    { name: 'ベース', kind: 'fret', trans: 0, strings: [43, 38, 33, 28] },
  alto:    { name: 'アルトサックス', kind: 'line', trans: 9, tag: 'E♭管' },
  tenor:   { name: 'テナーサックス', kind: 'line', trans: 2, tag: 'B♭管' },
  trumpet: { name: 'トランペット', kind: 'line', trans: 2, tag: 'B♭管' },
  other:   { name: '歌・その他', kind: 'line', trans: 0, tag: '' },
};
const I = () => INSTR[store.inst] || INSTR.piano;
const iJa = pc => NOTE_JA[(((pc + I().trans) % 12) + 12) % 12];      // その楽器の譜面での読み
const iEn = pc => NOTE[(((pc + I().trans) % 12) + 12) % 12];
const iSym = s => { const ch = parseChord(s); return sym(ch.root + I().trans, ch.type); };
const isTrans = () => I().trans !== 0;

function openInstSheet() { $('#instSheet').hidden = false; }
(function initInst() {
  const box = $('#instList');
  Object.entries(INSTR).forEach(([k, v]) => {
    const b = el('button', 'inst-opt', `<b>${v.name}</b>${v.tag ? `<small>${v.tag}</small>` : ''}`);
    b.dataset.k = k;
    b.addEventListener('click', () => {
      store.inst = k; save();
      $('#instSheet').hidden = true;
      onInstChange();
    });
    box.append(b);
  });
  $('#instBtn').addEventListener('click', openInstSheet);
})();
function onInstChange() {
  $('#instBtn').textContent = I().name;
  document.querySelectorAll('.inst-opt').forEach(b => b.classList.toggle('on', b.dataset.k === store.inst));
  stopAll();
  practiceTab && practiceTab.refresh();
  if (L) renderCard();
  if (ear.mode === 'copy') setCopyInput(copyDefaultInput());
}

/* 画面を消さない（対応ブラウザのみ） */
let wake = null;
async function keepAwake(on) {
  try {
    if (on && !wake && navigator.wakeLock) {
      wake = await navigator.wakeLock.request('screen');
      wake.addEventListener('release', () => { wake = null; });
    } else if (!on && wake) { await wake.release(); wake = null; }
  } catch (e) { wake = null; }
}

/* ========== 「どこを弾くか」を楽器ごとに描く ========== */
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MODE_LABEL = { root: '根音', guide: '3度・7度', chord: '和音', scale: 'スケール' };

/* その瞬間に弾く音（ピッチクラス）と役割 */
const SCALE_DEG = { [MAJOR.join()]: [1, 2, 3, 4, 5, 6, 7], [BLUES_SCALE.join()]: [1, 3, 4, 4, 5, 7] };
function targetPcs(ch, mode, scale) {
  const r = ch.root, iv = ch.iv;
  const cdeg = k => (k === 3 && iv[3] === 9 ? 6 : [1, 3, 5, 7][k]);
  if (mode === 'root') return [{ pc: r, role: 'root', deg: 1, base: r }];
  if (mode === 'guide') return [{ pc: r, role: 'root', opt: true, deg: 1, base: r }, { pc: (r + iv[1]) % 12, role: 'g', deg: 3, base: r }, { pc: (r + iv[3]) % 12, role: 'g', deg: cdeg(3), base: r }];
  if (mode === 'chord') return iv.map((i, k) => ({ pc: (r + i) % 12, role: k ? 'c' : 'root', deg: cdeg(k), base: r }));
  const degs = SCALE_DEG[scale.iv.join()];
  return scale.iv.map((i, k) => ({ pc: (scale.root + i) % 12, role: k ? 's' : 'root', deg: degs[k], base: scale.root }));
}
/* 根音の名前から数えて、3度なら3つ目のアルファベット…と正しく書く（例：E7の3度は A♭ ではなく G#） */
const LET = 'CDEFGAB', LET_PC = [0, 2, 4, 5, 7, 9, 11], LET_JA = ['ド', 'レ', 'ミ', 'ファ', 'ソ', 'ラ', 'シ'];
function nm(x, trans = I().trans) {
  const pc = (((x.pc + trans) % 12) + 12) % 12;
  const rootName = NOTE[(((x.base + trans) % 12) + 12) % 12];
  const li = (LET.indexOf(rootName[0]) + x.deg - 1) % 7;
  let d = (((pc - LET_PC[li]) % 12) + 12) % 12; if (d > 6) d -= 12;
  if (Math.abs(d) > 1) return { en: NOTE[pc], ja: NOTE_JA[pc] };
  const acc = d === 1 ? '#' : d === -1 ? '♭' : '';
  return { en: LET[li] + acc, ja: LET_JA[li] + acc };
}
/* 鍵盤・指板のラベル用：その瞬間の音名表（実音） */
const nameMap = t => new Map(t.map(x => [x.pc, nm(x, 0).ja]));

/* ギターのシェル・ボイシング（根音・3度・7度）。前のコードに近い場所を選ぶ */
function shellFor(ch, prev) {
  const fit = (open, base, pc) => { let d = (((pc - (open + base)) % 12) + 12) % 12; if (d > 6) d -= 12; let f = base + d; if (f < 0) f += 12; return f; };
  const third = (ch.root + ch.iv[1]) % 12, seventh = (ch.root + ch.iv[3]) % 12;
  const opts = [];
  for (const add of [0, 12]) {
    const f6 = (((ch.root - 4) % 12) + 12) % 12 + add;            // 6弦ルート
    if (f6 <= 12) opts.push({ f: f6, notes: [[5, f6, 'root'], [3, fit(50, f6, seventh), 'g'], [2, fit(55, f6, third), 'g']] });
    const f5 = (((ch.root - 9) % 12) + 12) % 12 + add;            // 5弦ルート
    if (f5 <= 12) opts.push({ f: f5, notes: [[4, f5, 'root'], [3, fit(50, f5, third), 'g'], [2, fit(55, f5, seventh), 'g']] });
  }
  opts.sort((a, b) => Math.abs(a.f - prev) - Math.abs(b.f - prev));
  return opts[0];
}

function drawKeys(box, ch, mode, scale) {
  if (!box.querySelector('.kb')) { box.innerHTML = ''; const kb = el('div', 'kb'); box.append(kb); buildKb(kb, 48, 71); }
  const t = targetPcs(ch, mode, scale), names = nameMap(t);
  const lit = new Map();
  if (mode === 'scale') t.forEach(x => { lit.set(48 + x.pc, x.role); lit.set(60 + x.pc, x.role); });
  else {
    lit.set(48 + ch.root, 'root');                                     // 左手：根音
    t.filter(x => x.role !== 'root').forEach(x => lit.set(60 + x.pc, x.role)); // 右手
    if (mode === 'root') lit.set(60 + ch.root, 'root');
  }
  box.querySelectorAll('.kb button').forEach(k => {
    const m = +k.dataset.m, role = lit.get(m);
    k.classList.toggle('lit', !!role);
    k.classList.toggle('root', role === 'root');
    k.classList.toggle('gt', role === 'g');
    k.querySelector('.lbl').textContent = role ? (names.get(m % 12) || NOTE_JA[m % 12]) : '';
  });
}

function drawFret(box, ch, mode, scale, shell) {
  const ins = I(), S = ins.strings, low = S[S.length - 1];
  box.innerHTML = '';
  const board = el('div', 'fb');
  board.style.setProperty('--sn', S.length);
  // 表示する場所を決める
  const dots = new Map(); // "弦,フレット" -> role
  const names = nameMap(targetPcs(ch, mode, scale));
  if (ins === INSTR.guitar && mode === 'guide') {
    shell.notes.forEach(([s, f, role]) => dots.set(`${s},${f}`, role));
  } else {
    // 一番低い2本の弦のうち、根音が低いフレットにある方を基準に5フレット分を表示
    const anchorOf = pc => Math.min(...S.slice(-2).map(o => (((pc - o) % 12) + 12) % 12));
    const af = anchorOf(mode === 'scale' ? scale.root : ch.root);
    const lo = Math.max(0, af - 1), hi = lo + 4;
    const want = new Map(targetPcs(ch, mode, scale).map(x => [x.pc, x.role]));
    S.forEach((open, s) => {
      for (let f = lo; f <= hi; f++) {
        const pc = (open + f) % 12;
        if (want.has(pc)) dots.set(`${s},${f}`, want.get(pc));
      }
      if (mode === 'root') for (let f = 0; f <= 12; f++) if ((open + f) % 12 === ch.root && s >= S.length - 2) dots.set(`${s},${f}`, 'root');
    });
  }
  S.forEach((open, s) => {
    for (let f = 0; f <= 12; f++) {
      const cell = el('div', f === 0 ? 'fc nut' : 'fc');
      const role = dots.get(`${s},${f}`);
      if (role) {
        const m = open + f;
        const d = el('button', 'dot ' + role, names.get(m % 12) || NOTE_JA[m % 12]);
        d.addEventListener('pointerdown', e => { e.preventDefault(); tone(m + (ins === INSTR.bass ? 12 : 0), ac().currentTime + 0.01, 0.9, 0.18); });
        cell.append(d);
      }
      board.append(cell);
    }
  });
  const marks = el('div', 'fm');
  for (let f = 0; f <= 12; f++) marks.append(el('span', '', [3, 5, 7, 9, 12].includes(f) ? f : ''));
  box.append(board, marks);
  if (!box.closest('.compact')) box.append(el('p', 'trans-note', `上が1弦（細い弦）、下が${S.length}弦。数字はフレット`));
}

function drawLine(box, ch, mode, scale) {
  box.innerHTML = '';
  let t = targetPcs(ch, mode, scale);
  if (mode === 'guide') t = t.filter(x => x.role !== 'root');
  const row = el('div', 'notes-line');
  t.forEach(x => {
    const n = nm(x);
    const b = el('button', 'nt ' + x.role, `<b>${n.ja}</b><small>${n.en}</small>`);
    b.addEventListener('pointerdown', e => { e.preventDefault(); tone(60 + x.pc, ac().currentTime + 0.01, 0.9, 0.18); });
    row.append(b);
  });
  box.append(row);
  if (isTrans()) box.append(el('p', 'trans-note', `${I().name}の譜面の音名で表示しています（${I().tag}）`));
}

/* ========== 練習プレイヤー（伴奏に合わせて「今弾く場所」が切り替わる） ========== */
function makePlayer(root, { prog, mode = 'root', scale = null, bpm = 100, compact = false }) {
  const st = { prog, mode, scale, bpm, idx: 0, shells: [] };
  root.innerHTML = '';
  root.classList.add('player');
  const tl = el('div', 'tl'), dia = el('div', 'dia'), info = el('p', 'pinfo');
  const ctl = el('div', 'pctl');
  const play = el('button', 'btn play', '▶ 伴奏スタート'); play.dataset.toggle = '1';
  const minus = el('button', 'tbtn', '−'), plus = el('button', 'tbtn', '＋'), tv = el('span', 'tval', '');
  minus.setAttribute('aria-label', 'テンポを下げる'); plus.setAttribute('aria-label', 'テンポを上げる');
  ctl.append(play, el('div', 'tempo', ''), );
  ctl.lastChild.append(minus, tv, plus);
  root.append(...(compact ? [] : [tl]), dia, info, ctl);
  if (compact) root.classList.add('compact');

  const playing = () => play.classList.contains('on');
  function calcShells() {
    let prev = 5; st.shells = st.prog.map(s => { const sh = shellFor(parseChord(s), prev); prev = sh.f; return sh; });
  }
  function renderTl() {
    tl.innerHTML = '';
    tl.style.setProperty('--n', Math.min(st.prog.length, 6));
    st.prog.forEach((s, i) => {
      const c = el('button', i === st.idx ? 'now' : '', iSym(s));
      c.addEventListener('click', () => { if (!playing()) { st.idx = i; draw(); } });
      tl.append(c);
    });
  }
  function draw() {
    tl.querySelectorAll('button').forEach((c, i) => c.classList.toggle('now', i === st.idx));
    const s = st.prog[st.idx], ch = parseChord(s), kind = I().kind;
    if (kind === 'keys') drawKeys(dia, ch, st.mode, st.scale);
    else { dia.innerHTML = ''; if (kind === 'fret') drawFret(dia, ch, st.mode, st.scale, st.shells[st.idx]); else drawLine(dia, ch, st.mode, st.scale); }
    const t = targetPcs(ch, st.mode, st.scale);
    const concert = isTrans() ? `<small>（実音 ${s}）</small>` : '';
    const list = a => a.map(x => nm(x).ja).join('・');
    let what;
    if (st.mode === 'scale') what = `${iEn(st.scale.root)} ${st.scale.name}：${list(t)}`;
    else if (st.mode === 'guide') {
      const g = t.filter(x => x.role === 'g');
      what = kind === 'line' ? `3度・7度：${list(g)}` : `根音 ${nm(t[0]).ja} ＋ 3度・7度：${list(g)}`;
    } else what = `${MODE_LABEL[st.mode]}：${list(t)}`;
    const nx = st.prog.length > 1 && compact ? `<span class="nx">次 ${iSym(st.prog[(st.idx + 1) % st.prog.length])}</span>` : '';
    info.innerHTML = `<b>${iSym(s)}</b>${concert}${nx}<br>${what}`;
    tv.textContent = `♩=${st.bpm}`;
  }
  function start() {
    playProg(st.prog, { bpm: st.bpm, loop: true, noBass: store.inst === 'bass', onStep: i => { if (i >= 0) { st.idx = i; draw(); } } });
    play.classList.add('on'); play.textContent = '■ ストップ';
    keepAwake(true);
  }
  play.addEventListener('click', () => { if (playing()) stopAll(); else start(); });
  new MutationObserver(() => { if (!playing()) play.textContent = '▶ 伴奏スタート'; }).observe(play, { attributes: true, attributeFilter: ['class'] });
  const setBpm = d => { st.bpm = Math.max(60, Math.min(200, st.bpm + d)); tv.textContent = `♩=${st.bpm}`; if (playing()) start(); };
  minus.addEventListener('click', () => setBpm(-8));
  plus.addEventListener('click', () => setBpm(8));

  const api = {
    set(o) { Object.assign(st, o); if (o.prog) { st.idx = 0; calcShells(); renderTl(); } draw(); },
    refresh() { renderTl(); draw(); },
  };
  calcShells(); renderTl(); draw();
  return api;
}

/* ========== 練習タブ ========== */
const SONGS = {
  '251':   { name: 'ii-V-I', def: 0, make: r => [sym(r + 2, 'm7'), sym(r + 7, '7'), sym(r, 'maj7'), sym(r, 'maj7')], scale: r => ({ root: r, iv: MAJOR, name: 'メジャー・スケール' }) },
  'blues': { name: 'ブルース', def: 5, make: r => [[0, '7'], [5, '7'], [0, '7'], [0, '7'], [5, '7'], [5, '7'], [0, '7'], [9, '7'], [2, 'm7'], [7, '7'], [0, '7'], [7, '7']].map(([d, t]) => sym(r + d, t)), scale: r => ({ root: r, iv: BLUES_SCALE, name: 'ブルース・スケール' }) },
  'autumn': { name: '枯葉', def: 10, make: r => [[2, 'm7'], [7, '7'], [0, 'maj7'], [5, 'maj7'], [11, 'm7♭5'], [4, '7'], [9, 'm7'], [9, 'm7']].map(([d, t]) => sym(r + d, t)), scale: r => ({ root: r, iv: MAJOR, name: 'メジャー・スケール' }) },
};
const pState = { song: '251', key: 0, mode: 'guide' };
let practiceTab = null;
(function initPractice() {
  const songSel = $('#pSong'), keySel = $('#pKey'), modes = $('#pMode');
  Object.entries(SONGS).forEach(([k, v]) => { const o = el('option', '', v.name); o.value = k; songSel.append(o); });
  const fillKeys = () => {
    keySel.innerHTML = '';
    NOTE.forEach((n, i) => { const o = el('option', '', `${iEn(i)}（${iJa(i)}）`); o.value = i; keySel.append(o); });
    keySel.value = pState.key;
  };
  Object.entries(MODE_LABEL).forEach(([k, v]) => {
    const b = el('button', '', v); b.dataset.m = k;
    b.addEventListener('click', () => { pState.mode = k; apply(false); });
    modes.append(b);
  });
  const song = () => SONGS[pState.song];
  function apply(newProg) {
    stopAll();
    modes.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === pState.mode));
    const o = { mode: pState.mode, scale: song().scale(pState.key) };
    if (newProg) o.prog = song().make(pState.key);
    practiceTab.set(o);
    $('#pHint').textContent = store.inst === 'bass'
      ? '伴奏からベースを抜いています。ベースはあなたの担当です。'
      : '伴奏を流すと、今弾く場所が自動で切り替わります。';
  }
  songSel.addEventListener('change', () => { pState.song = songSel.value; pState.key = song().def; keySel.value = pState.key; apply(true); });
  keySel.addEventListener('change', () => { pState.key = +keySel.value; apply(true); });
  fillKeys();
  practiceTab = makePlayer($('#pPlayer'), { prog: song().make(pState.key), mode: pState.mode, scale: song().scale(pState.key), bpm: 100 });
  const baseRefresh = practiceTab.refresh;
  practiceTab.refresh = () => { fillKeys(); baseRefresh(); apply(false); };
  apply(false);
})();

if (store.inst) onInstChange(); else { onInstChange(); openInstSheet(); }
renderRoadmap();
})();
