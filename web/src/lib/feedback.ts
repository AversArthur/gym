// Звук и вибрация по окончании отдыха.
// AudioContext на iOS разблокируется только из жеста пользователя: unlockAudio() зовётся на тап ✓.

let ctx: AudioContext | null = null;

export function unlockAudio() {
  try {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    /* звук недоступен */
  }
}

export function beep() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [0, 0.22, 0.44].forEach((dt, i) => {
    const o = ctx!.createOscillator(),
      g = ctx!.createGain();
    o.type = 'sine';
    o.frequency.value = i === 2 ? 1320 : 880;
    g.gain.setValueAtTime(0.0001, t + dt);
    g.gain.exponentialRampToValueAtTime(0.35, t + dt + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.18);
    o.connect(g).connect(ctx!.destination);
    o.start(t + dt);
    o.stop(t + dt + 0.2);
  });
}

export function vibrate(pattern: number | number[] = [250, 120, 250]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}
