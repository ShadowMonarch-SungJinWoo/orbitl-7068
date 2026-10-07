/**
 * Focus-mode sound, synthesized in the browser.
 *
 * Everything here is generated with the Web Audio API rather than shipped as an
 * asset: a loopable ambient bed would be megabytes of audio for a feature most
 * users toggle off, and a synthesized bed loops seamlessly for as long as the
 * timer runs instead of restarting every 30 seconds.
 *
 * All entry points are best-effort — audio is a nicety, so a browser that blocks
 * or lacks AudioContext must never break the timer.
 */

type Ctx = AudioContext & { _orbitl?: true };

let ctx: Ctx | null = null;

function context(): Ctx | null {
  if (typeof window === "undefined") return null;
  try {
    const Impl: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Impl) return null;
    if (!ctx) ctx = new Impl() as Ctx;
    // Browsers start the context suspended until a user gesture; every call site
    // here is behind a click, so resuming is safe.
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Two-tone chime when an interval ends. Distinct enough to notice, short enough not to startle. */
export function playChime(kind: "focusEnd" | "breakEnd" = "focusEnd") {
  const c = context();
  if (!c) return;
  // Rising for "focus done, well earned"; falling for "break over, back to it".
  const notes = kind === "focusEnd" ? [660, 880, 1174] : [880, 660];
  notes.forEach((freq, i) => {
    const at = c.currentTime + i * 0.16;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.18, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
    osc.connect(gain).connect(c.destination);
    osc.start(at);
    osc.stop(at + 0.5);
  });
}

export type Ambient = "brown" | "rain" | "hum";

export const AMBIENTS: { id: Ambient; label: string }[] = [
  { id: "brown", label: "Brown noise" },
  { id: "rain", label: "Rain" },
  { id: "hum", label: "Deep hum" },
];

/** Six seconds of noise, looped — long enough that the ear can't hear the seam. */
function noiseBuffer(c: AudioContext, kind: Ambient): AudioBuffer {
  const seconds = 6;
  const buf = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    if (kind === "brown" || kind === "hum") {
      // Integrated white noise = brown noise: far gentler on the ear over an hour.
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else {
      // Rain keeps more high frequency so it reads as texture, not rumble.
      last = 0.6 * last + 0.4 * white;
      data[i] = last * 1.2;
    }
  }
  return buf;
}

export class AmbientPlayer {
  private src: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;

  start(kind: Ambient, volume: number) {
    const c = context();
    if (!c) return;
    this.stop();
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c, kind);
    src.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = kind === "rain" ? 6000 : kind === "hum" ? 320 : 1200;
    const gain = c.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(c.destination);
    src.start();
    // Fade in so switching sounds mid-session isn't a jolt.
    gain.gain.linearRampToValueAtTime(volume, c.currentTime + 0.8);
    this.src = src;
    this.gain = gain;
    this.filter = filter;
  }

  setVolume(volume: number) {
    const c = context();
    if (!c || !this.gain) return;
    this.gain.gain.linearRampToValueAtTime(volume, c.currentTime + 0.15);
  }

  stop() {
    const c = context();
    if (this.src && c && this.gain) {
      const src = this.src;
      const filter = this.filter;
      const gain = this.gain;
      gain.gain.linearRampToValueAtTime(0, c.currentTime + 0.3);
      setTimeout(() => {
        try {
          src.stop();
          // Tear the whole chain down, not just the source, so switching
          // ambient sounds repeatedly can't leave orphaned nodes behind.
          src.disconnect();
          filter?.disconnect();
          gain.disconnect();
        } catch {
          /* already stopped */
        }
      }, 400);
    }
    this.src = null;
    this.gain = null;
    this.filter = null;
  }
}

/** Ask once, on a click. Returns whether we may actually notify. */
export async function ensureNotifyPermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

export function notify(title: string, body: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon: "/favicon.svg" });
  } catch {
    /* some browsers require a service worker; the in-app toast still fires */
  }
}
