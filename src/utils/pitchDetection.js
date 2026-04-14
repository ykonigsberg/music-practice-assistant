// Improved Autocorrelation for Pitch Detection
export function autoCorrelate(buf, sampleRate) {
  let SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1;

  // Trim silence from edges
  let r1 = 0, r2 = SIZE - 1, thres = 0.2;
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

  // Find the first strong peak after the dip (fundamental, not harmonic)
  let maxval = -1, maxpos = -1;
  for (let i = d; i < SIZE; i++) {
    if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
  }

  if (maxpos < 1 || maxpos >= SIZE - 1) {
    return sampleRate / maxpos;
  }

  // Parabolic interpolation for sub-sample accuracy
  let y1 = c[maxpos - 1];
  let y2 = c[maxpos];
  let y3 = c[maxpos + 1];
  let a = (y1 + y3 - 2 * y2) / 2;
  let b = (y3 - y1) / 2;
  if (a) {
    let shift = -b / (2 * a);
    return sampleRate / (maxpos + shift);
  }

  return sampleRate / maxpos;
}
