/**
 * All of the game's sound, synthesised in the browser.
 *
 * Nothing here loads a file. Every effect is built from oscillators and filtered
 * noise, which keeps the game a single self-contained bundle — no audio assets to
 * ship, nothing to license, and it still works on the LAN with no internet.
 *
 * Browsers refuse to start audio until the user has interacted with the page, so
 * the context is created lazily and `unlockAudio` is called from the first key
 * press or tap. Calling any play function before that is harmless — it just does
 * nothing rather than throwing.
 */

type Ctx = AudioContext;

let ctx: Ctx | null = null;
let master: GainNode | null = null;
let muted = false;

const MUTE_KEY = "eggbeach.muted";

try {
  muted = localStorage.getItem(MUTE_KEY) === "1";
} catch {
  // Private browsing or storage disabled — default to sound on.
}

function ensure(): Ctx | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    // Deliberately low. This is a child's game that will be played at whatever
    // volume the tablet is already on, and clipping on a small speaker is nasty.
    master.gain.value = 0.32;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Call from a real user gesture, before anything is expected to be audible. */
export function unlockAudio() {
  ensure();
}

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // Not being able to remember the setting is not worth failing over.
  }
  return muted;
}

interface ToneOpts {
  freq: number;
  /** Slide to this frequency over the note, for boings and swoops. */
  freqTo?: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  /** Seconds from now to start, for building little melodies. */
  at?: number;
  attack?: number;
}

function tone({ freq, freqTo, dur, type = "triangle", gain = 0.3, at = 0, attack = 0.008 }: ToneOpts) {
  const c = ensure();
  if (!c || !master || muted) return;

  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const env = c.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqTo !== undefined) {
    // Exponential ramps sound like pitch to the ear; linear ones do not.
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), t0 + dur);
  }

  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(env).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

interface NoiseOpts {
  dur: number;
  gain?: number;
  at?: number;
  freq?: number;
  q?: number;
  type?: BiquadFilterType;
}

/** Filtered noise: thuds, rustles, and the breathy part of a cluck. */
function noise({ dur, gain = 0.2, at = 0, freq = 1200, q = 1, type = "bandpass" }: NoiseOpts) {
  const c = ensure();
  if (!c || !master || muted) return;

  const t0 = c.currentTime + at;
  const frames = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

  const src = c.createBufferSource();
  src.buffer = buf;

  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;

  const env = c.createGain();
  env.gain.setValueAtTime(gain, t0);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  src.connect(filter).connect(env).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

// --- The sounds themselves ------------------------------------------------

export function playJump() {
  tone({ freq: 300, freqTo: 620, dur: 0.13, type: "triangle", gain: 0.26 });
}

/** Higher and brighter, so the second jump is audibly a different thing. */
export function playDoubleJump() {
  tone({ freq: 460, freqTo: 900, dur: 0.12, type: "square", gain: 0.16 });
  tone({ freq: 920, freqTo: 1400, dur: 0.10, type: "sine", gain: 0.10, at: 0.02 });
}

export function playLand() {
  noise({ dur: 0.09, gain: 0.14, freq: 260, q: 0.8, type: "lowpass" });
}

/** A little rising three-note figure — the reward sound. */
export function playEggCollect() {
  const notes = [784, 1047, 1319];
  notes.forEach((f, i) => tone({ freq: f, dur: 0.11, type: "sine", gain: 0.24, at: i * 0.055 }));
  tone({ freq: 2093, dur: 0.16, type: "sine", gain: 0.07, at: 0.11 });
}

export function playHurt() {
  tone({ freq: 380, freqTo: 90, dur: 0.34, type: "sawtooth", gain: 0.20 });
  noise({ dur: 0.16, gain: 0.14, freq: 700, q: 0.7, type: "lowpass" });
}

/** Dawn, complaining. Two clipped squawks with a breathy tail. */
export function playCluck() {
  tone({ freq: 900, freqTo: 500, dur: 0.07, type: "square", gain: 0.10 });
  tone({ freq: 780, freqTo: 420, dur: 0.06, type: "square", gain: 0.09, at: 0.10 });
  noise({ dur: 0.05, gain: 0.05, freq: 2100, q: 2, at: 0.10 });
}

export function playLevelComplete() {
  const notes = [523, 659, 784, 1047];
  notes.forEach((f, i) => tone({ freq: f, dur: 0.20, type: "triangle", gain: 0.24, at: i * 0.11 }));
}

export function playGameOver() {
  const notes = [392, 349, 294, 220];
  notes.forEach((f, i) => tone({ freq: f, dur: 0.30, type: "triangle", gain: 0.22, at: i * 0.16 }));
}

export function playWin() {
  const notes = [523, 659, 784, 1047, 1319];
  notes.forEach((f, i) => tone({ freq: f, dur: 0.26, type: "triangle", gain: 0.24, at: i * 0.10 }));
  tone({ freq: 1568, dur: 0.5, type: "sine", gain: 0.12, at: 0.52 });
}

/** Paper being handled, for the intro. */
export function playPaperRustle() {
  noise({ dur: 0.42, gain: 0.10, freq: 3200, q: 0.6, type: "highpass" });
  noise({ dur: 0.30, gain: 0.06, freq: 1800, q: 0.5, type: "highpass", at: 0.22 });
}

/** The drawing coming alive — a soft shimmer up. */
export function playMagic() {
  [659, 880, 1175, 1568].forEach((f, i) =>
    tone({ freq: f, dur: 0.55, type: "sine", gain: 0.11, at: i * 0.09, attack: 0.05 }),
  );
}
