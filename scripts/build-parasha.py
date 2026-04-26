#!/usr/bin/env python3
"""
Build script for parashat Miketz — triennial cycle 3, aliyot 1 & 7.

Reads from a cloned PocketTorah repo at <project>/external/pockettorah/.
If you don't have it yet, from the project root:
    git clone https://github.com/rneiss/PocketTorah external/pockettorah

Outputs into <project>/public/parasha/miketz/:
  - audio/aliya1.mp3, audio/aliya7.mp3   (sliced, only the verses we need)
  - aliya1.json, aliya7.json             (per-word + per-verse data)
  - index.json                            (aliyot listing, used by the page)

Triennial Y3 mapping:
  Aliya 1 = Gen 43:16-18 (3 verses, 56 words, sliced from Miketz-6.mp3)
  Aliya 7 = Gen 44:11-17 (7 verses, 96 words, sliced from Miketz-7.mp3)

Run:
    python3 scripts/build-parasha.py
"""
import json, subprocess
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
POCKET  = PROJECT / 'external/pockettorah/data'
OUT     = PROJECT / 'public/parasha/miketz'
OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'audio').mkdir(parents=True, exist_ok=True)

# --- Hebrew character classification ---
# Te'amim (cantillation marks) are U+0591..U+05AF except U+05BD METEG and U+05C0 PASEQ
# Nikud (vowel points) are roughly U+05B0..U+05BC, U+05BD METEG, U+05BF, U+05C1..U+05C2, U+05C7
TEAMIM = set(chr(c) for c in range(0x0591, 0x05B0)) - {chr(0x05AF)}  # exclude masora circle
TEAMIM.add(chr(0x05BD))  # METEG (technically a ga'ya, accentual)
NIKUD = set(chr(c) for c in range(0x05B0, 0x05C8)) - TEAMIM
NIKUD.discard(chr(0x05C0))  # PASEQ — keep as separator
SOF_PASUQ = chr(0x05C3)
ETNAHTA = chr(0x0591)
SEGOL = chr(0x0592)
SHALSHELET = chr(0x0593)
ZAQEF_QATAN = chr(0x0594)
ZAQEF_GADOL = chr(0x0595)
TIPEHA = chr(0x0596)
REVIA = chr(0x0597)

# Major disjunctives that mark phrase boundaries (kid-friendly, kept short)
PHRASE_BREAK_TEAMIM = {ETNAHTA, ZAQEF_QATAN, ZAQEF_GADOL, SEGOL, SHALSHELET}

def strip_slashes(s):
    """WLC uses '/' as morpheme separator; strip for display."""
    return s.replace('/', '')

def strip_teamim(s):
    return ''.join(c for c in s if c not in TEAMIM)

def strip_nikud(s):
    return ''.join(c for c in s if c not in NIKUD)

def consonants_only(s):
    """Plain text as it appears in a Torah scroll: consonants only, sof-pasuq stripped."""
    out = strip_teamim(strip_nikud(s))
    out = out.replace(SOF_PASUQ, '').replace(chr(0x05C0), '').replace(chr(0x05BE), ' ')
    return out

def detect_phrase_break(word):
    """Return one of: 'sof-pasuq', 'etnahta', 'zaqef', 'segol', 'shalshelet', or None."""
    if SOF_PASUQ in word: return 'sof-pasuq'
    if ETNAHTA in word: return 'etnahta'
    if ZAQEF_QATAN in word or ZAQEF_GADOL in word: return 'zaqef'
    if SHALSHELET in word: return 'shalshelet'
    if SEGOL in word: return 'segol'
    return None


