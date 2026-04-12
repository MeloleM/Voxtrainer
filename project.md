# VoxTrainer — Learn to Sing from Zero

A browser-based vocal training webapp that takes users from "I can't sing" to accurate pitch control, built on the neurocognitive vocal pedagogy framework from the Gemini deep research.

**GitHub**: https://github.com/MeloleM/Voxtrainer.git (push to main for each phase/fix)

---

## Architecture Overview

### Frontend (Browser)
- **Framework**: React + Vite + TypeScript
- **Audio Input**: Web Audio API (`getUserMedia`) — USB-C dynamic mic (clean signal, no gain hiss)
- **Pitch Detection (real-time)**: `pitchy` library (autocorrelation-based) — good enough for real-time from clean mic. fftSize=4096 for low-pitch accuracy down to A1.
- **Visualization**: HTML Canvas 2D — scrolling piano-roll pitch display (target note as horizontal band, user pitch as trailing cyan line)
- **State/Progress**: IndexedDB via `idb` — all user data stays local (range profile, session history, accuracy trends)

### Backend (Python, local — for sing-along feature only)
- **Framework**: FastAPI
- **Vocal Isolation**: BS-RoFormer (Viperx-1297 weights) via `audio-separator` or `bs-roformer-infer`
- **De-reverb pass**: anvuew Mel Roformer dereverb
- **Pitch Extraction (offline)**: SwiftF0 (`pip install swift-f0`) — extracts F0 contour, outputs note segments
- **GPU**: Targets NVIDIA GPU with CUDA. Chunk size ~352800 samples, overlap 0.90+

### Data Flow

```
[Core Training — browser only]
USB Mic → Web Audio API (fftSize 4096) → pitchy autocorrelation → pitch in Hz
    → Canvas renderer (scrolling pitch line vs target)
    → Exercise engine (tolerance check, progression logic)
    → IndexedDB (session results, range profile)

[Sing-Along Feature — browser + backend]
User uploads MP3/FLAC → FastAPI backend
    → BS-RoFormer (vocal isolation, GPU)
    → Mel Roformer dereverb (sterilize)
    → SwiftF0 (F0 extraction → note map JSON)
    → Return: instrumental audio + note map
Browser receives:
    → Plays instrumental track
    → Scrolling note display (Synthesia-style, notes approach from right)
    → Real-time mic pitch vs note map comparison
    → Accuracy score (per-note cents deviation + overall %)
```

---

## Hardware Assumptions
- **Mic**: Decent USB-C dynamic microphone (clean signal, no phantom power noise)
- **GPU**: NVIDIA with CUDA support (for sing-along backend processing)
- **Browser**: Modern Chromium-based (best Web Audio API support)
- **Monitor**: User has 2K monitor — canvas viewport set to 65vh min-height, HiDPI rendering enabled

---

## Research Documents
- `singingdeepresearch.md` — Neurocognitive vocal pedagogy framework. Covers pitch detection algorithms, psychoacoustic tolerance, 4-stage curriculum, UI/UX feedback design. **Pedagogical backbone.** Pharma section excluded from product.
- `vocal isolation open source deep research for my use case.md` — Analysis of open-source vocal isolation models. BS-RoFormer (Viperx-1297) is SOTA at 11.89 dB SDR. SwiftF0 is SOTA for pitch estimation at 90.2% accuracy with 95k params. **Drives the sing-along feature.**

---

## Curriculum Design (from research)

### Psychoacoustic Tolerance Thresholds
| Level | Acceptable Deviation | Feedback Style |
|-------|---------------------|----------------|
| Beginner | +/- 25-30 cents | Encouraging, focus on breath |
| Intermediate | +/- 10-15 cents | Specific correction (flat/sharp) |
| Advanced | +/- 0-5 cents | Precision feedback |

