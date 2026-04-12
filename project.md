# VoxTrainer — Learn to Sing from Zero

A browser-based vocal training webapp that takes users from "I can't sing" to accurate pitch control, built on the neurocognitive vocal pedagogy framework from the Gemini deep research.

---

## Architecture Overview

### Frontend (Browser)
- **Framework**: React + Vite (fast dev, good ecosystem for audio/canvas work)
- **Audio Input**: Web Audio API (`getUserMedia`) — USB-C dynamic mic (clean signal, no gain hiss)
- **Pitch Detection (real-time)**: `pitchy` library (autocorrelation-based, runs in AudioWorklet) — good enough for real-time feedback from a clean mic input. No need for pYIN complexity on live input since the dynamic mic gives us a strong signal.
- **Visualization**: HTML Canvas — scrolling piano-roll pitch display (target note as horizontal band, user pitch as trailing line)
- **State/Progress**: IndexedDB via `idb` — all user data stays local (range profile, session history, accuracy trends)

### Backend (Python, local)
- **Framework**: FastAPI
- **Purpose**: Handles the heavy ML workload for the sing-along feature only. The core training exercises run entirely in-browser.
- **Vocal Isolation**: BS-RoFormer (Viperx-1297 weights) via `audio-separator` or `bs-roformer-infer`
- **De-reverb pass**: anvuew Mel Roformer dereverb (sterilize isolated vocals for clean pitch extraction)
- **Pitch Extraction (offline)**: SwiftF0 (`pip install swift-f0`) — extracts F0 contour from isolated vocals, outputs note segments
- **GPU**: Targets NVIDIA GPU with CUDA. Chunk size ~352800 samples, overlap 0.90+

### Data Flow

```
[Core Training — browser only]
USB Mic → Web Audio API → AudioWorklet (pitchy) → pitch in Hz
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

---

## Research Documents
- `singingdeepresearch.md` — Neurocognitive vocal pedagogy framework. Covers pitch detection algorithms, psychoacoustic tolerance, 4-stage curriculum, UI/UX feedback design. **This is the pedagogical backbone.**
- `vocal isolation open source deep research for my use case.md` — Comprehensive analysis of open-source vocal isolation models. Concludes BS-RoFormer (Viperx-1297) is SOTA at 11.89 dB SDR. SwiftF0 is SOTA for pitch estimation at 90.2% accuracy with 95k params. **This drives the sing-along feature architecture.**

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
| Frontend framework | React + Vite | Fast HMR, good canvas/audio ecosystem |
| Audio capture | Web Audio API | Browser-native, low latency with AudioWorklet |
| Real-time pitch detection | pitchy (AudioWorklet) | Lightweight, accurate on clean mic input |
| Visualization | HTML Canvas 2D | Direct pixel control for scrolling pitch display |
| Local storage | IndexedDB (via idb) | Structured data, no server needed for progress |
| Backend framework | FastAPI | Async, fast, Python-native for ML libs |
| Vocal isolation | BS-RoFormer (audio-separator) | SOTA 11.89 dB SDR, phase-preserving |
| De-reverb | Mel Roformer dereverb | Strips studio effects for clean pitch extraction |
| Offline pitch extraction | SwiftF0 | SOTA 90.2% accuracy, 95k params, CPU-fast |
| Audio synthesis/playback | Tone.js or Web Audio API | Schedule precise playback of exercise tones |

---

## Resolved Decisions
- **Tone generation**: Pure sine wave by default. Piano samples available as a toggle in settings.
- **Note labeling**: Off by default (purely visual). Toggle in settings to show note names (C4, D4, etc.). Separate toggle to show pitch in Hz.
- **Sing-along caching**: Yes — cache processed songs. Save instrumental audio, isolated vocal audio, and note map in a structured format. Avoid reprocessing.
- **Gamification**: Deferred to much later. Keep the UI clean and functional for now.

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

## Open Questions
- (none currently)

## Changelog
- **Phase 1 complete** — Audio foundation: mic capture, pitch detection (pitchy), scrolling canvas visualizer, note/Hz readout, cents deviation display.
- **Phase 1 fix round 1** — Default range lowered to C2, range selectors added, grid line opacity increased, clarity threshold tuned (0.9→0.85, amplitude floor 0.01→0.005) to fix premature cutoff.
- **Phase 1 fix round 2** — fftSize 2048→4096 for reliable low-pitch detection (down to A1). Scale selector with root note picker. HiDPI canvas rendering fixed. Canvas viewport increased to 65vh.

---

## Project Structure (planned)
```
voxtrainer/
  frontend/
    src/
      components/       # React components
      audio/            # AudioWorklet processors, pitch detection
      engine/           # Exercise logic, curriculum state machine
      viz/              # Canvas rendering (pitch display, spectrogram)
      stores/           # State management + IndexedDB persistence
    public/
      samples/          # Reference audio samples for exercises
  backend/
    app/
      main.py           # FastAPI entry
      routers/
        separation.py   # Upload + vocal isolation endpoint
        pitch.py        # Pitch extraction endpoint
      services/
        separator.py    # BS-RoFormer + dereverb pipeline
        pitch.py        # SwiftF0 wrapper
      models/           # Downloaded model weights (gitignored)
```