# --- Transliteration (Sephardic-Israeli, kid-friendly) ---
# Conventions:
#   ח, כ, ך → "ch" (as in Bach)
#   צ, ץ    → "tz"     שׁ → "sh"   שׂ → "s"
#   א, ע    → silent (apostrophe inserted between adjacent vowels for clarity)
#   kamatz, patach → a   tsere, segol → e   chirik → i   holam → o   kubutz/shuruk → u
#   tsere + yod (mater) → "ei"   segol + yod → "e" (silent yod)
#   sheva → "e" if word-initial; otherwise silent
#   patach genuva (final ח/ה/ע + patach) → "-ach" / "-ah" / "-a"
#   maqaf (־) → space    sof-pasuq → stripped
SHEVA_M = 'ְ'
CHATAF_SEGOL_M  = 'ֱ'
CHATAF_PATACH_M = 'ֲ'
CHATAF_KAMATZ_M = 'ֳ'
CHIRIK_M = 'ִ'
TSERE_M  = 'ֵ'
SEGOL_M  = 'ֶ'
PATACH_M = 'ַ'
KAMATZ_M = 'ָ'
HOLAM_M  = 'ֹ'
HOLAM_HASER_M = 'ֺ'
KUBUTZ_M = 'ֻ'
DAGESH_M = 'ּ'
SHIN_DOT_M = 'ׁ'
SIN_DOT_M  = 'ׂ'
KAMATZ_KATAN_M = 'ׇ'
MAQAF_M = '־'
PASEQ_M = '׀'

VOWEL_SOUND = {
    KAMATZ_M: 'a', KAMATZ_KATAN_M: 'o',
    PATACH_M: 'a', TSERE_M: 'e', SEGOL_M: 'e',
    CHIRIK_M: 'i', HOLAM_M: 'o', HOLAM_HASER_M: 'o',
    KUBUTZ_M: 'u',
    CHATAF_PATACH_M: 'a', CHATAF_SEGOL_M: 'e', CHATAF_KAMATZ_M: 'o',
}
VOWELS_M = set(VOWEL_SOUND.keys())

LETTER_BASE = {
    'א': '', 'ב': 'v', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'v', 'ז': 'z',
    'ח': 'ch', 'ט': 't', 'י': 'y', 'כ': 'ch', 'ך': 'ch',
    'ל': 'l', 'מ': 'm', 'ם': 'm', 'נ': 'n', 'ן': 'n', 'ס': 's', 'ע': '',
    'פ': 'f', 'ף': 'f', 'צ': 'tz', 'ץ': 'tz', 'ק': 'k', 'ר': 'r',
    'ש': 'sh', 'ת': 't',
}
LETTER_DAGESH = {
    'ב': 'b', 'כ': 'k', 'ך': 'k', 'פ': 'p', 'ף': 'p',
}
HE_LETTERS = set(LETTER_BASE.keys())


def _tokenize(word):
    """Group letters with their attached marks. Spaces become ('', set())."""
    tokens = []
    for c in word:
        if c == ' ':
            tokens.append((' ', set()))
        elif c in HE_LETTERS:
            tokens.append((c, set()))
        elif c in (SHIN_DOT_M, SIN_DOT_M, DAGESH_M, SHEVA_M) or c in VOWELS_M:
            if tokens and tokens[-1][0] != ' ':
                tokens[-1][1].add(c)
        # else: drop (te'amim, etc.)
    return tokens


def _consonant(letter, marks):
    if letter == 'ש':
        return 's' if SIN_DOT_M in marks else 'sh'
    if letter == 'ו':
        return 'v'
    if DAGESH_M in marks and letter in LETTER_DAGESH:
        return LETTER_DAGESH[letter]
    return LETTER_BASE[letter]