### Stage 1: Zero to Sustained Pitch Matching (MVP)
1. **Vocal Diagnostic** — range test (find lowest/highest comfortable notes) + pitch accuracy assessment
2. **Breath Trainer** — sustain timer with volume consistency visualization (steady exhale = straight line, weak breath = chaotic sine wave)
3. **Glissando/Siren Exercise** — for users who can't match a single pitch: slide from high to low, find the target note by visual intersection
4. **Single Note Matching** — hold pitch within tolerance of target for 3-5 seconds. Use "ee" or "ah" vowels.
5. **Directional Compensation** — if consistently flat, prompt "Gee" sound; if consistently sharp, prompt "Gug" sound

### Stage 2: Interval Navigation & VPI (MVP)
1. **Stepwise Motion** — scale degrees (1-2-3-2-1), track clean transitions vs lazy sliding
2. **Interval Drills** — major/minor/perfect intervals, systematic
3. **Mute-Track Protocol** — play guide, mute for N bars, reveal drift on return. Counters karaoke dependency.
4. **Harmonic Independence** — play chord, remove one note, user sings missing interval

### Stage 3: Range Expansion (Post-MVP)
- SOVT exercises (lip trills, straw phonation)
- Vowel modification through passaggio
- Spectrographic formant display

### Stage 4: Agility & Style (Post-MVP)
- Riffs/runs with tempo scaling
- Vibrato training (sine wave overlay)
- Phonation targeting (breathy to belt)

---

## MVP Feature Set

### Core Training (browser-only, no backend needed)
- [x] Audio input pipeline (Web Audio API + pitchy, fftSize 4096 for low-pitch accuracy)
- [x] Scrolling pitch visualizer (Canvas — piano roll with user pitch trailing line, HiDPI)
- [x] Settings: note labels toggle, Hz toggle, range selector (Low/High dropdowns, min 1 octave)
- [x] Scale selector (Chromatic, Major, Natural Minor, Pentatonic Maj/Min, Blues + root note)
- [ ] Vocal diagnostic (range test + pitch accuracy assessment)
- [ ] Breath trainer (volume/sustain consistency display)
- [ ] Glissando exercise (siren/slide to find target pitch visually)
- [ ] Single-note matching exercise (hold within tolerance for N seconds)
- [ ] Directional feedback (flat → "Gee", sharp → "Gug" prompts)
- [ ] Stepwise interval exercises (1-2-3-2-1 patterns)
- [ ] Interval drills (major, minor, perfect)
- [ ] Mute-track protocol (play → mute → reveal drift)
- [ ] Adaptive tolerance engine (starts at +/-30 cents, tightens as user improves)
- [ ] Progress tracking (IndexedDB — range profile, accuracy history, session logs)
- [ ] Feedback fade-out system (gradually reduce real-time feedback frequency to build internal reference)

