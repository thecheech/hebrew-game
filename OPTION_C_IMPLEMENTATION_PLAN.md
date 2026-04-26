# Option C: Hybrid Audio Scoring Implementation

## Overview

**What changes:**
1. During recording: UI shows progress cursor (no real-time scoring, no VAD distraction)
2. After stop: Submit student audio + reference audio to backend API
3. Backend analyzes both in ~2-3 seconds using Python (librosa + DTW alignment)
4. Return detailed word-level scores + visualizations

**Key benefit:** Student maintains continuity while singing; accurate results after.

---

## Architecture

```
┌─ Frontend (React/Next.js) ─────────────────────┐
│                                                 │
│  ParashaLeadMode (modified)                    │
│  ├─ Record phase: MicPitchEngine captures      │
│  ├─ UI shows simple progress (no scoring)      │
│  └─ On stop: GET reference audio + POST        │
│             student audio to /api/analyze      │
│                                                 │
└────────────────────┬────────────────────────────┘
                     │ 
                POST /api/parasha/analyze
                (student audio blob + ref path)
                     │
                     ▼
┌─ Backend (Next.js API Route) ──────────────────┐
│                                                 │
│  /app/api/parasha/analyze/route.ts             │
│  ├─ Save student audio to temp file            │
│  ├─ Spawn Python subprocess                    │
│  └─ Return scores JSON                         │
│                                                 │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
┌─ Analysis (Python script) ─────────────────────┐
│                                                 │
│  scripts/analyze_audio.py                      │
│  ├─ Load both audio files                      │
│  ├─ Extract f0 curves (librosa/essentia)       │
│  ├─ DTW align student → reference              │
│  ├─ Detect word boundaries from alignment      │
│  ├─ Score each word (pitch + timing)           │
│  └─ Output JSON with per-word scores           │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Phase 1: Frontend Modifications

### 1.1 Update `ParashaLeadMode` Component

**Key changes:**

```typescript
// Instead of: const [snapshot, setSnapshot] = useState<LeadModeSnapshot | null>(null);

// Add:
const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'analyzing' | 'done'>('idle');
const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null);
const [analysisResults, setAnalysisResults] = useState<AnalysisResult | null>(null);

// Remove real-time scoring while recording
// Keep: mic recording, cursor position, but DON'T use LeadModeEngine for scoring
```

### 1.2 Update Recording Flow

**During recording:**
```typescript
// Show simple progress bar
<div className="space-y-2">
  <p>Reading: {cursorWord?.text} ({cursor}/{flatWords.length})</p>
  <div className="h-2 bg-muted rounded">
    <div 
      style={{ width: `${(cursor / flatWords.length) * 100}%` }}
      className="h-full bg-primary transition-all"
    />
  </div>
  <p className="text-xs text-muted-foreground">Keep reading at your own pace...</p>
