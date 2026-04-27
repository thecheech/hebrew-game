#!/usr/bin/env python3
"""
Generalized build script for ALL Torah portions.

Reads from external/pockettorah (cloned separately — not in git).
Outputs into public/parasha/{slug}/ for each parasha.

Usage:
    python3 scripts/build-all-parashot.py [--only Bereshit Miketz ...]

Produces, for each available parasha:
  public/parasha/{slug}/audio/aliya{N}.mp3    (copied from PocketTorah)
  public/parasha/{slug}/aliya{N}.json         (words + timing)
  public/parasha/{slug}/index.json            (aliyot listing)
"""
import json, subprocess, shutil, sys, os, unicodedata
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
POCKET  = PROJECT / 'external/pockettorah/data'
AUDIO_SRC  = POCKET / 'audio'
LABELS_SRC = POCKET / 'torah/labels'
BOOKS_SRC  = POCKET / 'torah/json'

# ─── Hebrew character classification ────────────────────────────────────────
TEAMIM = set(chr(c) for c in range(0x0591, 0x05B0)) - {chr(0x05AF)}
TEAMIM.add(chr(0x05BD))
NIKUD = set(chr(c) for c in range(0x05B0, 0x05C8)) - TEAMIM
NIKUD.discard(chr(0x05C0))
SOF_PASUQ   = chr(0x05C3)
ETNAHTA     = chr(0x0591)
SEGOL_T     = chr(0x0592)
SHALSHELET  = chr(0x0593)
ZAQEF_QATAN = chr(0x0594)
ZAQEF_GADOL = chr(0x0595)
PHRASE_BREAK_TEAMIM = {ETNAHTA, ZAQEF_QATAN, ZAQEF_GADOL, SEGOL_T, SHALSHELET}

def strip_slashes(s): return s.replace('/', '')
def strip_teamim(s):  return ''.join(c for c in s if c not in TEAMIM)
def strip_nikud(s):   return ''.join(c for c in s if c not in NIKUD)
def consonants_only(s):
    out = strip_teamim(strip_nikud(s))
    return out.replace(SOF_PASUQ, '').replace(chr(0x05C0), '').replace(chr(0x05BE), ' ')

def detect_phrase_break(word):
    if SOF_PASUQ in word:   return 'sof-pasuq'
    if ETNAHTA in word:     return 'etnahta'
    if ZAQEF_QATAN in word or ZAQEF_GADOL in word: return 'zaqef'
    if SHALSHELET in word:  return 'shalshelet'
    if SEGOL_T in word:     return 'segol'
    return None

# ─── Transliteration (Sephardic-Israeli) ────────────────────────────────────
SHEVA_M          = 'ְ'
CHATAF_SEGOL_M   = 'ֱ'
CHATAF_PATACH_M  = 'ֲ'
CHATAF_KAMATZ_M  = 'ֳ'
CHIRIK_M         = 'ִ'
TSERE_M          = 'ֵ'
SEGOL_M          = 'ֶ'
PATACH_M         = 'ַ'
KAMATZ_M         = 'ָ'
HOLAM_M          = 'ֹ'
HOLAM_HASER_M    = 'ֺ'
KUBUTZ_M         = 'ֻ'
DAGESH_M         = 'ּ'
SHIN_DOT_M       = 'ׁ'
SIN_DOT_M        = 'ׂ'
KAMATZ_KATAN_M   = 'ׇ'
VOWELS_M = {SHEVA_M, CHATAF_SEGOL_M, CHATAF_PATACH_M, CHATAF_KAMATZ_M,
            CHIRIK_M, TSERE_M, SEGOL_M, PATACH_M, KAMATZ_M, HOLAM_M,
            HOLAM_HASER_M, KUBUTZ_M, KAMATZ_KATAN_M}
MAQAF = chr(0x05BE)

LETTER_CONS = {
    'א': '', 'ב': 'v', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'v',
    'ז': 'z', 'ח': 'ch', 'ט': 't', 'י': 'y', 'כ': 'ch', 'ך': 'ch',
    'ל': 'l', 'מ': 'm', 'ם': 'm', 'נ': 'n', 'ן': 'n', 'ס': 's',
    'ע': '', 'פ': 'f', 'ף': 'f', 'צ': 'tz', 'ץ': 'tz', 'ק': 'k',
    'ר': 'r', 'ש': 'sh', 'ת': 't',
}