def transliterate(word):
    """Hebrew → simple Latin transliteration."""
    word = strip_teamim(word).replace('/', '')
    word = word.replace(MAQAF_M, ' ').replace(SOF_PASUQ, '').replace(PASEQ_M, '')
    if not word.strip():
        return ''
    tokens = _tokenize(word)
    out = []
    is_word_start = True
    i = 0
    while i < len(tokens):
        letter, marks = tokens[i]
        if letter == ' ':
            out.append(' ')
            is_word_start = True
            i += 1; continue
        is_last = (i == len(tokens) - 1) or tokens[i + 1][0] == ' '

        # Vav as pure vowel: shuruk (וּ) anywhere; holam-vav (וֹ) only after a consonant
        if letter == 'ו':
            if DAGESH_M in marks and not (marks & VOWELS_M):
                out.append('u')
                is_word_start = False
                i += 1; continue
            if (HOLAM_M in marks or HOLAM_HASER_M in marks) and not (marks - {DAGESH_M, HOLAM_M, HOLAM_HASER_M}):
                if not is_word_start:
                    out.append('o')
                    is_word_start = False
                    i += 1; continue

        cons = _consonant(letter, marks)
        vowel = ''
        for v in VOWELS_M:
            if v in marks:
                vowel = VOWEL_SOUND[v]
                break
        if not vowel and SHEVA_M in marks and is_word_start:
            vowel = 'e'

        def emit(c, v_):
            """Append cons+vowel, inserting apostrophe between adjacent vowels
            when the consonant is silent (alef/ayin)."""
            if c == '' and v_ and out and out[-1] and out[-1][-1] in 'aeiou':
                out.append("'")
            out.append(c + v_)

        # Chirik + silent yod mater → "i"
        if vowel == 'i' and not is_last:
            nl, nm = tokens[i + 1]
            if nl == 'י' and not (nm & VOWELS_M) and SHEVA_M not in nm and DAGESH_M not in nm:
                emit(cons, 'i'); is_word_start = False; i += 2; continue
        # Tsere + silent yod mater → "ei"
        if TSERE_M in marks and not is_last:
            nl, nm = tokens[i + 1]
            if nl == 'י' and not (nm & VOWELS_M) and SHEVA_M not in nm and DAGESH_M not in nm:
                emit(cons, 'ei'); is_word_start = False; i += 2; continue
        # Segol + silent yod mater → "e" (no diphthong in Sephardic-Israeli)
        if SEGOL_M in marks and not is_last:
            nl, nm = tokens[i + 1]
            if nl == 'י' and not (nm & VOWELS_M) and SHEVA_M not in nm and DAGESH_M not in nm:
                emit(cons, 'e'); is_word_start = False; i += 2; continue

        # Patach genuva (final guttural with patach reads "a" before consonant)
        if is_last and letter in ('ח', 'ע', 'ה') and PATACH_M in marks:
            # Pre-vowel "a" then the consonant. For ע (silent) the apostrophe
            # rule still applies on the "a".
            if cons == '' and out and out[-1] and out[-1][-1] in 'aeiou':
                out.append("'")
            out.append('a' + cons)
            is_word_start = False; i += 1; continue

        # Final ה/א with no vowel → silent mater
        if is_last and letter in ('ה', 'א') and not (marks & VOWELS_M) and SHEVA_M not in marks and DAGESH_M not in marks:
            i += 1; continue

        emit(cons, vowel)
        is_word_start = False
        i += 1

    result = ''.join(out)
    while '  ' in result:
        result = result.replace('  ', ' ')
    return result.strip()

# --- Load WLC ---
gen = json.load(open(POCKET / 'torah/json/Genesis.json', encoding='utf-8-sig'))
chapters = gen['Tanach']['tanach']['book']['c']
ch43 = chapters[42]   # Genesis 43
ch44 = chapters[43]   # Genesis 44

def verse_words(chapter, verse_n):
    v = chapter['v'][verse_n - 1]
    out = []
    for w in v['w']:
        if isinstance(w, str):
            out.append(w)
        elif isinstance(w, dict):
            out.append(w.get('#text', ''))
    return out

# --- Load timing labels ---
labels6 = [float(x) for x in (POCKET / 'torah/labels/Miketz-6.txt').read_text().strip().split(',')]
labels7 = [float(x) for x in (POCKET / 'torah/labels/Miketz-7.txt').read_text().strip().split(',')]

