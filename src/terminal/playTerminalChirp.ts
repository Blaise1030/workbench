let sharedContext: AudioContext | null = null;

function getContext(): AudioContext {
  if (!sharedContext) {
    sharedContext = new AudioContext();
  }
  return sharedContext;
}

/** Short attention beep (~150 ms). Safe to call repeatedly; resumes AudioContext if suspended. */
export function playTerminalChirp(): void {
  const ctx = getContext();
  void ctx.resume();

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = 880;
  osc.connect(gain);
  gain.connect(ctx.destination);

  const t0 = ctx.currentTime;
  const t1 = t0 + 0.15;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t1);

  osc.start(t0);
  osc.stop(t1);
}