def transliterate(word_str):
    word_str = word_str.replace(MAQAF, ' ')
    word_str = word_str.replace(SOF_PASUQ, '')
    word_str = word_str.replace(chr(0x05C0), '')
    parts = word_str.split(' ')
    result_parts = []
    for part in parts:
        result_parts.append(_translit_word(part))
    result = ' '.join(result_parts)
    while '  ' in result:
        result = result.replace('  ', ' ')
    return result.strip()

def _translit_word(word):
    if not word: return ''
    chars = list(word)
    out = []
    i = 0
    is_word_start = True
    n = len(chars)

    def emit(cons, vowel):
        nonlocal is_word_start
        if cons == 'v' and is_word_start:
            cons = 'v'
        out.append(cons + vowel)

    while i < n:
        letter = chars[i]
        if letter not in LETTER_CONS and letter not in NIKUD and letter not in TEAMIM:
            i += 1
            continue
        if letter in NIKUD or letter in TEAMIM:
            i += 1
            continue

        # Collect diacritics
        marks = set()
        j = i + 1
        while j < n and (chars[j] in NIKUD or chars[j] in TEAMIM):
            marks.add(chars[j])
            j += 1

        is_last = (j >= n or all(c not in LETTER_CONS for c in chars[j:] if c not in NIKUD and c not in TEAMIM))
        cons = LETTER_CONS.get(letter, '')

        # Shin/sin dot
        if letter == 'ש':
            if SIN_DOT_M in marks:
                cons = 's'
            else:
                cons = 'sh'

        # Dagesh in bet/kaf/peh → hard stop
        if letter in ('ב', 'כ', 'ך') and DAGESH_M in marks:
            cons = 'b' if letter == 'ב' else ('k' if letter in ('כ', 'ך') else cons)
        if letter in ('פ', 'ף') and DAGESH_M in marks:
            cons = 'p'

        # Vav with dagesh (shuruk) or holam = vowel carrier
        if letter == 'ו':
            if DAGESH_M in marks:
                emit('', 'u')
                is_word_start = False
                i = j
                continue
            if HOLAM_M in marks or HOLAM_HASER_M in marks:
                emit('', 'o')
                is_word_start = False
                i = j
                continue

        # Vowel from marks
        vowel = ''
        if PATACH_M in marks or KAMATZ_M in marks or CHATAF_PATACH_M in marks or CHATAF_KAMATZ_M in marks or KAMATZ_KATAN_M in marks:
            vowel = 'a'
        elif TSERE_M in marks:
            # tsere + following yod → "ei"
            if j < n and chars[j] == 'י':
                vowel = 'ei'
            else:
                vowel = 'e'
        elif SEGOL_M in marks or CHATAF_SEGOL_M in marks:
            vowel = 'e'
        elif CHIRIK_M in marks:
            # chirik + following yod (mater) → still "i"
            vowel = 'i'
        elif HOLAM_M in marks or HOLAM_HASER_M in marks:
            vowel = 'o'
        elif KUBUTZ_M in marks:
            vowel = 'u'
        elif SHEVA_M in marks:
            if is_word_start:
                vowel = 'e'
            else:
                vowel = ''

        # Patach genuva (final guttural + patach underneath)
        if is_last and letter in ('ח', 'ע', 'ה') and PATACH_M in marks:
            if cons == '' and out and out[-1] and out[-1][-1] in 'aeiou':
                out.append("'")
            out.append('a' + cons)
            is_word_start = False
            i = j
            continue

        # Final silent alef/he
        if is_last and letter in ('ה', 'א') and not (marks & VOWELS_M) and SHEVA_M not in marks and DAGESH_M not in marks:
            i = j
            continue

        emit(cons, vowel)
        is_word_start = False
        i = j

    result = ''.join(out)
    while '  ' in result:
        result = result.replace('  ', ' ')
    return result.strip()


# ─── Torah book cache ────────────────────────────────────────────────────────
_book_cache = {}

def load_book(book_name):
    if book_name not in _book_cache:
        path = BOOKS_SRC / f'{book_name}.json'
        with open(path, encoding='utf-8-sig') as f:
            data = json.load(f)
        _book_cache[book_name] = data['Tanach']['tanach']['book']['c']
    return _book_cache[book_name]


# ─── Helpers ────────────────────────────────────────────────────────────────
def parse_ref(ref):
    """'43:16' → (43, 16)"""
    ch, v = ref.split(':')
    return int(ch), int(v)