def get_audio_duration(path):
    out = subprocess.check_output([
        'ffprobe', '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=nw=1:nk=1', str(path)
    ]).decode().strip()
    return float(out)

dur6 = get_audio_duration(POCKET / 'audio/Miketz-6.mp3')
dur7 = get_audio_duration(POCKET / 'audio/Miketz-7.mp3')
print(f"Miketz-6 duration: {dur6:.3f}s ({len(labels6)} word timestamps)")
print(f"Miketz-7 duration: {dur7:.3f}s ({len(labels7)} word timestamps)")

# --- Aliya 1: Gen 43:16-18, sliced from Miketz-6.mp3 (words 0..55) ---
aliya1_verses = [(43, 16), (43, 17), (43, 18)]
aliya1_word_count = sum(len(verse_words(ch43, v)) for c, v in aliya1_verses)  # 56
assert aliya1_word_count == 56, aliya1_word_count
slice1_start = 0.0
slice1_end = labels6[56]  # start of word 57 = end of word 56 = end of 43:18

# --- Aliya 7: Gen 44:11-17, sliced from Miketz-7.mp3 (words 204..299) ---
# Annual aliya 7 covers 43:30-44:17. Words 0..203 cover 43:30-44:10; word 204 = 44:11 v1.
aliya7_verses = [(44, n) for n in range(11, 18)]
words_before_aliya7 = 0
for v in range(30, 35):  # 43:30-43:34
    words_before_aliya7 += len(verse_words(ch43, v))
for v in range(1, 11):   # 44:1-44:10
    words_before_aliya7 += len(verse_words(ch44, v))
assert words_before_aliya7 == 204, words_before_aliya7
slice7_start = labels7[204]
slice7_end = dur7

print(f"Aliya 1 slice: {slice1_start:.3f}s .. {slice1_end:.3f}s = {slice1_end-slice1_start:.3f}s")
print(f"Aliya 7 slice: {slice7_start:.3f}s .. {slice7_end:.3f}s = {slice7_end-slice7_start:.3f}s")

# --- ffmpeg slicing ---
def slice_mp3(src, dst, start, end):
    duration = end - start
    cmd = [
        'ffmpeg', '-y', '-loglevel', 'error',
        '-ss', f"{start:.6f}",
        '-i', str(src),
        '-t', f"{duration:.6f}",
        '-c:a', 'libmp3lame', '-b:a', '128k',
        str(dst)
    ]
    subprocess.check_call(cmd)

slice_mp3(POCKET / 'audio/Miketz-6.mp3', OUT / 'audio/aliya1.mp3', slice1_start, slice1_end)
slice_mp3(POCKET / 'audio/Miketz-7.mp3', OUT / 'audio/aliya7.mp3', slice7_start, slice7_end)

dur_a1 = get_audio_duration(OUT / 'audio/aliya1.mp3')
dur_a7 = get_audio_duration(OUT / 'audio/aliya7.mp3')
print(f"Aliya 1 audio: {dur_a1:.3f}s")
print(f"Aliya 7 audio: {dur_a7:.3f}s")