</div>
```

**Manual cursor control (optional but recommended):**
```typescript
// Let user tap words to re-anchor cursor if they fall behind
// Or use space-bar to manually advance
// Remove automatic VAD-based advancement
```

### 1.3 Handle Stop & Submit

```typescript
const handleStop = async () => {
  micRef.current?.stop();
  setRecordingState('analyzing');
  
  // Get the recorded audio blob
  const audioBlob = micRef.current?.getRecordingBlob();
  if (!audioBlob) return;
  
  setRecordedAudio(audioBlob);
  
  // Submit to backend
  const formData = new FormData();
  formData.append('student', audioBlob);
  formData.append('aliyaNum', aliya.aliyaNum);
  formData.append('parasha', aliya.parasha);
  
  try {
    const res = await fetch('/api/parasha/analyze', {
      method: 'POST',
      body: formData,
    });
    
    if (!res.ok) throw new Error('Analysis failed');
    const results = await res.json() as AnalysisResult;
    setAnalysisResults(results);
    setRecordingState('done');
  } catch (e) {
    setError(e instanceof Error ? e.message : 'Unknown error');
  }
};
```

### 1.4 Display Results After Analysis

```typescript
{analysisResults && (
  <AnalysisResultsCard
    results={analysisResults}
    aliya={aliya}
    scrollStyle={scrollStyle}
  />
)}
```

---

## Phase 2: Backend API Route

### 2.1 Create `/app/api/parasha/analyze/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const execFileAsync = promisify(execFile);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const studentBlob = formData.get('student') as Blob;
    const aliyaNum = formData.get('aliyaNum') as string;
    const parasha = formData.get('parasha') as string;
    
    if (!studentBlob) {
      return NextResponse.json(
        { error: 'Missing student audio' },
        { status: 400 }
      );
    }
    
    // Save student audio to temp file
    const tempDir = os.tmpdir();
    const studentPath = path.join(tempDir, `student_${Date.now()}.wav`);
    const buffer = Buffer.from(await studentBlob.arrayBuffer());
    await fs.writeFile(studentPath, buffer);
    
    // Reference audio path
    const refPath = path.join(
      process.cwd(),
      `public/parasha/${parasha.toLowerCase()}/audio/aliya${aliyaNum}.mp3`
    );
    
    // Path to analysis script
    const scriptPath = path.join(process.cwd(), 'scripts/analyze_audio.py');
    
    // Run Python analysis
    const { stdout } = await execFileAsync('python3', [
      scriptPath,
      studentPath,
      refPath,
      aliyaNum,
      parasha,
    ], {
      timeout: 30000, // 30 second timeout
    });
    
    // Parse results
    const results = JSON.parse(stdout);
    
    // Cleanup temp file
    await fs.unlink(studentPath);
    
    return NextResponse.json(results);
  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Analysis failed',
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
      },
      { status: 500 }
    );
  }
}
```

---

## Phase 3: Python Analysis Script

### 3.1 Create `scripts/analyze_audio.py`

```python
#!/usr/bin/env python3
"""
Audio analysis script for Hebrew chanting evaluation.

Usage:
  python3 analyze_audio.py <student_wav> <reference_mp3> <aliya_num> <parasha>

Output: JSON with per-word scores to stdout
"""

import sys
import json
import numpy as np
import librosa
from scipy.spatial.distance import euclidean
from scipy.signal import correlate
from dtaidistance import dtw

def extract_f0(audio_path, sr=16000, hop_length=512):
    """
    Extract fundamental frequency (f0) contour using librosa.
    
    Returns:
      f0_hz: array of f0 values in Hz (with 0 for unvoiced frames)
      times: corresponding time stamps
    """
    y, sr = librosa.load(audio_path, sr=sr)
    
    # Use librosa's piptrack F0 estimator or pyin
    f0, voiced_flag, voiced_probs = librosa.pyin(
        y, 
        fmin=50, 
        fmax=400,
        sr=sr, 
        hop_length=hop_length,
        trough_threshold=0.1
    )
    
    times = librosa.frames_to_time(np.arange(len(f0)), sr=sr, hop_length=hop_length)
    
    return f0, times, sr, hop_length

def f0_to_semitones(f0_hz, reference_f0=100):
    """
    Convert Hz to semitones relative to a reference frequency.
    """
    # Avoid log(0)
    f0_hz = np.where(f0_hz > 0, f0_hz, np.nan)
    semitones = 12 * np.log2(f0_hz / reference_f0)
    return semitones

def dtw_alignment(signal1, signal2):
    """
    Dynamic Time Warping alignment.
    Returns path (indices into both signals).
    """
    cost_matrix = dtw.accelerated_dtw(signal1, signal2)
    # Extract path (simplified; you may want a full DTW implementation)
    return cost_matrix

def word_boundary_detection(student_f0, ref_f0, student_times, ref_times, word_boundaries):
    """
    Map reference word boundaries to student audio using DTW alignment.
    
    Args:
      student_f0, ref_f0: f0 contours
      student_times, ref_times: time arrays
      word_boundaries: list of (start_time, end_time) from reference audio
    
    Returns:
      list of (start_idx, end_idx) for student audio
    """
    # Simplified: for each reference word boundary, find corresponding student indices
    # In practice, you'd use full DTW path to map times
    
    student_boundaries = []
    for ref_start, ref_end in word_boundaries:
        # Find closest student time indices
        start_idx = np.argmin(np.abs(student_times - ref_start))
        end_idx = np.argmin(np.abs(student_times - ref_end))
        student_boundaries.append((start_idx, end_idx))
    
    return student_boundaries

