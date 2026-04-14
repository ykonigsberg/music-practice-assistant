# Audio & Sound Libraries Documentation

## Overview

This project uses **browser-native Web Audio APIs** for real-time audio processing. No external audio libraries are required - everything runs natively in modern browsers.

---

## Core Audio Technologies

### 1. **Web Audio API** 🎵

The foundational audio processing engine built into all modern browsers.

**What we use it for:**
- Real-time audio analysis
- Frequency spectrum visualization
- Pitch detection signal processing

**Key Components:**
```javascript
// Audio context - the main audio processing graph
audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();

// Analyser node - extracts frequency/time-domain data
analyserRef.current = audioContextRef.current.createAnalyser();
analyserRef.current.fftSize = 2048; // Higher = more frequency resolution

// Connect microphone stream to analyser
const source = audioContextRef.current.createMediaStreamSource(stream);
source.connect(analyserRef.current);
```

**Browser Support:**
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

**Documentation:** [MDN Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

---

### 2. **MediaRecorder API** 🎙️

Native browser API for recording audio streams.

**What we use it for:**
- Recording practice sessions for AI analysis
- Auto-Coach mode (45-second clips)
- Manual recording segments

**Implementation:**
```javascript
// Create recorder from microphone stream
mediaRecorderRef.current = new MediaRecorder(stream);

// Collect audio chunks as they're recorded
mediaRecorderRef.current.ondataavailable = (e) => chunksRef.current.push(e.data);

// Process when recording stops
mediaRecorderRef.current.onstop = analyzeAudio;

// Control recording
mediaRecorderRef.current.start();  // Begin recording
mediaRecorderRef.current.stop();   // Stop and trigger analysis
```

**Output Format:** WebM audio (Opus codec)

**Browser Support:**
- Chrome/Edge 49+
- Firefox 25+
- Safari 14.1+

**Documentation:** [MDN MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)

---

### 3. **getUserMedia API** 🎤

Requests access to microphone input.

**What we use it for:**
- Requesting microphone permissions
- Accessing live audio stream

**Implementation:**
```javascript
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
```

**Permission Flow:**
1. Browser prompts user for microphone access
2. User grants permission
3. Stream becomes available for recording/analysis

**Documentation:** [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)

---

## Custom Audio Algorithms

### 4. **Autocorrelation Pitch Detection** 🎼

Custom implementation for detecting musical pitch from audio signal.

**Located in:** `src/utils/pitchDetection.js`

**Algorithm:**
1. Capture time-domain audio samples (Float32Array)
2. Calculate autocorrelation to find repeating patterns
3. Detect fundamental frequency from peak correlation
4. Convert frequency to musical note + cents deviation

**Key Features:**
- Detects fundamental frequency (not harmonics)
- Works in range: 40Hz - 2000Hz (covers most instruments)
- Returns note name, octave, and tuning (cents)

**Implementation Details:**
```javascript
export function autoCorrelate(buf, sampleRate) {
  // 1. Check if signal is strong enough (RMS threshold)
  let rms = Math.sqrt(buf.reduce((sum, val) => sum + val*val, 0) / buf.length);
  if (rms < 0.01) return -1;  // Too quiet
  
  // 2. Trim silence from edges
  // 3. Calculate autocorrelation
  // 4. Find peak correlation = fundamental period
  // 5. Convert period to frequency: sampleRate / period
  
  return frequency;
}
```

**Usage Example:**
```javascript
const freq = autoCorrelate(floatDataArray, audioContextRef.current.sampleRate);
if (freq !== -1 && freq > 40 && freq < 2000) {
  const noteNum = 12 * (Math.log(freq / 440) / Math.log(2));
  const noteIndex = Math.round(noteNum) + 69;
  const cents = Math.round((noteNum - Math.round(noteNum)) * 100);
  // noteIndex % 12 gives us C, C#, D, etc.
}
```

**Why Autocorrelation?**
- Fast and efficient
- Works well for monophonic instruments
- No external dependencies
- Better than FFT for pitch detection (avoids harmonic confusion)

**Limitations:**
- Works best with monophonic (single note) input
- Struggles with very noisy signals
- May miss very fast note transitions

---

## Audio Data Flow

```
Microphone Input
    ↓
getUserMedia (permission + stream)
    ↓
┌─────────────────────────────────┐
│  Audio Processing Branch        │
├─────────────────────────────────┤
│                                 │
│  ┌──────────────┐              │
│  │ Web Audio    │              │
│  │ Analyser     │              │
│  │              │              │
│  │ • FFT Data   │──→ Waveform Viz
│  │ • Time Data  │──→ Pitch Detection
│  └──────────────┘              │
│                                 │
│  ┌──────────────┐              │
│  │ MediaRecorder│              │
│  │              │              │
│  │ • WebM Audio │──→ AI Analysis (Gemini)
│  └──────────────┘              │
│                                 │
└─────────────────────────────────┘
```

---

## Real-time Metrics Calculation

### Space Metric (Silence Detection)
```javascript
let silenceFrames = 0;
if (currentVolume < 5) silenceFrames++;
else silenceFrames = Math.max(0, silenceFrames - 2);

const spaceMetric = Math.min(100, (silenceFrames / 60) * 100);
```

### Stability Metric (Pitch Consistency)
```javascript
const stability = 100 - Math.abs(currentVolume - lastVolume) * 5;
```

### Volume Metric
```javascript
const volume = dataArray.reduce((a, b) => a + b, 0) / bufferLength;
```

---

## Audio Data Types

### Frequency Data (Uint8Array)
- Range: 0-255
- Used for: Waveform visualization
- Updated via: `analyser.getByteFrequencyData(dataArray)`

### Time Domain Data (Float32Array)  
- Range: -1.0 to 1.0
- Used for: Pitch detection
- Updated via: `analyser.getFloatTimeDomainData(floatDataArray)`

---

## Performance Considerations

### RequestAnimationFrame Loop
```javascript
const updateData = () => {
  if (!analyserRef.current) return;
  
  // Get latest audio data
  analyserRef.current.getByteFrequencyData(dataArray);
  analyserRef.current.getFloatTimeDomainData(floatDataArray);
  
  // Process metrics
  // Detect pitch
  // Update UI state
  
  requestAnimationFrame(updateData);  // ~60fps
};
```

**Why RAF instead of setInterval?**
- Syncs with browser repaint (~60fps)
- Pauses when tab is inactive (saves CPU)
- No drift or timing issues

---

## External Audio Processing

### Gemini AI Audio Analysis

Audio clips are sent to Google's Gemini API for analysis:

```javascript
// Convert WebM blob to base64
const reader = new FileReader();
reader.readAsDataURL(blob);
const base64Data = reader.result.split(',')[1];

// Send to Gemini
fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent`, {
  method: 'POST',
  body: JSON.stringify({
    contents: [{
      parts: [
        { text: prompt },
        { inlineData: { mimeType: "audio/webm", data: base64Data } }
      ]
    }]
  })
});
```

**Gemini Audio Capabilities:**
- Analyzes rhythm, phrasing, articulation
- Provides narrative feedback in English or Hebrew
- Context-aware (knows current practice section)

---

## Zero External Dependencies

Unlike typical audio apps, we use **no external audio libraries**:

❌ **Not Using:**
- Tone.js (too heavy, we only need pitch detection)
- Pitchy (we have custom autocorrelation)
- Web Audio Font (no synthesis needed)
- Meyda (excessive features for our use case)

✅ **Benefits:**
- Smaller bundle size (~50KB for audio features)
- No dependency updates/vulnerabilities
- Full control over algorithms
- Better performance (no abstraction overhead)

---

## Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Web Audio API | 90+ | 88+ | 14+ | 90+ |
| MediaRecorder | 49+ | 25+ | 14.1+ | 49+ |
| getUserMedia | 53+ | 36+ | 11+ | 12+ |

**Mobile Support:**
- iOS Safari 14.5+ (requires HTTPS)
- Android Chrome 90+

---

## Security & Privacy

### Microphone Access
- Requires explicit user permission
- Shown via browser permission prompt
- Can be revoked in browser settings

### HTTPS Requirement
- Production builds **must use HTTPS**
- `getUserMedia` blocked on HTTP (except localhost)

### Data Processing
- Audio processed locally in browser
- Only sent to external API when explicitly recording
- No automatic cloud uploads

---

## Troubleshooting

### Microphone Not Working
```javascript
// Check for permission errors
try {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
} catch (err) {
  console.error('Mic access denied:', err);
  // Show user-friendly error
}
```

### Pitch Detection Issues
- Check microphone levels (not too quiet/loud)
- Reduce background noise
- Play single notes clearly (algorithm is monophonic)

### Performance Issues
- Reduce `analyser.fftSize` (2048 → 1024)
- Throttle state updates
- Use React.memo for heavy components

---

## References

- [Web Audio API Spec](https://www.w3.org/TR/webaudio/)
- [Autocorrelation Pitch Detection](https://en.wikipedia.org/wiki/Autocorrelation)
- [Musical Note Frequencies](https://en.wikipedia.org/wiki/Piano_key_frequencies)
- [MediaRecorder API](https://w3c.github.io/mediacapture-record/)

---

Built with browser-native audio APIs for maximum performance and minimal dependencies.
