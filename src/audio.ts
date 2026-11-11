// Звук гри. Усе синтезується в браузері через Web Audio: жодних файлів і ліцензій.
// Музика генеративна: акорди й рідкі ноти складаються на ходу й залежать від фази та напруги.

export type Sfx = 'click' | 'up' | 'down' | 'card' | 'paper' | 'stamp' | 'wire' | 'alarm' | 'press' | 'shock' | 'victory' | 'defeat';
export type Mood = 'menu' | 'boom' | 'deficit';
export type Place = 'none' | 'office' | 'city';
type Volume = { music: number; sfx: number };

const KEY = 'ai-crisis-audio';
const volume: Volume = { music: .6, sfx: .7 };
try { Object.assign(volume, JSON.parse(localStorage.getItem(KEY) ?? '{}')); } catch { /* сховище недоступне — лишаємо типові значення */ }

let ctx: AudioContext | null = null;
let musicBus: GainNode, sfxBus: GainNode, airBus: GainNode, hall: GainNode, echo: GainNode;
let hiss: AudioBuffer;
let mood: Mood = 'menu', place: Place = 'none', tension = 0;
let nextBar = 0, bar = 0, nextAir = 0, nextTick = 0, last = 69;
let hum: { source: AudioBufferSourceNode; gain: GainNode } | null = null;

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const chance = (p: number) => Math.random() < p;
const between = (a: number, b: number) => a + Math.random() * (b - a);

// Настрої: темп, акорди (MIDI), яскравість фільтра, гама для рідких нот і як часто вони звучать.
const moods: Record<Mood, { bpm: number; chords: number[][]; cutoff: number; scale: number[]; notes: number; level: number }> = {
  menu: { bpm: 54, cutoff: 700, notes: .22, level: .03, scale: [62, 65, 67, 69, 72, 74, 77],
    chords: [[38, 50, 53, 57, 60, 64], [34, 46, 50, 53, 57], [31, 43, 46, 50, 57], [33, 45, 50, 52, 55]] },
  boom: { bpm: 76, cutoff: 1500, notes: .42, level: .028, scale: [62, 64, 66, 69, 71, 74, 76, 78],
    chords: [[38, 50, 54, 57, 61, 64], [35, 47, 50, 54, 57], [31, 43, 47, 50, 54], [33, 45, 47, 52, 57]] },
  deficit: { bpm: 58, cutoff: 520, notes: .2, level: .032, scale: [62, 64, 65, 69, 70, 74],
    chords: [[38, 50, 53, 57, 64], [34, 46, 50, 57, 64], [31, 43, 46, 50, 52], [33, 45, 49, 55, 58]] },
};

function boot(): AudioContext {
  if (ctx) return ctx;
  ctx = new AudioContext();
  const limiter = ctx.createDynamicsCompressor(); limiter.threshold.value = -14; limiter.ratio.value = 6; limiter.connect(ctx.destination);
  const bus = (level: number) => { const g = ctx!.createGain(); g.gain.value = level; g.connect(limiter); return g; };
  musicBus = bus(volume.music); airBus = bus(volume.music); sfxBus = bus(volume.sfx);

  hiss = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = hiss.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  // Зала: згортка із затухаючим шумом замість записаного імпульсу.
  const length = ctx.sampleRate * 3; const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const ch = impulse.getChannelData(c); for (let i = 0; i < length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3; }
  const reverb = ctx.createConvolver(); reverb.buffer = impulse;
  const wet = ctx.createGain(); wet.gain.value = .5; reverb.connect(wet); wet.connect(musicBus);
  hall = ctx.createGain(); hall.connect(reverb);
  // Луна для окремих нот.
  const delay = ctx.createDelay(1.5); delay.delayTime.value = .42;
  const feedback = ctx.createGain(); feedback.gain.value = .38;
  const damp = ctx.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 1800;
  echo = ctx.createGain(); echo.connect(delay); delay.connect(damp); damp.connect(feedback); feedback.connect(delay); damp.connect(musicBus); damp.connect(hall);

  setInterval(schedule, 200);
  document.addEventListener('visibilitychange', () => { if (document.hidden) void ctx!.suspend(); else void ctx!.resume(); });
  return ctx;
}