def score_word(student_contour, ref_contour):
    """
    Score a single word's pitch contour.
    
    Returns:
      mae_semitones: Mean Absolute Error in semitones
      timing_ratio: Duration ratio (student / reference)
    """
    if len(student_contour) == 0 or len(ref_contour) == 0:
        return {'mae': float('inf'), 'timing_ratio': 0, 'verdict': 'red'}
    
    # Resample both to same length for comparison
    min_len = min(len(student_contour), len(ref_contour))
    student_resampled = np.interp(
        np.linspace(0, 1, 20),
        np.linspace(0, 1, len(student_contour)),
        student_contour[:min_len]
    )
    ref_resampled = np.interp(
        np.linspace(0, 1, 20),
        np.linspace(0, 1, len(ref_contour)),
        ref_contour[:min_len]
    )
    
    # Mean Absolute Error (ignoring NaNs)
    mask = ~(np.isnan(student_resampled) | np.isnan(ref_resampled))
    if not mask.any():
        mae = float('inf')
    else:
        mae = np.mean(np.abs(student_resampled[mask] - ref_resampled[mask]))
    
    # Verdict thresholds (same as frontend)
    if not np.isfinite(mae):
        verdict = 'red'
    elif mae <= 2.0:
        verdict = 'green'
    elif mae <= 4.0:
        verdict = 'yellow'
    else:
        verdict = 'red'
    
    return {
        'mae': float(mae),
        'verdict': verdict,
    }

def main():
    if len(sys.argv) < 5:
        print(json.dumps({'error': 'Missing arguments'}), file=sys.stderr)
        sys.exit(1)
    
    student_path = sys.argv[1]
    ref_path = sys.argv[2]
    aliya_num = sys.argv[3]
    parasha = sys.argv[4]
    
    try:
        # Extract f0 from both
        student_f0, student_times, sr, hop = extract_f0(student_path)
        ref_f0, ref_times, _, _ = extract_f0(ref_path, sr=sr)
        
        # Estimate tonic from reference
        ref_voiced = ref_f0[ref_f0 > 0]
        if len(ref_voiced) > 0:
            tonic_hz = np.median(ref_voiced)
        else:
            tonic_hz = 100
        
        # Convert to semitones
        student_semitones = f0_to_semitones(student_f0, tonic_hz)
        ref_semitones = f0_to_semitones(ref_f0, tonic_hz)
        
        # DTW alignment (simplified version)
        # In production, use full DTW path mapping
        
        # For now: assume word boundaries from reference, map to student
        # This is where you'd parse the aliya JSON to get word times
        # STUB: would load from /public/parasha/{parasha}/aliya{aliya_num}.json
        
        word_scores = []
        # Iterate through words, score each
        # STUB: needs actual word boundary data
        
        result = {
            'status': 'success',
            'aliya_num': aliya_num,
            'parasha': parasha,
            'tonic_hz': float(tonic_hz),
            'student_duration': float(student_times[-1]),
            'reference_duration': float(ref_times[-1]),
            'word_scores': word_scores,
        }
        
        print(json.dumps(result, indent=2))
        
    except Exception as e:
        result = {'error': str(e)}
        print(json.dumps(result), file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
```

---

## Phase 4: Results Display Component

### 4.1 Create `components/analysis-results-card.tsx`

```typescript
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AnalysisResult, AliyaData } from '@/lib/parasha-types';
import { cn } from '@/lib/utils';

interface AnalysisResultsCardProps {
  results: AnalysisResult;
  aliya: AliyaData;
  scrollStyle: boolean;
}

