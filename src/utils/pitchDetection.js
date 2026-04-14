// Improved Autocorrelation for Pitch Detection
export function autoCorrelate(buf, sampleRate) {
  let SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1;

  // Trim silence from edges — lower threshold (0.1) retains more signal,
  // which helps lower-register notes (E, F, G) whose attacks are softer.
  let r1 = 0, r2 = SIZE - 1, thres = 0.1;
  for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; }
  for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
  buf = buf.slice(r1, r2);
  SIZE = buf.length;

  if (SIZE < 2) return -1;

  // Autocorrelation
  let c = new Array(SIZE).fill(0);
  for (let i = 0; i < SIZE; i++) {
    for (let j = 0; j < SIZE - i; j++) c[i] = c[i] + buf[j] * buf[j + i];
  }

  // Find first dip (where autocorrelation starts decreasing)
  let d = 0;
  while (d < SIZE - 1 && c[d] > c[d + 1]) d++;

  // Cap search at ~30 Hz to avoid sub-bass noise
  const maxLag = Math.min(SIZE - 1, Math.floor(sampleRate / 30));

  // Find global maximum in the valid lag range
  let globalMax = -1, globalMaxPos = -1;
  for (let i = d; i <= maxLag; i++) {
    if (c[i] > globalMax) { globalMax = c[i]; globalMaxPos = i; }
  }
  if (globalMaxPos < 1) return -1;

  // Among all local peaks >= 90% of global max, prefer the HIGHEST lag
  // (lowest frequency). Harmonics live at shorter lags; the fundamental
  // is the longest-period strong peak — this resolves the harmonic confusion.
  const threshold = 0.9 * globalMax;
  let bestPos = globalMaxPos;
  for (let i = d + 1; i < maxLag; i++) {
    if (c[i] >= threshold && c[i] >= c[i - 1] && c[i] >= c[i + 1]) {
      if (i > bestPos) bestPos = i;
    }
  }

  if (bestPos < 1 || bestPos >= SIZE - 1) {
    return sampleRate / bestPos;
  }

  // Parabolic interpolation for sub-sample accuracy
  let y1 = c[bestPos - 1];
  let y2 = c[bestPos];
  let y3 = c[bestPos + 1];
  let a = (y1 + y3 - 2 * y2) / 2;
  let b = (y3 - y1) / 2;
  if (a) {
    let shift = -b / (2 * a);
    return sampleRate / (bestPos + shift);
  }

  return sampleRate / bestPos;
}