### Sing-Along Feature (post-MVP, requires backend)
- [ ] Audio upload endpoint (accept FLAC, MP3, WAV, OGG)
- [ ] BS-RoFormer vocal isolation pipeline (GPU, chunked processing)
- [ ] De-reverb sterilization pass (Mel Roformer dereverb)
- [ ] SwiftF0 pitch extraction → note map JSON (timestamped note segments)
- [ ] Instrumental playback in browser (Web Audio API)
- [ ] Scrolling note display (Synthesia-style — notes scroll from right, hit zone on left)
- [ ] Real-time pitch comparison (user mic vs note map)
- [ ] Per-note accuracy grading (cents deviation + hit/miss)
- [ ] Overall accuracy score (percentage + breakdown)
- [ ] Interrupt support (score what's been sung so far)

---

## Tech Stack Summary

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend framework | React + Vite + TypeScript | Fast HMR, good canvas/audio ecosystem |
| Audio capture | Web Audio API | Browser-native, low latency |
| Real-time pitch detection | pitchy | Lightweight, accurate on clean mic input |
| Visualization | HTML Canvas 2D | Direct pixel control for scrolling pitch display |
| Local storage | IndexedDB (via idb) | Structured data, no server needed for progress |
| Backend framework | FastAPI | Async, fast, Python-native for ML libs |
| Vocal isolation | BS-RoFormer (audio-separator) | SOTA 11.89 dB SDR, phase-preserving |
| De-reverb | Mel Roformer dereverb | Strips studio effects for clean pitch extraction |
| Offline pitch extraction | SwiftF0 | SOTA 90.2% accuracy, 95k params, CPU-fast |
| Audio synthesis/playback | Tone.js or Web Audio API | Schedule precise playback of exercise tones |
| Design system | Spotify-inspired (adapted) | Dark immersive, pill geometry, compact type |

---

## Resolved Decisions
- **Tone generation**: Pure sine wave by default. Piano samples available as a toggle in settings.
- **Note labeling**: Off by default (purely visual). Toggle in settings to show note names (C4, D4). Separate toggle to show pitch in Hz.
- **Sing-along caching**: Yes — cache processed songs. Save instrumental audio, isolated vocal audio, and note map in a structured format. Avoid reprocessing.
- **Gamification**: Deferred to much later. Keep the UI clean and functional for now.
- **Pharma section**: Excluded from product entirely. Fascinating science but liability for consumer app.

## Sing-Along Cache Format (planned)
```
songs/
  {song-hash}/
    metadata.json       # song title, artist (if provided), duration, processing date
    instrumental.wav     # isolated instrumental track
    vocals.wav           # isolated vocal track
    notemap.json         # timestamped note segments from SwiftF0
```
`notemap.json` structure (per note segment):
```json
{
  "notes": [
    {
      "start_ms": 1200,
      "end_ms": 1850,
      "frequency_hz": 261.63,
      "midi_note": 60,
      "note_name": "C4",
      "confidence": 0.94
    }
  ]
}
```

## Development Process
- Human developer (melo) reviews and tests each significant feature before moving on.
- Stop and ask when unsure — no guessing, no half-baked implementations.
- Small incremental features, tested and validated before building on top.
- Commit and push to main after each phase or fix round.

---

## Design System: Spotify-Adapted

**Source**: `DESIGN.md` in project root (installed from VoltAgent/awesome-design-md via `npx getdesign@latest add spotify`)

**Adaptation for VoxTrainer**:
- Spotify Green (`#1ed760`) → VoxTrainer Cyan (`#1db4d7`) as functional accent
- All dark surfaces, pill geometry, heavy shadows, compact typography remain
- The accent is used ONLY functionally: active states, CTAs, pitch line glow

### Key Design Tokens (CSS variables in index.css)
```css
--bg-base: #121212        /* deepest background */
--bg-surface: #181818     /* cards, toolbar, header */
--bg-elevated: #1f1f1f    /* interactive surfaces, selects */
--bg-card: #252525        /* elevated card, hover states */
--accent: #1db4d7         /* CTAs, active states, pitch line */
--accent-hover: #17a0c0
--accent-muted: rgba(29, 180, 215, 0.15)
--text-primary: #ffffff
--text-secondary: #b3b3b3
--text-muted: #6a6a6a
--color-success: #1ed760  /* on-pitch */
--color-warning: #ffa42b  /* near-pitch */
--color-error: #f3727f    /* off-pitch */
--border-subtle: #2a2a2a
--radius-pill: 9999px     /* all buttons are pills */
--shadow-medium: rgba(0,0,0,0.3) 0px 8px 8px
--shadow-heavy: rgba(0,0,0,0.5) 0px 8px 24px
--font-sans: "Inter", "Segoe UI", Roboto, ...
--font-mono: "JetBrains Mono", "Fira Code", ui-monospace, ...
```

### Component Patterns
- **Buttons**: All pill-shaped (border-radius: 9999px). Primary = accent bg + dark text. Secondary = elevated bg + muted text.
- **Toggle pills**: Replace checkboxes. Active state = accent color + accent-muted bg.
- **Selects**: Pill-shaped, custom chevron SVG, no native appearance.
- **Toolbar**: Surface bg, rounded-lg, groups separated by thin vertical lines.
- **Pitch readout**: Surface card at bottom, large mono note + Hz + cents.
- **Canvas viewport**: Base bg, subtle border, medium shadow.

---

## CURRENT STATE — IN-PROGRESS REDESIGN

### What's done:
- `index.css` — REWRITTEN with full design token system (CSS variables)
- `App.css` — REWRITTEN with all new component classes (toolbar, pill buttons, toggle pills, pill selects, canvas viewport, pitch readout, header)

### What still needs to be done to finish the redesign:
1. **`App.tsx`** — needs new JSX structure:
   - `.app-header` with `.brand` (logo circle + title) and `.subtitle`
   - `.app-main` wrapping `<PitchDisplay />`
2. **`PitchDisplay.tsx`** — needs new JSX to use new CSS classes:
   - Replace `.controls` div with `.toolbar` using `.toolbar-group` and `.toolbar-separator`
   - Start/Stop button → `.btn-primary`
   - Note labels / Hz toggles → `.toggle-pill` (not checkboxes)
   - Range selects → `.pill-select` with `<span>` label
   - Scale/Root selects → `.pill-select`
   - Canvas wrapper → `.canvas-viewport`
   - Pitch readout → `.pitch-readout` with `.readout-note`, `.readout-detail`, `.readout-hz`, `.readout-cents` (classes: `.on-pitch`, `.near-pitch`, `.off-pitch`)
3. **`PitchVisualizer.ts`** — update canvas background color from `#1a1a2e` to `#121212` (match `--bg-base`), update pitch line color from `#4fc3f7` to `#1db4d7` (match `--accent`), update grid line label color to match new text tokens.
4. **Build, test, commit, push.**

### CSS class reference for the redesign (all defined in App.css):
- `.app` — root layout container
- `.app-header` — top bar (surface bg, rounded, shadow)
- `.app-header .brand` — logo + title group
- `.app-header .logo` — 32px accent circle
- `.app-main` — main content area
- `.toolbar` — controls bar (surface bg, rounded, shadow)
- `.toolbar-group` — flex group within toolbar
- `.toolbar-separator` — vertical divider line
- `.btn-primary` — accent pill button (Start Mic)
- `.btn-secondary` — dark pill button
- `.toggle-pill` — replaces checkbox toggles, `.active` class when on
- `.pill-select` — label + styled select dropdown
- `.canvas-viewport` — canvas container (65vh, rounded, shadow)
- `.pitch-readout` — bottom readout bar
- `.readout-note` — big note name
- `.readout-detail` — hz + cents stack
- `.readout-hz` — frequency display
- `.readout-cents` — cents display (add `.on-pitch`/`.near-pitch`/`.off-pitch`)

---

## Development Phases

### Phase 1: Audio Foundation ✅ COMPLETE
- React + Vite + TS scaffold
- AudioEngine (Web Audio API, fftSize 4096, echo/noise/AGC disabled)
- PitchDetector (pitchy, clarity 0.85, amplitude floor 0.005, freq range 50-1500 Hz)
- PitchVisualizer (scrolling piano-roll, HiDPI via DPR scaling, CSS-coord drawing)
- PitchDisplay component (controls, canvas, readout)
- Settings: note labels, Hz, range (Low/High), scale + root
- Tested by melo: works well, picks up down to A1, no noise, vibrato detected

### Phase 1.5: UI Redesign 🔄 IN PROGRESS
- Spotify-inspired design system adapted (see above)
- index.css and App.css rewritten
- **STILL NEED**: Update App.tsx JSX, PitchDisplay.tsx JSX, PitchVisualizer.ts colors

### Phase 2: Exercise Engine (NEXT)
1. Tone generator (sine wave, piano option in settings)
2. Vocal diagnostic (guided range test + pitch accuracy test)
3. Single-note matching (target band on visualizer, hold within tolerance)
4. Glissando/siren exercise (slide to find target)
5. Breath trainer (volume consistency)
6. Directional feedback (flat→"Gee", sharp→"Gug")

### Phase 3: Stage 2 Exercises
- Stepwise intervals, interval drills, mute-track protocol, harmonic independence

### Phase 4: Settings, Progress Tracking, Polish
- IndexedDB persistence, adaptive tolerance engine, feedback fade-out

### Phase 5: Sing-Along Backend + Frontend
- FastAPI + BS-RoFormer + SwiftF0 + Synthesia-style scrolling display

---

## Key Technical Details

### AudioEngine (`frontend/src/audio/AudioEngine.ts`)
- getUserMedia with echoCancellation: false, noiseSuppression: false, autoGainControl: false
- fftSize: 4096 (93ms window at 44.1kHz, ~6 cycles for C2 at 65 Hz)
- Returns AnalyserNode for PitchDetector to read from

### PitchDetector (`frontend/src/audio/PitchDetector.ts`)
- Uses pitchy's `PitchDetector.forFloat32Array(bufferSize)`
- Clarity threshold: 0.85 (was 0.9, lowered for better sensitivity)
- Amplitude floor: 0.005 (was 0.01, lowered to avoid premature cutoff)
- Frequency range: 50–1500 Hz
- Returns { frequency, clarity } or null

### PitchVisualizer (`frontend/src/viz/PitchVisualizer.ts`)
- Scrolling piano-roll: Y = MIDI note, X = time (newest on right)
- History: array of { midi, time } points, NaN = silence gap
- Uses `getBoundingClientRect()` for CSS-pixel dimensions (HiDPI aware)
- Grid: in-scale notes get bright lines, out-of-scale get very faint (0.04 opacity)
- Default range: MIDI 36–72 (C2–C5)
- Options: showNoteLabels, showHz, timeWindow (4s), scaleIntervals, rootNote
- **NEEDS UPDATE**: background `#1a1a2e` → `#121212`, pitch line `#4fc3f7` → `#1db4d7`

### noteUtils (`frontend/src/audio/noteUtils.ts`)
- frequencyToMidi, midiToFrequency, midiToNoteName, centsOffPitch
- VOCAL_RANGE: { low: 36 (C2), high: 84 (C6) }
- SCALES: Chromatic, Major, Natural Minor, Pentatonic Major, Pentatonic Minor, Blues
- isInScale(midi, rootNoteIndex, scaleIntervals)
- NOTE_NAMES exported

### User Testing Results
- Melo has deep voice, reaches A1 — detection works
- Vibrato detected and represented well
- No background noise picked up
- Clarity 0.85 + amplitude 0.005 = good sensitivity without noise
- Melo uses 2K monitor, zooms in — 65vh canvas + HiDPI helps

---

## Changelog
- **Phase 1 complete** — Audio foundation: mic capture, pitch detection (pitchy), scrolling canvas visualizer, note/Hz readout, cents deviation display.
- **Phase 1 fix round 1** — Default range lowered to C2, range selectors added, grid line opacity increased, clarity threshold tuned (0.9→0.85, amplitude floor 0.01→0.005) to fix premature cutoff.
- **Phase 1 fix round 2** — fftSize 2048→4096 for reliable low-pitch detection (down to A1). Scale selector with root note picker. HiDPI canvas rendering fixed. Canvas viewport increased to 65vh.
- **Phase 1.5 started** — Spotify design system installed and adapted. index.css + App.css fully rewritten with new design tokens and component classes. JSX updates pending.

---

## Project Structure (actual)
```
scratchpad-5/
  DESIGN.md                 # Spotify design system reference (from VoltAgent)
  project.md                # THIS FILE — master project doc
  singingdeepresearch.md    # Vocal pedagogy research
  vocal isolation open source deep research for my use case.md  # ML model research
  .gitignore
  frontend/
    index.html              # Title: "VoxTrainer"
    package.json            # deps: react, react-dom, pitchy, typescript, vite
    vite.config.ts
    tsconfig.json / tsconfig.app.json / tsconfig.node.json
    src/
      main.tsx              # React entry point
      index.css             # ✅ REWRITTEN — design tokens, base styles
      App.tsx               # ❌ NEEDS REDESIGN — new header/layout JSX
      App.css               # ✅ REWRITTEN — all component styles
      audio/
        AudioEngine.ts      # ✅ Mic capture, AnalyserNode (fftSize 4096)
        PitchDetector.ts    # ✅ pitchy wrapper (clarity 0.85, amp 0.005)
        noteUtils.ts        # ✅ Pitch/note math, scales, ranges
      components/
        PitchDisplay.tsx    # ❌ NEEDS REDESIGN — new toolbar/readout JSX
      viz/
        PitchVisualizer.ts  # ❌ NEEDS COLOR UPDATE — bg and pitch line colors
```
