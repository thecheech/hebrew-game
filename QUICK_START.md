# Option C Quick Start (5 minutes)

## Installation

```bash
# 1. Install Python dependencies (one-time)
pip install librosa scipy numpy

# 2. Verify installation
python3 -c "import librosa; print('✓ librosa installed')"

# 3. Start dev server
npm run dev

# 4. Test
# Open: http://localhost:3000/parasha/miketz
# Click: "Practice with mic"
# Click: "Practice"
# Speak 1-2 words
# Click: "Stop"
# Wait 2-5 seconds
# See results! 🎉
```

## File Checklist

```bash
# Verify all files exist:
✓ components/analysis-results-card.tsx
✓ components/parasha-lead-mode.tsx (modified)
✓ app/api/parasha/analyze/route.ts
✓ scripts/analyze_audio.py
✓ lib/pitch.ts (modified - has getPracticeBlob)
✓ lib/parasha-types.ts (modified - has AnalysisResult type)
```

## How It Works

1. **Practice** → User clicks "Practice", reads aloud, clicks "Stop"
2. **Upload** → Audio blob sent to backend API
3. **Analyze** → Python script extracts F0, maps words, scores each
4. **Display** → Results card shows green/yellow/red verdicts

## Configuration (Optional)

Edit scoring thresholds:
```python
# In scripts/analyze_audio.py, function score_word():
mae_threshold_green = 2.0   # Change to 1.5 for stricter
mae_threshold_yellow = 4.0  # Change to 3.0 for stricter
```

Edit F0 range:
```python
# In scripts/analyze_audio.py, function extract_f0():
f0, voiced_flag, voiced_probs = librosa.pyin(
    y,
    fmin=50,    # Min frequency (Hz)
    fmax=400,   # Max frequency (Hz)
    ...
)
```

## Deployment

### Vercel (Recommended)
```bash
git add .
git commit -m "Add Option C audio scoring"
git push origin main
# Vercel auto-deploys. Done!
```

### Self-hosted
1. Ensure Python 3.x is installed on server
2. Install librosa, scipy, numpy
3. Increase API timeout beyond 30s if needed
4. Deploy normally

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "ModuleNotFoundError: librosa" | `pip install librosa scipy numpy` |
| "Analysis takes >30s" | Optimize Python or increase timeout |
| "All red verdicts" | Lower thresholds in analyze_audio.py |
| "API returns 404" | Check reference audio exists at `/public/parasha/miketz/audio/` |
| "Mic / practice doesn't work" | Check browser allows microphone access |

## Testing

```bash
# Manual Python test
python3 scripts/analyze_audio.py \
  /path/to/student.wav \
  public/parasha/miketz/audio/aliya1.mp3 \
  1 \
  Miketz
```

## Next Steps

- [ ] Install Python deps
- [ ] Start dev server
- [ ] Test practice on `/parasha/miketz`
- [ ] Verify results display
- [ ] Deploy to production
- [ ] Monitor error logs

## Key Files

| File | Purpose |
|------|---------|
| `components/parasha-lead-mode.tsx` | Practice UI |
| `components/analysis-results-card.tsx` | Results display |
| `app/api/parasha/analyze/route.ts` | Backend API |
| `scripts/analyze_audio.py` | Analysis engine |

## Performance

- Capture: <1ms overhead
- Analysis: 2-5 seconds (mostly F0 extraction)
- Results display: Instant

## Support

See `IMPLEMENTATION_SUMMARY.md` for detailed docs  
See `SETUP_OPTION_C.md` for troubleshooting

---

**You're all set!** 🚀

Install Python deps and start the dev server.  
Test on http://localhost:3000/parasha/miketz  
Any issues? Check TROUBLESHOOTING above.