def get_word_text(w):
    if isinstance(w, str):
        return w
    if isinstance(w, dict):
        return w.get('#text', '')
    return ''

def get_verses(chapters, begin_ch, begin_v, end_ch, end_v):
    """Return list of {ref, words_raw} dicts."""
    verses = []
    for ch_idx in range(begin_ch - 1, end_ch):
        ch_num = ch_idx + 1
        ch = chapters[ch_idx]
        v_start = begin_v if ch_num == begin_ch else 1
        v_end   = end_v   if ch_num == end_ch   else len(ch['v'])
        for v_idx in range(v_start - 1, v_end):
            verse = ch['v'][v_idx]
            words_raw = [get_word_text(w) for w in verse['w']]
            verses.append({'ref': f'{ch_num}:{v_idx + 1}', 'words_raw': words_raw})
    return verses

def get_audio_duration(path):
    out = subprocess.check_output([
        'ffprobe', '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=nw=1:nk=1', str(path)
    ]).decode().strip()
    return float(out)

def make_slug(parasha_id):
    """'Achrei Mot' → 'achrei-mot', 'Beha'alotcha' → 'behaalotcha'"""
    s = parasha_id.lower()
    # Remove all apostrophe variants
    for apos in ("'", '‘', '’', 'ʼ'):
        s = s.replace(apos, '')
    s = s.replace(' ', '-')
    return s

def audio_base(parasha_id):
    """'Achrei Mot' → 'AchreiMot', 'Beha'alotcha' → 'Behaalotcha'"""
    s = parasha_id.replace(' ', '')
    for apos in ("'", '‘', '’', 'ʼ'):
        s = s.replace(apos, '')
    return s


# ─── Build one aliya ─────────────────────────────────────────────────────────
def build_aliya(*, parasha_id, aliya_num, aliya_label, begin, end,
                chapters, timestamps, audio_dur, slug):
    begin_ch, begin_v = parse_ref(begin)
    end_ch,   end_v   = parse_ref(end)

    verses_raw = get_verses(chapters, begin_ch, begin_v, end_ch, end_v)
    word_count = sum(len(v['words_raw']) for v in verses_raw)

    # Allow off-by-one: some label files have an extra trailing timestamp
    if len(timestamps) == word_count + 1:
        timestamps = timestamps[:word_count]   # drop trailing end-of-last-word
    elif len(timestamps) != word_count:
        print(f'    ⚠  label mismatch: {len(timestamps)} timestamps vs {word_count} words '
              f'(aliya {aliya_num} of {parasha_id}). Skipping.')
        return None

    verses_out = []
    wi = 0  # global word index
    for v in verses_raw:
        words_out = []
        for w_raw in v['words_raw']:
            display = strip_slashes(w_raw)
            start = timestamps[wi]
            end_t = timestamps[wi + 1] if wi + 1 < len(timestamps) else audio_dur
            end_t = min(end_t, audio_dur)
            words_out.append({
                'text':        display,
                'noTeamim':    strip_teamim(display),
                'plain':       consonants_only(display),
                'morph':       w_raw,
                'translit':    transliterate(display),
                'start':       round(start, 3),
                'end':         round(end_t, 3),
                'phraseBreak': detect_phrase_break(display),
            })
            wi += 1
        verses_out.append({'ref': v['ref'], 'words': words_out})

    return {
        'parasha':  parasha_id,
        'cycle':    'annual',
        'aliyaNum': aliya_num,
        'label':    aliya_label,
        'audio':    f'/parasha/{slug}/audio/aliya{aliya_num}.mp3',
        'duration': round(audio_dur, 3),
        'verses':   verses_out,
    }