export function AnalysisResultsCard({
  results,
  aliya,
  scrollStyle,
}: AnalysisResultsCardProps) {
  const wordScores = results.word_scores || [];
  const greenCount = wordScores.filter(s => s.verdict === 'green').length;
  
  return (
    <Card className="border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20">
      <CardHeader>
        <CardTitle className="text-emerald-700 dark:text-emerald-300">
          Analysis Complete
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded bg-white/50 p-3 text-center dark:bg-white/5">
            <p className="text-xs text-muted-foreground">Accuracy</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {greenCount}/{wordScores.length}
            </p>
          </div>
          <div className="rounded bg-white/50 p-3 text-center dark:bg-white/5">
            <p className="text-xs text-muted-foreground">Duration</p>
            <p className="text-sm font-mono">
              {results.student_duration.toFixed(1)}s /
              {results.reference_duration.toFixed(1)}s
            </p>
          </div>
          <div className="rounded bg-white/50 p-3 text-center dark:bg-white/5">
            <p className="text-xs text-muted-foreground">Tonic</p>
            <p className="text-sm font-mono">{results.tonic_hz.toFixed(0)} Hz</p>
          </div>
        </div>
        
        {/* Word-by-word breakdown */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Word Scores</h4>
          <div className="space-y-1 rounded bg-white/30 p-2 dark:bg-white/5">
            {aliya.verses.map((verse) => (
              <div key={verse.ref}>
                <p className="text-xs font-mono text-muted-foreground">Gen {verse.ref}</p>
                <p className="font-hebrew text-sm">
                  {verse.words.map((word, idx) => {
                    const score = wordScores[idx]; // Simplified indexing
                    const verdictClass =
                      score?.verdict === 'green'
                        ? 'bg-emerald-500/20 text-emerald-700'
                        : score?.verdict === 'yellow'
                          ? 'bg-amber-500/20 text-amber-700'
                          : 'bg-rose-500/20 text-rose-700';
                    
                    return (
                      <span
                        key={idx}
                        className={cn('rounded px-1', verdictClass)}
                        title={score ? `Error: ${score.mae.toFixed(2)} semitones` : ''}
                      >
                        {scrollStyle ? word.plain : word.text}
                      </span>
                    );
                  })}
                </p>
              </div>
            ))}
          </div>
        </div>
        
        {/* Action buttons */}
        <div className="flex gap-2">
          <button className="rounded bg-primary px-3 py-1.5 text-sm text-white">
            Retry
          </button>
          <button className="rounded border px-3 py-1.5 text-sm">
            Download Report
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## Implementation Phases

### Phase 1: Frontend UI Changes (1-2 days)
- [ ] Modify `ParashaLeadMode` to disable real-time scoring
- [ ] Add recording state machine (idle → recording → analyzing → done)
- [ ] Create results display card
- [ ] Test mic recording & audio blob capture

### Phase 2: Backend API (1 day)
- [ ] Create `/app/api/parasha/analyze` route
- [ ] Handle file uploads, temp storage, subprocess calls
- [ ] Error handling & logging

### Phase 3: Python Analysis (2-3 days)
- [ ] Install `librosa`, `scipy`, `dtaidistance`
- [ ] Implement F0 extraction with librosa.pyin
- [ ] Implement basic DTW alignment
- [ ] Word boundary mapping
- [ ] Per-word scoring logic
- [ ] Load word times from aliya JSON

### Phase 4: Integration & Polish (1-2 days)
- [ ] Connect frontend to API
- [ ] Handle latency gracefully (show spinner)
- [ ] Test end-to-end
- [ ] Add playback with pitch overlay (optional)

---

## Dependencies to Add

### Python
```bash
pip install librosa scipy dtaidistance essentia numpy
```

### Node.js
```bash
npm install --save-dev @types/node ts-node
```

---

## Key Decisions

1. **F0 Extraction**: Use `librosa.pyin` (better than piptrack, works with singing)
2. **Alignment**: Start simple (time-based mapping), upgrade to full DTW if needed
3. **Scoring**: Reuse existing thresholds (green ≤2.0 st, yellow ≤4.0 st)
4. **Storage**: Temp files only (clean up after analysis)
5. **Timeout**: 30 seconds max per request (should analyze in 2-5s)

---

## Testing Checklist

- [ ] Record student audio successfully
- [ ] API receives and processes submission
- [ ] Python script runs without errors
- [ ] Scores returned and displayed
- [ ] Word colors match verdict (green/yellow/red)
- [ ] Latency acceptable (<5 seconds typical)
- [ ] Handles edge cases (very short/long audio, silence, etc.)
- [ ] Cleanup (temp files deleted)

---

## Fallback Strategies

If analysis fails:
1. Return `error` in JSON response
2. Show error message on frontend
3. Let user retry
4. Optional: Fall back to simpler time-based analysis without DTW

If latency too high:
1. Cache reference f0 extractions
2. Run analysis in worker thread (not blocking API)
3. Use simpler algorithm (MAE without DTW)

---

## Future Enhancements

- Playback with pitch contour overlay
- Phoneme-level scoring (if Hebrew phoneme data available)
- Historical score tracking
- Export report with audio + annotations
- Real-time streaming analysis (gRPC) for faster feedback
