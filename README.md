# Smart Practice - Music Training Assistant

A real-time, AI-powered music practice system with narrative feedback, interactive guitar fretboard visualization, and scale progression tracking.

## 🚀 Quick Start

```bash
# Navigate to project
cd /Users/yosi.konigsberg/Desktop/enzoAI/y-y-y

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will open at http://localhost:3000

## ✨ Features Working Now

- 🎵 **Real-time Pitch Detection** - Advanced autocorrelation-based note recognition
- 🎸 **Interactive Fretboard** - Visual guitar fretboard with scale tracking
- 🎯 **Progressive Scale Training** - Discover and unlock scale notes sequentially
- ⏱️ **Session Timer** - Track practice time for different exercises
- 📝 **Practice Journal** - Document notes and methodological decisions (stored in memory)
- 🌍 **Bilingual UI** - Full Hebrew/English support with RTL
- 📊 **Real-time Metrics** - Track space, legato, stability

## 🎵 Audio Technology

This app uses **zero external audio libraries** - everything runs on browser-native APIs:
- **Web Audio API** - Real-time analysis & FFT
- **MediaRecorder API** - Audio recording
- **Custom Autocorrelation** - Pitch detection algorithm

**📖 See [AUDIO_LIBS.md](./AUDIO_LIBS.md)** for complete audio documentation including:
- How pitch detection works
- Audio data flow diagrams
- Performance optimization tips
- Browser compatibility matrix

## 🔧 Current Configuration

**Firebase**: Disabled (data stored in browser memory only)  
**Gemini AI**: Optional (add API key to enable AI feedback)

### To Enable AI Feedback (Optional)

1. Get a Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create `.env` file:
```bash
cp .env.example .env
```
3. Add your API key:
```
VITE_GEMINI_API_KEY=your_api_key_here
```

## 📖 How to Use

### Grant Microphone Access
When you first open the app, your browser will ask for microphone permission. Click "Allow".

### Scale Practice Mode

1. Click **"Scale Note Discovery"** in the left sidebar
2. Select your **root note** (e.g., C, D, E...)
3. Select your **mode** (Ionian/Major, Dorian, etc.)
4. **Play the highlighted note** on your instrument
5. The fretboard shows:
   - **Pulsing amber dots** = Target notes to discover
   - **Green glow** = You're playing the correct note!
   - **Gray dots** = Already unlocked notes

### Practice Journal

- **Method Decision**: Document methodological choices
- **General Note**: Track improvement areas
- All notes persist during your session (cleared on refresh)

### AI Coaching (requires API key)

- **Auto-Coach**: Continuous feedback every 45 seconds
- **Manual Record**: Click microphone to analyze specific segments

## 🔮 Future Enhancements

When you're ready to add persistence:

1. Set `FIREBASE_ENABLED = true` in `src/config/firebase.js`
2. Uncomment the Firebase initialization code
3. Add Firebase config to `.env`
4. Update App.jsx to use Firebase hooks

## 🛠 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## 🎹 Practice Sections

1. **Open Triads** (20 min) - Conscious stuttering and space
2. **Drone & Ear Training** (5 min) - Singing numbers and internal hearing
3. **Scale Note Discovery** (12 min) - Describing notes and phrasing
4. **Big Time Mapping** (8 min) - Precision on 1, 2, 3, 4

## 📝 Notes

- Data is stored in memory only (no Firebase)
- Practice journal resets on page refresh
- Microphone access required for all features
- AI feedback requires Gemini API key (optional)

---

Built with React 18, Vite, Tailwind CSS, and Web Audio API
