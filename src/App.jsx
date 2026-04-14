import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CheckCircle, Music, RefreshCw, ArrowUp, Globe, TrendingUp, TrendingDown, X, Settings } from 'lucide-react';
import { autoCorrelate } from './utils/pitchDetection';
import { NOTES, MODES, STRING_TUNING, getSections } from './constants/music';
import { TRANSLATIONS } from './constants/translations';

export default function App() {
  const [lang, setLang] = useState('he');
  const txt = TRANSLATIONS[lang];
  const sectionsConfig = useMemo(() => getSections(lang), [lang]);

  const [activeTab, setActiveTab] = useState('scales'); 
  const [timeLeft, setTimeLeft] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [audioData, setAudioData] = useState(new Uint8Array(0));
  
  // Note Detector & Scale Tracker State
  const [currentNote, setCurrentNote] = useState(null);
  const [detectedFreq, setDetectedFreq] = useState(null);
  const [scaleRoot, setScaleRoot] = useState('C');
  const [scaleModeName, setScaleModeName] = useState('Ionian (Major)');
  
  // Phase tracking logic
  const [sequencePhase, setSequencePhase] = useState('DISCOVERY'); // 'DISCOVERY', 'COUNTDOWN', 'FULL_RUN', 'FAILED'
  const [failureReason, setFailureReason] = useState(null);
  const [failedInPhase, setFailedInPhase] = useState(null); // which phase failed: 'DISCOVERY' or 'FULL_RUN'
  const [countdownValue, setCountdownValue] = useState(0); // countdown seconds before FULL_RUN
  const [highestUnlockedIndex, setHighestUnlockedIndex] = useState(0); // 0 to 7
  const accumulatedTimeRef = useRef(0); // milliseconds spent on current note
  const lastTimestampRef = useRef(null);
  const [skipDetected, setSkipDetected] = useState(false);
  const skipTimeoutRef = useRef(null);
  const skipAccumulatedTimeRef = useRef(0); // Track how long skip has been detected
  const skipLastTimestampRef = useRef(null);
  const [progressPercent, setProgressPercent] = useState(0); // Visual progress feedback
  const [fullRunIndex, setFullRunIndex] = useState(0);
  
  // Detection ratio tracking: target note should be more present than previous notes
  const targetDetectionsRef = useRef(0);
  const prevNoteDetectionsRef = useRef(0);
  const totalDetectionsRef = useRef(0);
  
  // Real-time Metrics
  const [liveMetrics, setLiveMetrics] = useState({ space: 0, stability: 0, volume: 0 });
  const [fretboardCollapsed, setFretboardCollapsed] = useState(true);
  const [isLandscape, setIsLandscape] = useState(window.innerWidth > window.innerHeight);
  const [noteHoldTime, setNoteHoldTime] = useState(3000);
  const [showSettings, setShowSettings] = useState(false);
  const [harmonicsLog, setHarmonicsLog] = useState([]);

  useEffect(() => {
    const handleResize = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);

  // --- Scale Calculation ---
  const scaleNotes = useMemo(() => {
    const rootIndex = NOTES.indexOf(scaleRoot);
    const intervals = MODES[scaleModeName];
    return intervals.map(interval => NOTES[(rootIndex + interval) % 12]);
  }, [scaleRoot, scaleModeName]);

  const fullRunSequence = useMemo(() => {
    const descending = [...scaleNotes].reverse().slice(1);
    return [...scaleNotes, ...descending];
  }, [scaleNotes]);

  const resetScaleTracking = () => {
    setSequencePhase('DISCOVERY');
    setFailureReason(null);
    setFailedInPhase(null);
    setCountdownValue(0);
    setHighestUnlockedIndex(0);
    accumulatedTimeRef.current = 0;
    lastTimestampRef.current = null;
    setSkipDetected(false);
    setProgressPercent(0);
    setFullRunIndex(0);
    skipAccumulatedTimeRef.current = 0;
    skipLastTimestampRef.current = null;
    targetDetectionsRef.current = 0;
    prevNoteDetectionsRef.current = 0;
    totalDetectionsRef.current = 0;
    if (skipTimeoutRef.current) clearTimeout(skipTimeoutRef.current);
  };

  const retryFullRun = () => {
    setSequencePhase('COUNTDOWN');
    setCountdownValue(2);
    setFailureReason(null);
    setFailedInPhase(null);
    setFullRunIndex(0);
    accumulatedTimeRef.current = 0;
    lastTimestampRef.current = null;
    setProgressPercent(0);
    skipAccumulatedTimeRef.current = 0;
    skipLastTimestampRef.current = null;
  };

  useEffect(() => {
    resetScaleTracking();
  }, [scaleRoot, scaleModeName]);

  // --- Countdown Timer before FULL_RUN ---
  useEffect(() => {
    if (sequencePhase !== 'COUNTDOWN') return;
    if (countdownValue <= 0) {
      setSequencePhase('FULL_RUN');
      return;
    }
    const timer = setTimeout(() => {
      setCountdownValue(prev => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [sequencePhase, countdownValue]);

  // --- Continuous Time Tracking Loop ---
  useEffect(() => {
    if (activeTab !== 'scales' || sequencePhase === 'COMPLETED' || sequencePhase === 'FAILED' || sequencePhase === 'COUNTDOWN') {
       return;
    }

    let animationFrameId;
    
    const trackTime = () => {
      const expectedNote = scaleNotes[highestUnlockedIndex];
      
      if (!currentNote) {
         // No note detected - stop accumulating time
         lastTimestampRef.current = null;
         animationFrameId = requestAnimationFrame(trackTime);
         return;
      }
      
      // --- FULL_RUN phase: play scale up and down ---
      if (sequencePhase === 'FULL_RUN') {
         const targetNote = fullRunSequence[fullRunIndex];
         const isTarget = currentNote.name === targetNote && Math.abs(currentNote.cents) < 35;
         
         const prevNoteInRun = fullRunIndex > 0 ? fullRunSequence[fullRunIndex - 1] : null;
         const isPrevInRun = prevNoteInRun && currentNote.name === prevNoteInRun;
         
         const targetNoteIdx = NOTES.indexOf(targetNote);
         const detectedIdx = NOTES.indexOf(currentNote.name);
         const semiDist = ((detectedIdx - targetNoteIdx) + 12) % 12;
         const harmonicInts = [0, 7, 4, 10, 3];
         const isHarmonic = harmonicInts.includes(semiDist);
         
         if (isTarget) {
            const now = performance.now();
            if (lastTimestampRef.current !== null) {
               const delta = now - lastTimestampRef.current;
               if (delta < 100) {
                  accumulatedTimeRef.current += delta;
                  setProgressPercent(Math.min(100, (accumulatedTimeRef.current / 300) * 100));
               }
            }
            lastTimestampRef.current = now;
            skipAccumulatedTimeRef.current = 0;
            skipLastTimestampRef.current = null;
            
            if (accumulatedTimeRef.current >= 300) {
               accumulatedTimeRef.current = 0;
               lastTimestampRef.current = null;
               setProgressPercent(0);
               if (fullRunIndex < fullRunSequence.length - 1) {
                  setFullRunIndex(prev => prev + 1);
               } else {
                  setSequencePhase('COMPLETED');
               }
            }
         } else if (isPrevInRun || isHarmonic) {
            lastTimestampRef.current = null;
         } else {
            const now = performance.now();
            if (skipLastTimestampRef.current !== null) {
               const delta = now - skipLastTimestampRef.current;
               if (delta < 100) {
                  skipAccumulatedTimeRef.current += delta;
               }
            }
            skipLastTimestampRef.current = now;
            lastTimestampRef.current = null;
            
            if (skipAccumulatedTimeRef.current >= 100) {
               const logEntry = { time: new Date().toLocaleTimeString(), phase: 'FULL_RUN', expected: fullRunSequence[fullRunIndex], detected: `${currentNote.name}${currentNote.octave}`, cents: currentNote.cents, semiDist, freq: detectedFreq };
               console.warn('[Harmonics]', logEntry);
               setHarmonicsLog(prev => [logEntry, ...prev].slice(0, 100));
               skipAccumulatedTimeRef.current = 0;
               skipLastTimestampRef.current = null;
            }
         }
         
         animationFrameId = requestAnimationFrame(trackTime);
         return;
      }

      // Check if user is skipping ahead
      // Filter out harmonic overtones - when playing a note, harmonics at
      // octave (+12), 5th (+7), octave+5th (+19), 2 octaves (+24) etc. are natural
      const expectedNoteIndex = NOTES.indexOf(expectedNote);
      const detectedNoteIndex = NOTES.indexOf(currentNote.name);
      const semitoneDistance = ((detectedNoteIndex - expectedNoteIndex) + 12) % 12;
      // Common harmonic intervals: unison (0), minor 3rd (3), major 3rd (4), perfect 4th (5), perfect 5th (7), minor 6th (8), minor 7th (10)
      const harmonicIntervals = [0, 3, 4, 5, 7, 8, 10];
      const isLikelyHarmonic = harmonicIntervals.includes(semitoneDistance);
      
      // Only count as skipping if the note name appears ahead but NOT behind/at current position
      // This prevents false failures when e.g. playing C while on E — the C is both behind (index 0) and ahead (index 7 octave)
      const noteAppearsAhead = !isLikelyHarmonic && scaleNotes.slice(highestUnlockedIndex + 1).some(
        note => currentNote.name === note && Math.abs(currentNote.cents) < 35
      );
      const noteAppearsBehindOrCurrent = scaleNotes.slice(0, highestUnlockedIndex + 1).some(
        note => currentNote.name === note
      );
      const isSkippingAhead = noteAppearsAhead && !noteAppearsBehindOrCurrent;
      
      if (isSkippingAhead) {
         const now = performance.now();
         
         if (skipLastTimestampRef.current !== null) {
            const delta = now - skipLastTimestampRef.current;
            if (delta < 100) {
               skipAccumulatedTimeRef.current += delta;
            }
         }
         
         skipLastTimestampRef.current = now;
         
         // Log instead of failing - suspected harmonic/skip
         if (skipAccumulatedTimeRef.current >= 100) {
            const logEntry = { time: new Date().toLocaleTimeString(), phase: 'DISCOVERY', expected: expectedNote, detected: `${currentNote.name}${currentNote.octave}`, cents: currentNote.cents, freq: detectedFreq, reason: 'skip_ahead' };
            console.warn('[Harmonics]', logEntry);
            setHarmonicsLog(prev => [logEntry, ...prev].slice(0, 100));
            skipAccumulatedTimeRef.current = 0;
            skipLastTimestampRef.current = null;
         }
         
         animationFrameId = requestAnimationFrame(trackTime);
         return;
      } else {
         skipAccumulatedTimeRef.current = 0;
         skipLastTimestampRef.current = null;
      }

      // --- Detection ratio tracking ---
      // Count how often we detect the target vs previous notes
      const isPreviousNote = scaleNotes.slice(0, highestUnlockedIndex).some(
        note => currentNote.name === note
      );
      const isTargetNote = currentNote.name === expectedNote && Math.abs(currentNote.cents) < 35;
      
      if (isTargetNote) {
         targetDetectionsRef.current++;
      } else if (isPreviousNote) {
         prevNoteDetectionsRef.current++;
      }
      totalDetectionsRef.current++;
      
      // After 120 detections (~2 seconds), if previous notes strongly dominate (3x), fail
      // This means the player isn't actually ascending to the new note
      if (highestUnlockedIndex > 0 && totalDetectionsRef.current >= 120) {
         if (prevNoteDetectionsRef.current > targetDetectionsRef.current * 3) {
            const logEntry = { time: new Date().toLocaleTimeString(), phase: 'DISCOVERY', expected: expectedNote, detected: `${currentNote.name}${currentNote.octave}`, cents: currentNote.cents, freq: detectedFreq, reason: 'prev_dominates', targetCount: targetDetectionsRef.current, prevCount: prevNoteDetectionsRef.current, total: totalDetectionsRef.current };
            console.warn('[Harmonics]', logEntry);
            setHarmonicsLog(prev => [logEntry, ...prev].slice(0, 100));
            // Reset counters and let user continue
            targetDetectionsRef.current = 0;
            prevNoteDetectionsRef.current = 0;
            totalDetectionsRef.current = 0;
         }
      }

      if (isTargetNote) {
         // Accumulate time playing the correct note
         const now = performance.now();
         
         if (lastTimestampRef.current !== null) {
            const delta = now - lastTimestampRef.current;
            // Only accumulate if delta is reasonable (< 100ms to avoid big jumps)
            if (delta < 100) {
               accumulatedTimeRef.current += delta;
               // Octave (index 7) only needs 200ms, others use configured time
               const requiredTime = highestUnlockedIndex === 7 ? 200 : noteHoldTime;
               setProgressPercent(Math.min(100, (accumulatedTimeRef.current / requiredTime) * 100));
            }
         }
         
         lastTimestampRef.current = now;
         
         // Octave (index 7) only needs 200ms, others use configured time
         const requiredTime = highestUnlockedIndex === 7 ? 200 : noteHoldTime;
         if (accumulatedTimeRef.current >= requiredTime) {
            accumulatedTimeRef.current = 0; // Reset for next note
            lastTimestampRef.current = null;
            setProgressPercent(0);
            if (highestUnlockedIndex < 7) {
               // Reset detection counters for the new target note
               targetDetectionsRef.current = 0;
               prevNoteDetectionsRef.current = 0;
               totalDetectionsRef.current = 0;
               setHighestUnlockedIndex(prev => prev + 1);
            } else {
               setHighestUnlockedIndex(8);
               setFullRunIndex(0);
               skipAccumulatedTimeRef.current = 0;
               skipLastTimestampRef.current = null;
               setCountdownValue(2);
               setSequencePhase('COUNTDOWN');
            }
         }
      } else {
         // Playing wrong note - stop accumulating but don't reset total time
         lastTimestampRef.current = null;
      }
      
      animationFrameId = requestAnimationFrame(trackTime);
    };
    
    animationFrameId = requestAnimationFrame(trackTime);
    
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [currentNote, highestUnlockedIndex, sequencePhase, scaleNotes, activeTab, fullRunIndex, fullRunSequence, noteHoldTime]);

  // --- Timer Logic ---
  useEffect(() => {
    let interval;
    if (timerActive && timeLeft > 0) interval = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    else if (timeLeft === 0) setTimerActive(false);
    return () => clearInterval(interval);
  }, [timerActive, timeLeft]);

  // --- Real-time Audio Processing ---
  const startAudioEngine = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      
      analyserRef.current.fftSize = 2048;
      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const floatDataArray = new Float32Array(analyserRef.current.fftSize);
      
      let lastVolume = 0;
      let silenceFrames = 0;

      const updateData = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        analyserRef.current.getFloatTimeDomainData(floatDataArray);
        setAudioData(new Uint8Array(dataArray));

        const currentVolume = dataArray.reduce((a, b) => a + b, 0) / bufferLength;
        if (currentVolume < 5) silenceFrames++; else silenceFrames = Math.max(0, silenceFrames - 2);

        setLiveMetrics({
          volume: currentVolume,
          space: Math.min(100, (silenceFrames / 60) * 100),
          stability: 100 - Math.abs(currentVolume - lastVolume) * 5
        });
        lastVolume = currentVolume;

        const freq = autoCorrelate(floatDataArray, audioContextRef.current.sampleRate);
        if (freq !== -1 && freq > 40 && freq < 2000) {
            setDetectedFreq(Math.round(freq));
            const noteNum = 12 * (Math.log(freq / 440) / Math.log(2));
            const noteIndex = Math.round(noteNum) + 69;
            const cents = Math.round((noteNum - Math.round(noteNum)) * 100);
            const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
            setCurrentNote({ name: noteNames[noteIndex % 12], octave: Math.floor(noteIndex / 12) - 1, cents });
        } else {
            setCurrentNote(null);
            setDetectedFreq(null);
        }
        requestAnimationFrame(updateData);
      };
      updateData();
    } catch (err) {
      console.error("Microphone access denied:", err);
    }
  };

  useEffect(() => {
    startAudioEngine();
    return () => { 
      if (audioContextRef.current) audioContextRef.current.close(); 
    };
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-8 font-sans overflow-x-hidden flex flex-col" dir={lang === 'he' ? 'rtl' : 'ltr'}>
      {!isLandscape && (
        <div className="fixed inset-0 z-[9999] bg-zinc-950 flex flex-col items-center justify-center p-8 text-center sm:hidden">
          <div className="w-20 h-20 mb-8 border-4 border-amber-500 rounded-2xl flex items-center justify-center">
            <RefreshCw className="w-10 h-10 text-amber-500 animate-spin" />
          </div>
          <h2 className="text-2xl font-black text-white mb-4">{lang === 'he' ? 'אנא סובב את המכשיר' : 'Please Rotate Device'}</h2>
          <p className="text-zinc-500 max-w-xs">{txt.rotateDevice}</p>
        </div>
      )}
      {/* Header */}
      <header className="max-w-6xl mx-auto w-full mb-8 flex justify-between items-center border-b border-zinc-800 pb-6 shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-amber-400 to-amber-600 bg-clip-text text-transparent">
              {txt.appTitle}
            </h1>
            <button onClick={() => setLang(lang === 'he' ? 'en' : 'he')} className="flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border border-zinc-700 hover:bg-zinc-800 text-zinc-400 transition-colors">
              <Globe className="w-3 h-3" />
              {lang === 'he' ? 'EN' : 'HE'}
            </button>
          </div>
          <p className="text-zinc-500 text-sm mt-1">{txt.appSubtitle}</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 flex-1 min-h-0">
        
        {/* RIGHT PANEL: Navigation & Timer */}
        <div className="lg:col-span-3 flex flex-row lg:flex-col gap-3 lg:gap-4 min-h-0 overflow-x-auto lg:overflow-y-auto pb-2 lg:pb-0">
          <div className="bg-zinc-900 border border-zinc-800 p-1.5 lg:p-2 rounded-2xl shrink-0 flex flex-row lg:flex-col gap-1 w-fit lg:w-full">
            {sectionsConfig.map((s) => (
              <button key={s.id} onClick={() => { setActiveTab(s.id); setTimeLeft(0); }} className={`whitespace-nowrap lg:whitespace-normal text-start p-3 lg:p-4 rounded-xl transition-all flex justify-between items-center ${activeTab === s.id ? 'bg-zinc-800 border-zinc-700 border text-amber-500' : 'text-zinc-500 border-transparent border hover:text-zinc-300'}`}>
                <div className="flex flex-col">
                  <div className="font-bold flex items-center gap-2 text-xs lg:text-base">{s.id === 'scales' && activeTab === 'scales' && <Music className="w-3 h-3 lg:w-4 lg:h-4 animate-pulse" />}{s.title}</div>
                  <div className="text-[9px] lg:text-[10px] opacity-60 mt-0.5 lg:mt-1">{s.duration} {txt.min}</div>
                </div>
              </button>
            ))}
          </div>

          <div className="bg-zinc-900 border border-zinc-800 p-3 lg:p-6 rounded-2xl text-center shadow-2xl relative overflow-hidden shrink-0 flex flex-row lg:flex-col items-center justify-center gap-4 lg:gap-0 lg:w-full">
             <div className="relative z-10 flex flex-col items-center">
               <div className="text-[10px] lg:text-sm text-zinc-500 mb-0.5 lg:mb-1">{txt.timeLeft}</div>
               <div className="text-2xl lg:text-5xl font-mono font-black text-white lg:mb-6">
                 {timeLeft > 0 ? `${Math.floor(timeLeft/60)}:${(timeLeft%60).toString().padStart(2,'0')}` : `${sectionsConfig.find(s=>s.id===activeTab)?.duration || 0}:00`}
               </div>
               <button onClick={() => { setTimeLeft((sectionsConfig.find(s=>s.id===activeTab)?.duration || 0) * 60); setTimerActive(true); }} className="w-full bg-amber-500 text-black py-3 rounded-xl font-black hover:bg-amber-400 transition-colors hidden lg:block">{txt.startPractice}</button>
             </div>
             <button onClick={() => { setTimeLeft((sectionsConfig.find(s=>s.id===activeTab)?.duration || 0) * 60); setTimerActive(true); }} className="bg-amber-500 text-black px-4 py-2 rounded-xl font-black hover:bg-amber-400 transition-colors block lg:hidden text-xs shrink-0">{txt.startPractice}</button>
             <div className={`absolute bottom-0 ${lang === 'he' ? 'right-0' : 'left-0'} w-full h-1 bg-zinc-800`}><div className={`h-full bg-amber-500 transition-all duration-1000 ${lang === 'en' ? 'origin-left' : 'origin-right'}`} style={{ width: timerActive ? `${(timeLeft / ((sectionsConfig.find(s=>s.id===activeTab)?.duration || 1) * 60)) * 100}%` : '0%' }} /></div>
          </div>
        </div>

        {/* CENTER PANEL: Dashboard & Visualizer */}
        <div className="lg:col-span-9 flex flex-col gap-4 lg:gap-6 min-h-0 flex-grow">
          {activeTab === 'scales' ? (
            <div className="flex flex-col gap-2 lg:gap-3 shrink-0">
              <div className="flex flex-col sm:flex-row gap-3 bg-zinc-900 border border-zinc-800 p-3 lg:p-4 rounded-2xl items-center justify-between">
                <div className="flex gap-2 lg:gap-3 w-full sm:flex-1">
                  <select value={scaleRoot} onChange={(e) => setScaleRoot(e.target.value)} className="bg-black border border-zinc-700 text-amber-500 font-bold rounded-xl px-2 lg:px-4 py-1.5 lg:py-2 focus:outline-none focus:border-amber-500 text-sm lg:text-base">
                    {NOTES.map(note => <option key={note} value={note}>{note}</option>)}
                  </select>
                  <select value={scaleModeName} onChange={(e) => setScaleModeName(e.target.value)} className="flex-1 bg-black border border-zinc-700 text-zinc-300 rounded-xl px-2 lg:px-4 py-1.5 lg:py-2 focus:outline-none focus:border-amber-500 text-sm lg:text-base">
                    {Object.keys(MODES).map(mode => <option key={mode} value={mode}>{mode}</option>)}
                  </select>
                </div>
                <button onClick={resetScaleTracking} className="p-2 bg-zinc-800 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all" title={txt.resetScale}>
                  <RefreshCw className="w-5 h-5" />
                </button>
                <button onClick={() => setShowSettings(prev => !prev)} className={`p-2 rounded-lg transition-all ${showSettings ? 'bg-amber-500 text-black' : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'}`} title={lang === 'he' ? 'הגדרות' : 'Settings'}>
                  <Settings className="w-5 h-5" />
                </button>
              </div>

              {/* Settings Panel */}
              {showSettings && (
                <div className="bg-zinc-900 border border-amber-500/30 p-3 lg:p-4 rounded-2xl flex flex-wrap items-center gap-3 lg:gap-4">
                  <label className="text-xs lg:text-sm text-zinc-400 font-bold">{lang === 'he' ? 'זמן שהייה על תו:' : 'Note hold time:'}</label>
                  <div className="flex gap-1.5">
                    {[1000, 2000, 3000, 5000, 7000, 10000].map(ms => (
                      <button key={ms} onClick={() => setNoteHoldTime(ms)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${noteHoldTime === ms ? 'bg-amber-500 text-black' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
                        {ms / 1000}s
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Scale Sequences Display */}
              <div className="bg-gradient-to-br from-zinc-900 to-black border border-amber-500/30 p-3 lg:p-6 rounded-2xl lg:rounded-3xl relative overflow-hidden flex flex-col gap-4 lg:gap-6 shadow-[0_0_30px_rgba(245,158,11,0.05)]">
                 
                 <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between z-10 gap-4 sm:gap-0">
                   <div>
                     <h3 className="text-amber-500 font-bold mb-1 flex items-center gap-2 text-sm lg:text-base">
                        <Music className="w-4 h-4 lg:w-5 lg:h-5" /> {txt.scalePrecision}
                     </h3>
                     <div className="text-xs lg:text-sm mt-1 lg:mt-2 flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                           {sequencePhase === 'FAILED' && <span className="text-red-500 font-bold animate-pulse flex items-center gap-1"><X className="w-4 h-4"/> {lang === 'he' ? 'נכשלת!' : 'Failed!'}</span>}
                           {sequencePhase === 'FAILED' && failedInPhase === 'FULL_RUN' && (
                              <button onClick={retryFullRun} className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg transition-colors">
                                {lang === 'he' ? 'נסה שוב את הריצה' : 'Retry Run'}
                              </button>
                           )}
                           {sequencePhase === 'FAILED' && (
                              <button onClick={resetScaleTracking} className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs font-bold rounded-lg transition-colors">
                                {lang === 'he' ? 'התחל מחדש' : 'Start Over'}
                              </button>
                           )}
                           {sequencePhase === 'FAILED' && failureReason && <div className="text-[11px] text-red-400/80 font-mono mt-1 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2 max-w-full break-words">{failureReason}</div>}
                           {skipAccumulatedTimeRef.current > 0 && skipAccumulatedTimeRef.current < 1500 && sequencePhase === 'DISCOVERY' && <span className="text-orange-500 font-bold animate-pulse flex items-center gap-1"><TrendingDown className="w-4 h-4"/> {lang === 'he' ? 'אזהרה: מזהה תו גבוה יותר' : 'Warning: Higher note detected'}</span>}
                           {skipAccumulatedTimeRef.current === 0 && sequencePhase === 'DISCOVERY' && <span className="text-amber-500 font-bold flex items-center gap-1"><ArrowUp className="w-4 h-4"/> {txt.phaseDiscovery} {highestUnlockedIndex + 1} ({scaleNotes[highestUnlockedIndex]}) - {lang === 'he' ? 'נגן ~3 שניות בסה״כ' : 'Play ~3 sec total'}</span>}
                           {sequencePhase === 'COUNTDOWN' && <span className="text-yellow-400 font-bold text-2xl animate-pulse">{countdownValue > 0 ? countdownValue : (lang === 'he' ? 'קדימה!' : 'Go!')}</span>}
                           {sequencePhase === 'FULL_RUN' && <span className="text-cyan-400 font-bold animate-pulse flex items-center gap-1"><TrendingUp className="w-4 h-4"/> {lang === 'he' ? `נגן את הסולם למעלה ולמטה (${fullRunIndex + 1}/${fullRunSequence.length})` : `Play the scale up and down (${fullRunIndex + 1}/${fullRunSequence.length})`}</span>}
                           {sequencePhase === 'COMPLETED' && <span className="text-green-400 font-bold flex items-center gap-1"><CheckCircle className="w-4 h-4"/> {lang === 'he' ? 'סיימת בהצלחה!' : 'Completed Successfully!'}</span>}
                        </div>
                        {/* Debug info */}
                        {sequencePhase === 'DISCOVERY' && (
                           <div className="text-xs text-zinc-500 font-mono flex flex-col gap-0.5 min-h-[3.5rem]">
                              <div>Progress: {progressPercent.toFixed(0)}% ({accumulatedTimeRef.current.toFixed(0)}ms / {noteHoldTime}ms)</div>
                              {detectedFreq && <div className="text-[10px]">Freq: {detectedFreq}Hz | Detected: {currentNote?.name}{currentNote?.octave} ({currentNote?.cents > 0 ? '+' : ''}{currentNote?.cents}c)</div>}
                              {skipAccumulatedTimeRef.current > 0 && (
                                <div className="text-orange-500 text-[10px]">
                                  Skip detected: {skipAccumulatedTimeRef.current.toFixed(0)}ms / 1500ms
                                </div>
                              )}
                           </div>
                        )}
                     </div>
                   </div>
                   <div className="w-24 lg:w-32 h-16 lg:h-20 flex justify-end items-center shrink-0">
                     {currentNote ? (
                       <div className="flex items-baseline justify-end gap-1 w-full" dir="ltr">
                         <span className="text-4xl lg:text-6xl font-black text-white inline-block text-center min-w-[50px] lg:min-w-[70px]">{currentNote.name}</span>
                         <span className="text-xl lg:text-2xl text-amber-500 font-bold mb-0.5 lg:mb-1 inline-block min-w-[15px] lg:min-w-[20px]">{currentNote.octave}</span>
                       </div>
                     ) : (
                       <div className="text-3xl lg:text-5xl font-mono text-zinc-800 font-bold w-full text-center">--</div>
                     )}
                   </div>
                 </div>

                 {/* Tracker Circles - DISCOVERY & FAILED */}
                 {(sequencePhase === 'DISCOVERY' || sequencePhase === 'FAILED') && (
                 <div className="z-10 flex justify-between items-center relative px-2 pt-4">
                    <div className="absolute top-[35%] left-6 right-6 h-0.5 bg-zinc-800/80 -z-10" />
                    {scaleNotes.map((note, index) => {
                      const isTarget = index === highestUnlockedIndex && sequencePhase === 'DISCOVERY';
                      const isUnlocked = index < highestUnlockedIndex || sequencePhase === 'FULL_RUN';
                      const isHittingTarget = isTarget && currentNote?.name === note && Math.abs(currentNote.cents) < 35;
                      const isHittingUnlocked = isUnlocked && currentNote?.name === note && Math.abs(currentNote.cents) < 35;
                      
                      let stateColorClass = 'bg-zinc-950 border-zinc-800 text-zinc-600 opacity-40';
                      
                      // FAILED state - show all as red
                      if (sequencePhase === 'FAILED') {
                         stateColorClass = 'bg-red-900/30 border-red-500/50 text-red-400 opacity-60';
                      } else if (isUnlocked) {
                         // Completed notes stay green permanently
                         stateColorClass = isHittingUnlocked 
                            ? 'bg-green-500 border-green-400 text-black scale-110 shadow-[0_0_20px_rgba(34,197,94,0.6)]'
                            : 'bg-green-500/30 border-green-500/60 text-green-400 shadow-[0_0_10px_rgba(34,197,94,0.2)]';
                      } else if (isTarget) {
                         if (isHittingTarget) {
                            stateColorClass = 'bg-green-500 border-green-400 text-black scale-125 shadow-[0_0_25px_rgba(34,197,94,0.8)] z-10';
                         } else {
                            stateColorClass = 'bg-zinc-900 border-amber-500 text-amber-500 scale-110 shadow-[0_0_15px_rgba(245,158,11,0.3)] animate-pulse z-10';
                         }
                      }

                      return (
                        <div key={index} className="flex flex-col items-center gap-1.5 lg:gap-2">
                          <div className={`w-12 h-12 lg:w-20 lg:h-20 rounded-full flex items-center justify-center font-bold text-lg lg:text-3xl border-2 transition-all duration-200 ${stateColorClass} relative overflow-hidden`}>
                            {/* Progress arc for current target (only in DISCOVERY mode) */}
                            {isTarget && progressPercent > 0 && sequencePhase === 'DISCOVERY' && (
                              <svg className="absolute inset-0 w-full h-full -rotate-90 block lg:hidden" viewBox="0 0 48 48">
                                <circle
                                  cx="24"
                                  cy="24"
                                  r="21"
                                  fill="none"
                                  stroke="rgba(34, 197, 94, 0.5)"
                                  strokeWidth="3"
                                  strokeDasharray={`${progressPercent * 1.32} 132`}
                                  className="transition-all duration-100"
                                />
                              </svg>
                            )}
                            {isTarget && progressPercent > 0 && sequencePhase === 'DISCOVERY' && (
                              <svg className="absolute inset-0 w-full h-full -rotate-90 hidden lg:block" viewBox="0 0 80 80">
                                <circle
                                  cx="40"
                                  cy="40"
                                  r="36"
                                  fill="none"
                                  stroke="rgba(34, 197, 94, 0.5)"
                                  strokeWidth="4"
                                  strokeDasharray={`${progressPercent * 2.26} 226`}
                                  className="transition-all duration-100"
                                />
                              </svg>
                            )}
                            <span className="relative z-10">{index + 1}</span>
                          </div>
                          <span className={`text-[10px] lg:text-sm font-mono font-bold transition-all ${sequencePhase === 'FAILED' ? 'text-red-400 opacity-60' : isHittingTarget || isHittingUnlocked ? 'text-green-400 scale-110' : isUnlocked ? 'text-green-400' : 'text-zinc-600 opacity-40'}`}>
                            {note}
                          </span>
                        </div>
                      );
                    })}
                 </div>
                 )}

                 {/* Full Run Tracker - Up and Down */}
                 {sequencePhase === 'FULL_RUN' && (
                 <div className="z-10 flex flex-col gap-4 px-2 pt-4">
                    <div className="flex items-center gap-2">
                       <TrendingUp className="w-4 h-4 text-green-400 shrink-0" />
                       <div className="flex justify-between items-center flex-1 relative">
                          <div className="absolute top-[45%] left-2 right-2 h-0.5 bg-zinc-800/80 -z-10" />
                          {fullRunSequence.slice(0, 8).map((note, index) => {
                            const isTarget = index === fullRunIndex;
                            const isDone = index < fullRunIndex;
                            const isHitting = isTarget && currentNote?.name === note && Math.abs(currentNote.cents) < 35;
                            let cls = 'bg-zinc-950 border-zinc-800 text-zinc-600 opacity-40';
                            if (isDone) cls = 'bg-green-500/30 border-green-500/60 text-green-400';
                            else if (isTarget && isHitting) cls = 'bg-green-500 border-green-400 text-black scale-125 shadow-[0_0_25px_rgba(34,197,94,0.8)] z-10';
                            else if (isTarget) cls = 'bg-zinc-900 border-cyan-500 text-cyan-400 scale-110 shadow-[0_0_15px_rgba(6,182,212,0.3)] animate-pulse z-10';
                            return (
                              <div key={index} className="flex flex-col items-center gap-1">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-all duration-200 ${cls} relative overflow-hidden`}>
                                  {isTarget && progressPercent > 0 && (
                                    <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 32 32">
                                      <circle cx="16" cy="16" r="14" fill="none" stroke="rgba(34,197,94,0.5)" strokeWidth="3" strokeDasharray={`${progressPercent * 0.88} 88`} />
                                    </svg>
                                  )}
                                  <span className="relative z-10 text-xs">{note}</span>
                                </div>
                                <span className={`text-[9px] font-mono font-bold ${isDone ? 'text-green-400' : isTarget ? 'text-cyan-400' : 'text-zinc-600 opacity-40'}`}>{index + 1}</span>
                              </div>
                            );
                          })}
                       </div>
                    </div>
                    <div className="flex items-center gap-2">
                       <TrendingDown className="w-4 h-4 text-amber-400 shrink-0" />
                       <div className="flex justify-between items-center flex-1 relative">
                          <div className="absolute top-[45%] left-2 right-2 h-0.5 bg-zinc-800/80 -z-10" />
                          {fullRunSequence.slice(8).map((note, seqIdx) => {
                            const index = seqIdx + 8;
                            const isTarget = index === fullRunIndex;
                            const isDone = index < fullRunIndex;
                            const isHitting = isTarget && currentNote?.name === note && Math.abs(currentNote.cents) < 35;
                            let cls = 'bg-zinc-950 border-zinc-800 text-zinc-600 opacity-40';
                            if (isDone) cls = 'bg-green-500/30 border-green-500/60 text-green-400';
                            else if (isTarget && isHitting) cls = 'bg-green-500 border-green-400 text-black scale-125 shadow-[0_0_25px_rgba(34,197,94,0.8)] z-10';
                            else if (isTarget) cls = 'bg-zinc-900 border-cyan-500 text-cyan-400 scale-110 shadow-[0_0_15px_rgba(6,182,212,0.3)] animate-pulse z-10';
                            return (
                              <div key={index} className="flex flex-col items-center gap-1">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-all duration-200 ${cls} relative overflow-hidden`}>
                                  {isTarget && progressPercent > 0 && (
                                    <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 32 32">
                                      <circle cx="16" cy="16" r="14" fill="none" stroke="rgba(34,197,94,0.5)" strokeWidth="3" strokeDasharray={`${progressPercent * 0.88} 88`} />
                                    </svg>
                                  )}
                                  <span className="relative z-10 text-xs">{note}</span>
                                </div>
                                <span className={`text-[9px] font-mono font-bold ${isDone ? 'text-green-400' : isTarget ? 'text-cyan-400' : 'text-zinc-600 opacity-40'}`}>{7 - seqIdx}</span>
                              </div>
                            );
                          })}
                       </div>
                    </div>
                 </div>
                 )}

                 {/* Completed */}
                 {sequencePhase === 'COMPLETED' && (
                 <div className="z-10 flex flex-col items-center justify-center gap-3 py-6">
                    <CheckCircle className="w-14 h-14 text-green-400" />
                    <span className="text-green-400 text-lg font-bold">{lang === 'he' ? 'סיימת בהצלחה!' : 'Completed Successfully!'}</span>
                    <button onClick={resetScaleTracking} className="mt-2 px-6 py-2 bg-green-500 text-black rounded-xl font-bold hover:bg-green-400 transition-colors">
                       {lang === 'he' ? 'התחל מחדש' : 'Start Over'}
                    </button>
                 </div>
                 )}

                 {currentNote && (
                    <div className="absolute bottom-0 left-0 w-full h-1.5 bg-zinc-900 flex justify-center items-center">
                       <div className="w-[2px] h-full bg-zinc-600 absolute z-0" />
                       <div className={`h-full w-2 rounded-full absolute z-10 transition-all duration-150 ${Math.abs(currentNote.cents) < 15 ? 'bg-green-500' : 'bg-red-500'}`} style={{ left: `calc(50% + ${currentNote.cents / 2}%)` }} />
                    </div>
                 )}
              </div>

              {/* Fretboard Visual Guide */}
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden shrink-0">
                <button onClick={() => setFretboardCollapsed(prev => !prev)} className="w-full p-3 border-b border-zinc-800 bg-zinc-900/80 flex items-center justify-between hover:bg-zinc-800/80 transition-colors">
                  <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Scale Pattern Reference</h3>
                  <span className="text-zinc-500 text-xs">{fretboardCollapsed ? '▶' : '▼'}</span>
                </button>
                {!fretboardCollapsed && (
                <div className="w-full overflow-x-auto bg-black/40 p-4" dir="ltr">
                  <div className="min-w-[600px] flex flex-col gap-[14px] relative py-2">
                    
                    {/* Fret marker background dots */}
                    <div className="absolute inset-0 z-0 pointer-events-none">
                      {[3, 5, 7, 9].map(m => (
                        <div key={m} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-zinc-800/60" style={{ left: `calc(${(m / 12) * 100}% - ${(m / 12) * 4}%)` }} />
                      ))}
                      {/* 12th fret double dot */}
                      <div className="absolute top-1/3 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-zinc-800/60" style={{ left: 'calc(100% - 4%)' }} />
                      <div className="absolute top-2/3 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-zinc-800/60" style={{ left: 'calc(100% - 4%)' }} />
                    </div>

                    {/* Strings */}
                    {STRING_TUNING.map((baseNoteIdx, stringIdx) => (
                      <div key={stringIdx} className="flex relative items-center h-5">
                        {/* The string line */}
                        <div className="absolute w-full bg-zinc-600/50 top-1/2 -translate-y-1/2 z-0" style={{ height: `${1 + stringIdx * 0.3}px` }} />
                        {/* The Nut */}
                        <div className="absolute w-1.5 h-[120%] bg-zinc-400/30 left-[4.5%] z-0 rounded-sm" />

                        {Array.from({ length: 13 }, (_, fret) => {
                          const noteIdx = (baseNoteIdx + fret) % 12;
                          const noteName = NOTES[noteIdx];
                          const scaleDegreeIndex = scaleNotes.indexOf(noteName);
                          const isInScale = scaleDegreeIndex !== -1;

                          return (
                            <div key={fret} className="flex-1 flex justify-center items-center relative h-full">
                              {/* Fret wire */}
                              {fret > 0 && <div className="absolute right-0 w-[2px] h-[150%] bg-zinc-700/30 z-0" />}
                              
                              {/* Note Marker - static, no real-time detection */}
                              {isInScale && (
                                <div className="w-5 h-5 rounded-full flex items-center justify-center bg-amber-500/20 border border-amber-500/40 z-10">
                                  <span className="text-[9px] font-bold text-amber-500/80">{scaleDegreeIndex + 1}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
                )}
              </div>

              {/* Harmonics Detection Log */}
              {harmonicsLog.length > 0 && (
              <div className="bg-zinc-900/50 border border-orange-500/20 rounded-2xl overflow-hidden shrink-0">
                <button onClick={() => setHarmonicsLog([])} className="w-full p-3 border-b border-zinc-800 bg-zinc-900/80 flex items-center justify-between hover:bg-zinc-800/80 transition-colors">
                  <h3 className="text-orange-400 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                    🎵 {lang === 'he' ? `יומן הרמוניות (${harmonicsLog.length})` : `Harmonics Log (${harmonicsLog.length})`}
                  </h3>
                  <span className="text-zinc-500 text-xs">{lang === 'he' ? 'נקה' : 'Clear'}</span>
                </button>
                <div className="max-h-32 overflow-y-auto p-2 flex flex-col gap-1">
                  {harmonicsLog.map((entry, i) => (
                    <div key={i} className="text-[10px] font-mono text-orange-400/70 bg-orange-950/20 rounded px-2 py-1 flex flex-wrap gap-2">
                      <span className="text-zinc-500">{entry.time}</span>
                      <span className="text-orange-400">{entry.phase}</span>
                      <span>exp:<span className="text-amber-400">{entry.expected}</span></span>
                      <span>got:<span className="text-red-400">{entry.detected}</span></span>
                      <span className="text-zinc-500">{entry.cents > 0 ? '+' : ''}{entry.cents}c</span>
                      {entry.freq && <span className="text-zinc-500">{entry.freq}Hz</span>}
                      {entry.reason && <span className="text-zinc-600">[{entry.reason}]</span>}
                    </div>
                  ))}
                </div>
              </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 shrink-0">
              <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-2xl">
                <div className="text-[10px] text-zinc-500 mb-1 uppercase font-bold tracking-widest">{txt.metrics.space}</div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-1"><div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${liveMetrics.space}%` }} /></div>
                <div className="text-[10px] text-blue-400 font-bold">{liveMetrics.space > 50 ? txt.spaceGood : txt.spaceLack}</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-2xl">
                <div className="text-[10px] text-zinc-500 mb-1 uppercase font-bold tracking-widest">{txt.metrics.legato}</div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-1"><div className="h-full bg-green-500 transition-all duration-300" style={{ width: `${liveMetrics.stability}%` }} /></div>
                <div className="text-[10px] text-green-400 font-bold">{liveMetrics.stability > 80 ? txt.legatoStable : txt.legatoSearch}</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-2xl">
                <div className="text-[10px] text-zinc-500 mb-1 uppercase font-bold tracking-widest">{txt.metrics.mic}</div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-1"><div className="h-full bg-amber-500 transition-all duration-100" style={{ width: `${Math.min(100, liveMetrics.volume * 2)}%` }} /></div>
                <div className="text-[10px] text-amber-400 font-bold">{txt.micActive}</div>
              </div>
            </div>
          )}

          {/* Audio Waveform Visualization */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden flex flex-col shrink-0">
            <div className="p-4 border-b border-zinc-800 bg-zinc-900/50">
              <h2 className="font-bold text-md text-zinc-400">Live Audio</h2>
            </div>
            <div className="h-32 bg-black/40 flex items-end gap-[1px] px-1 py-2">
              {Array.from(audioData).filter((_, i) => i % 6 === 0).map((v, i) => (
                <div key={i} className="flex-1 bg-amber-500/40 rounded-t-sm transition-all duration-75" style={{ height: `${(v/255)*100}%` }} />
              ))}
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