type Tone = { at?: number; dur?: number; gain?: number; type?: OscillatorType; to?: number; attack?: number; out?: AudioNode; wet?: number };
function tone(freq: number, { at = 0, dur = .2, gain = .2, type = 'sine', to, attack = .005, out = sfxBus, wet = 0 }: Tone = {}) {
  const c = ctx!; const t = c.currentTime + at;
  const osc = c.createOscillator(); osc.type = type; osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  const env = c.createGain(); env.gain.setValueAtTime(.0001, t); env.gain.linearRampToValueAtTime(gain, t + attack); env.gain.exponentialRampToValueAtTime(.0001, t + dur);
  osc.connect(env); env.connect(out);
  if (wet) { const send = c.createGain(); send.gain.value = wet; env.connect(send); send.connect(hall); }
  osc.start(t); osc.stop(t + dur + .05);
}
type Noise = { at?: number; dur?: number; gain?: number; filter?: BiquadFilterType; freq?: number; to?: number; q?: number; attack?: number; out?: AudioNode };
function noise({ at = 0, dur = .1, gain = .2, filter = 'bandpass', freq = 1000, to, q = 1, attack = .003, out = sfxBus }: Noise = {}) {
  const c = ctx!; const t = c.currentTime + at;
  const source = c.createBufferSource(); source.buffer = hiss; source.loop = true;
  const band = c.createBiquadFilter(); band.type = filter; band.Q.value = q; band.frequency.setValueAtTime(freq, t);
  if (to) band.frequency.exponentialRampToValueAtTime(to, t + dur);
  const env = c.createGain(); env.gain.setValueAtTime(.0001, t); env.gain.linearRampToValueAtTime(gain, t + attack); env.gain.exponentialRampToValueAtTime(.0001, t + dur);
  source.connect(band); band.connect(env); env.connect(out);
  source.start(t, Math.random()); source.stop(t + dur + .05);
}

// ── Ефекти ──────────────────────────────────────────────────────────────────
const effects: Record<Sfx, () => void> = {
  click: () => { noise({ filter: 'highpass', freq: 2600, dur: .03, gain: .1 }); tone(1500, { type: 'triangle', to: 800, dur: .035, gain: .04 }); },
  up: () => { tone(540, { type: 'triangle', to: 720, dur: .07, gain: .09 }); noise({ filter: 'highpass', freq: 3200, dur: .02, gain: .05 }); },
  down: () => { tone(460, { type: 'triangle', to: 330, dur: .07, gain: .09 }); noise({ filter: 'highpass', freq: 3200, dur: .02, gain: .05 }); },
  // Картку указу кладуть на стіл.
  card: () => { noise({ freq: 1400, to: 2800, dur: .14, gain: .1, attack: .03 }); tone(170, { to: 110, dur: .08, gain: .16, at: .1 }); },
  paper: () => { noise({ freq: 900, to: 3400, dur: .26, gain: .11, attack: .06, q: .7 }); noise({ freq: 2600, to: 1200, dur: .2, gain: .06, attack: .05, at: .16 }); },
  // Печатка: глухий удар, клацання механізму й відгук кімнати.
  stamp: () => { tone(120, { to: 36, dur: .32, gain: .8, wet: .25 }); noise({ filter: 'lowpass', freq: 900, dur: .1, gain: .5 }); noise({ freq: 3200, dur: .04, gain: .12, at: .07 }); },
  // Телетайп: кілька ударів літер і дзвоник у кінці рядка.
  wire: () => { for (let i = 0; i < 5; i++) noise({ filter: 'highpass', freq: between(2400, 3800), dur: .02, gain: .09, at: i * .055 + between(0, .012) }); tone(1320, { dur: .6, gain: .05, at: .3, wet: .4 }); tone(1980, { dur: .4, gain: .02, at: .3, wet: .4 }); },
  alarm: () => { for (let i = 0; i < 2; i++) { tone(466, { type: 'square', dur: .2, gain: .035, at: i * .44, wet: .3 }); tone(349, { type: 'square', dur: .2, gain: .035, at: i * .44 + .22, wet: .3 }); } },
  // Друкарський верстат: три проходи вала.
  press: () => { for (let i = 0; i < 3; i++) { noise({ freq: 700, to: 1900, dur: .12, gain: .12, attack: .02, at: i * .15 }); tone(90, { to: 60, dur: .06, gain: .2, at: i * .15 + .1 }); } effects.paper(); },
  shock: () => { tone(62, { to: 28, dur: 1.8, gain: .7, wet: .5 }); noise({ filter: 'lowpass', freq: 400, to: 80, dur: 1.2, gain: .35 }); for (const f of [110, 116.5, 155.6]) tone(f, { type: 'sawtooth', dur: 2.4, gain: .035, attack: .4, wet: .6 }); },
  victory: () => [62, 66, 69, 74, 78, 81].forEach((n, i) => { tone(hz(n), { type: 'triangle', dur: 1.1, gain: .1, at: i * .13, wet: .5 }); tone(hz(n + 12), { dur: .8, gain: .03, at: i * .13, wet: .5 }); }),
  defeat: () => { [69, 65, 62, 58].forEach((n, i) => tone(hz(n - 12), { type: 'triangle', dur: 1.6, gain: .12, at: i * .34, attack: .03, wet: .6 })); tone(hz(26), { dur: 3, gain: .4, at: 1.02, wet: .4 }); },
};