# --- Build per-aliya JSON ---
def build_aliya(*, aliya_num, label_text_short, source_chapter_verses,
                source_labels, source_word_offset, source_audio_duration_clamp,
                slice_start, slice_end, audio_path):
    """
    source_chapter_verses: list of (chapter_obj, verse_n)
    source_labels: list of word-start times in the SOURCE audio
    source_word_offset: word index into source_labels where THIS aliya begins
    source_audio_duration_clamp: total duration of source audio (used as the end of last word)
    slice_start: time in source audio where slice begins (we re-base to 0)
    slice_end: time in source audio where slice ends (used to bound last word)
    """
    verses_out = []
    word_idx = source_word_offset
    seg_idx = 0  # index within the sliced output
    for ch, vn in source_chapter_verses:
        words_raw = verse_words(ch, vn)
        words_out = []
        for w_raw in words_raw:
            display = strip_slashes(w_raw)
            vowels_only = strip_teamim(display)  # vowels but no te'amim
            plain = consonants_only(display)
            start = source_labels[word_idx] - slice_start
            # End = next word's start, or end of slice if last
            if word_idx + 1 < len(source_labels):
                next_start = source_labels[word_idx + 1]
            else:
                next_start = source_audio_duration_clamp
            # Clamp to slice end so the last word doesn't bleed
            end = min(next_start, slice_end) - slice_start
            phrase_break = detect_phrase_break(display)
            words_out.append({
                'text': display,           # vowels + te'amim
                'noTeamim': vowels_only,    # vowels only
                'plain': plain,             # consonants only (scroll style)
                'morph': w_raw,             # WLC with /-separators (advanced)
                'translit': transliterate(display),  # Sephardic-Israeli, kid-friendly
                'start': round(start, 3),
                'end': round(end, 3),
                'phraseBreak': phrase_break,
            })
            word_idx += 1
        verses_out.append({
            'ref': f"{43 if ch is ch43 else 44}:{vn}",
            'words': words_out,
        })
    return {
        'parasha': 'Miketz',
        'cycle': 'triennial-y3',
        'aliyaNum': aliya_num,
        'label': label_text_short,
        'audio': audio_path,
        'duration': source_audio_duration_clamp if False else round(slice_end - slice_start, 3),
        'verses': verses_out,
    }

aliya1 = build_aliya(
    aliya_num=1,
    label_text_short='Aliya 1 — Genesis 43:16–18',
    source_chapter_verses=[(ch43, 16), (ch43, 17), (ch43, 18)],
    source_labels=labels6,
    source_word_offset=0,
    source_audio_duration_clamp=dur6,
    slice_start=slice1_start,
    slice_end=slice1_end,
    audio_path='/parasha/miketz/audio/aliya1.mp3',
)
aliya7 = build_aliya(
    aliya_num=7,
    label_text_short='Aliya 7 — Genesis 44:11–17',
    source_chapter_verses=[(ch44, n) for n in range(11, 18)],
    source_labels=labels7,
    source_word_offset=204,
    source_audio_duration_clamp=dur7,
    slice_start=slice7_start,
    slice_end=slice7_end,
    audio_path='/parasha/miketz/audio/aliya7.mp3',
)

(OUT / 'aliya1.json').write_text(json.dumps(aliya1, ensure_ascii=False, indent=2))
(OUT / 'aliya7.json').write_text(json.dumps(aliya7, ensure_ascii=False, indent=2))

# Index file
index = {
    'parasha': 'Miketz',
    'parashaHebrew': 'מִקֵּץ',
    'cycle': 'triennial-y3',
    'date': '2026-12-12',
    'dateHebrew': '2 Tevet 5787',
    'aliyot': [
        {'num': 1, 'label': aliya1['label'], 'href': '/parasha/miketz/aliya1.json',
         'audio': aliya1['audio'], 'duration': aliya1['duration'], 'verseCount': 3, 'wordCount': 56},
        {'num': 7, 'label': aliya7['label'], 'href': '/parasha/miketz/aliya7.json',
         'audio': aliya7['audio'], 'duration': aliya7['duration'], 'verseCount': 7, 'wordCount': 96},
    ],
}
(OUT / 'index.json').write_text(json.dumps(index, ensure_ascii=False, indent=2))

print(f"\nWrote:")
print(f"  {OUT}/aliya1.json  ({len(aliya1['verses'])} verses, {sum(len(v['words']) for v in aliya1['verses'])} words)")
print(f"  {OUT}/aliya7.json  ({len(aliya7['verses'])} verses, {sum(len(v['words']) for v in aliya7['verses'])} words)")
print(f"  {OUT}/audio/aliya1.mp3, audio/aliya7.mp3")
print(f"  {OUT}/index.json")