# ─── Main ────────────────────────────────────────────────────────────────────
def main():
    only_filter = sys.argv[1:] if sys.argv[1:] else None
    if only_filter and only_filter[0] == '--only':
        only_filter = only_filter[1:]

    with open(POCKET / 'aliyah.json', encoding='utf-8-sig') as f:
        aliyah_data = json.load(f)
    parshiot = aliyah_data['parshiot']['parsha']

    built = 0
    skipped = 0

    for p in parshiot:
        pid       = p['_id']
        hebrew    = p['_hebrew']
        verse_str = p['_verse']         # e.g. "Genesis 41:1 - 44:17"
        book_name = verse_str.split(' ')[0]   # "Genesis"

        if only_filter and pid not in only_filter:
            continue

        slug   = make_slug(pid)
        ab     = audio_base(pid)

        aliyot_data = p['fullkriyah']['aliyah']
        # Only annual aliyot 1-7
        aliyot_to_build = [
            a for a in aliyot_data
            if a['_num'] not in ('M',) and a['_num'].isdigit() and int(a['_num']) <= 7
        ]

        available = []
        for a in aliyot_to_build:
            n           = a['_num']
            audio_src   = AUDIO_SRC / f'{ab}-{n}.mp3'
            label_src   = LABELS_SRC / f'{pid}-{n}.txt'
            if audio_src.exists() and label_src.exists():
                available.append((a, audio_src, label_src))

        if not available:
            print(f'⏭  {pid}: no data available, skipping')
            skipped += 1
            continue

        print(f'\n📖  {pid} → /parasha/{slug}/ ({len(available)}/7 aliyot)')

        # Load Torah book
        try:
            chapters = load_book(book_name)
        except FileNotFoundError:
            print(f'    ✗  Book JSON not found: {book_name}.json')
            skipped += 1
            continue

        out_dir = PROJECT / f'public/parasha/{slug}'
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / 'audio').mkdir(exist_ok=True)

        aliyot_index = []

        for (a, audio_src, label_src) in available:
            n         = int(a['_num'])
            begin     = a['_begin']
            end_ref   = a['_end']
            n_verses  = int(a.get('_numverses', 0))

            # Copy audio (use copy instead of copy2 so we own the file permissions)
            audio_dst = out_dir / f'audio/aliya{n}.mp3'
            shutil.copy(audio_src, audio_dst)
            os.chmod(audio_dst, 0o644)

            # Read timing labels
            timestamps = [float(x) for x in label_src.read_text().strip().split(',')]
            audio_dur  = get_audio_duration(audio_dst)

            # Build verse label
            begin_ch, begin_v = parse_ref(begin)
            end_ch,   end_v   = parse_ref(end_ref)
            book_short = {'Genesis': 'Gen', 'Exodus': 'Ex', 'Leviticus': 'Lev',
                          'Numbers': 'Num', 'Deuteronomy': 'Deut'}.get(book_name, book_name)
            if begin_ch == end_ch:
                aliya_label = f'Aliya {n} — {book_short} {begin_ch}:{begin_v}–{end_v}'
            else:
                aliya_label = f'Aliya {n} — {book_short} {begin_ch}:{begin_v}–{end_ch}:{end_v}'

            aliya_obj = build_aliya(
                parasha_id=pid,
                aliya_num=n,
                aliya_label=aliya_label,
                begin=begin,
                end=end_ref,
                chapters=chapters,
                timestamps=timestamps,
                audio_dur=audio_dur,
                slug=slug,
            )
            if aliya_obj is None:
                # label mismatch — remove copied audio
                try:
                    audio_dst.unlink()
                except Exception:
                    pass
                continue

            word_count  = sum(len(v['words']) for v in aliya_obj['verses'])
            verse_count = len(aliya_obj['verses'])

            aliya_json_path = out_dir / f'aliya{n}.json'
            aliya_json_path.write_text(
                json.dumps(aliya_obj, ensure_ascii=False, indent=2),
                encoding='utf-8'
            )
            print(f'    ✓  aliya {n}: {verse_count} verses, {word_count} words, '
                  f'{audio_dur:.1f}s')

            aliyot_index.append({
                'num':        n,
                'label':      aliya_label,
                'href':       f'/parasha/{slug}/aliya{n}.json',
                'audio':      f'/parasha/{slug}/audio/aliya{n}.mp3',
                'duration':   round(audio_dur, 3),
                'verseCount': verse_count,
                'wordCount':  word_count,
            })

        if not aliyot_index:
            print(f'    ✗  No aliyot built (all had label mismatches)')
            skipped += 1
            continue

        # Sort by aliya number
        aliyot_index.sort(key=lambda x: x['num'])

        index = {
            'parasha':       pid,
            'parashaHebrew': hebrew,
            'cycle':         'annual',
            'date':          '',
            'dateHebrew':    '',
            'aliyot':        aliyot_index,
        }
        (out_dir / 'index.json').write_text(
            json.dumps(index, ensure_ascii=False, indent=2),
            encoding='utf-8'
        )
        built += 1

    print(f'\n✅  Done: {built} parashot built, {skipped} skipped.')


if __name__ == '__main__':
    main()