// ── Музика ──────────────────────────────────────────────────────────────────
function pad(notes: number[], at: number, dur: number, cutoff: number, level: number) {
  const c = ctx!;
  const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = .8;
  filter.frequency.setValueAtTime(cutoff * .55, at); filter.frequency.linearRampToValueAtTime(cutoff, at + dur * .55); filter.frequency.linearRampToValueAtTime(cutoff * .55, at + dur + 2);
  const env = c.createGain(); env.gain.setValueAtTime(0, at); env.gain.linearRampToValueAtTime(level, at + 1.6); env.gain.setValueAtTime(level, at + dur); env.gain.linearRampToValueAtTime(0, at + dur + 2.4);
  const send = c.createGain(); send.gain.value = .6;
  filter.connect(env); env.connect(musicBus); env.connect(send); send.connect(hall);
  notes.forEach((note, i) => {
    // Бас — чистий синус, решта — дві злегка розстроєні пилки: звук «дихає».
    for (const cents of i === 0 ? [0] : [-7, 7]) {
      const osc = c.createOscillator(); osc.type = i === 0 ? 'sine' : 'sawtooth'; osc.frequency.value = hz(note); osc.detune.value = cents;
      const g = c.createGain(); g.gain.value = i === 0 ? 3.2 : 1; osc.connect(g); g.connect(i === 0 ? env : filter);
      osc.start(at); osc.stop(at + dur + 2.5);
    }
  });
}
function pluck(note: number, at: number, level: number) {
  const offset = at - ctx!.currentTime;
  tone(hz(note), { type: 'triangle', at: offset, dur: 1.5, gain: level, attack: .012, out: musicBus });
  tone(hz(note), { at: offset, dur: 1.1, gain: level * .5, attack: .012, out: echo });
  tone(hz(note + 12), { at: offset, dur: .5, gain: level * .18, out: echo });
}
function playBar(at: number) {
  const m = moods[mood]; const beat = 60 / m.bpm; const length = beat * 4;
  pad(m.chords[bar % m.chords.length], at, length, m.cutoff * (1 - tension * .25), m.level);
  for (let step = 0; step < 8; step++) {
    if (mood !== 'boom' && step % 2) continue;
    if (!chance(m.notes)) continue;
    // Мелодія блукає сусідніми щаблями гами, а не стрибає.
    const index = Math.max(0, Math.min(m.scale.length - 1, m.scale.indexOf(last) + Math.round(between(-2.4, 2.4))));
    last = m.scale[index];
    pluck(last, at + step * beat / 2 + between(0, .02), .05);
  }
  const offset = at - ctx!.currentTime;
  // У бум — легкий рух, наче місто поспішає.
  if (mood === 'boom') for (let step = 0; step < 8; step++) noise({ filter: 'highpass', freq: 6000, dur: .04, gain: step % 2 ? .006 : .012, at: offset + step * beat / 2, out: musicBus });
  // У дефіцит — серцебиття, тим гучніше, чим гірші справи.
  if (mood === 'deficit' && tension > .15) for (const start of [0, beat * 2]) for (const [gap, gain] of [[0, 1], [.28, .6]]) tone(58, { to: 38, dur: .22, gain: tension * .32 * gain, at: offset + start + gap, out: musicBus });
  if (mood === 'deficit' && tension > .5 && bar % 2) tone(hz(75), { type: 'sawtooth', dur: length, gain: tension * .008, attack: length / 2, at: offset, out: hall });
  bar++;
}

// ── Атмосфера місця ─────────────────────────────────────────────────────────
function setHum(level: number, cutoff: number) {
  const c = ctx!;
  if (!hum) {
    const source = c.createBufferSource(); source.buffer = hiss; source.loop = true;
    const low = c.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = cutoff;
    const gain = c.createGain(); gain.gain.value = 0;
    source.connect(low); low.connect(gain); gain.connect(airBus); source.start();
    hum = { source, gain };
  }
  hum.gain.gain.setTargetAtTime(level, c.currentTime, .6);
}
function air(now: number) {
  setHum(place === 'city' ? .09 : place === 'office' ? .03 : 0, 320);
  if (place === 'office' && now >= nextTick) {
    // Настінний годинник у кабінеті.
    noise({ filter: 'bandpass', freq: nextTick % 2 < 1 ? 3400 : 2700, q: 6, dur: .03, gain: .03, out: airBus });
    nextTick = Math.max(nextTick, now) + 1;
  }
  if (place !== 'city' || now < nextAir) return;
  nextAir = now + between(2.5, 6) * (1 + tension);
  const roll = Math.random();
  // Сирена замість звичного руху, коли в країні біда.
  if (roll < tension * .5) { for (let i = 0; i < 4; i++) tone(i % 2 ? 620 : 880, { to: i % 2 ? 880 : 620, dur: .7, gain: .018, attack: .1, at: i * .7, out: airBus, wet: .5 }); }
  else if (roll < .8) noise({ freq: 380, to: between(700, 1100), dur: between(1.6, 2.8), gain: .05 * (1 - tension * .6), attack: .9, q: .8, out: airBus });
  else for (const [at, f] of [[0, 392], [.22, 392]]) tone(f, { type: 'square', dur: .16, gain: .008, at, out: airBus, wet: .6 });
}

function schedule() {
  if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  if (volume.music > 0) {
    if (nextBar < now) nextBar = now + .08;
    while (nextBar < now + .7) { playBar(nextBar); nextBar += 240 / moods[mood].bpm; }
    air(now);
  } else if (hum) hum.gain.gain.setTargetAtTime(0, now, .2);
}

export const audio = {
  /** Перший дотик гравця вмикає звук: браузери не дають почати раніше. */
  wake() { void boot().resume(); },
  play(name: Sfx) { if (!ctx || ctx.state !== 'running' || volume.sfx === 0) return; effects[name](); },
  /** Настрій музики, місце дії і напруга від 0 до 1. */
  scene(next: Mood, where: Place, stress = 0) {
    if (next !== mood) { bar = 0; last = moods[next].scale[3]; }
    mood = next; place = where; tension = Math.max(0, Math.min(1, stress));
  },
  volume: (kind: keyof Volume) => volume[kind],
  setVolume(kind: keyof Volume, value: number) {
    volume[kind] = value;
    try { localStorage.setItem(KEY, JSON.stringify(volume)); } catch { /* не збереглося — діє до перезавантаження */ }
    if (!ctx) return;
    const t = ctx.currentTime;
    if (kind === 'sfx') sfxBus.gain.setTargetAtTime(value, t, .05);
    else { musicBus.gain.setTargetAtTime(value, t, .05); airBus.gain.setTargetAtTime(value, t, .05); }
  },
};
