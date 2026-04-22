const HEBREW_BASE_LETTER_RE = /[א-תךםןףץ]/;

const FINAL_TO_BASE: Record<string, string> = {
  ך: "כ",
  ם: "מ",
  ן: "נ",
  ף: "פ",
  ץ: "צ",
};

export interface LetterExample {
  hebrew: string;
  translit: string;
  english: string;
  emoji: string;
}

export interface LetterInfo {
  baseLetter: string;
  name: string;
  sound: string;
  description: string;
  finalForm?: string;
  finalNote?: string;
  examples: LetterExample[];
}

const LETTER_INFO: Record<string, LetterInfo> = {
  א: {
    baseLetter: "א",
    name: "Alef",
    sound: "silent — carries the vowel",
    description:
      "Alef is the very first letter of the alef-bet. It does not make a sound on its own — it just holds whichever vowel sits next to it, like an empty bowl that takes the flavor of the soup you pour in.",
    examples: [
      { hebrew: "אַבָּא", translit: "aba", english: "father", emoji: "👨" },
      { hebrew: "אִמָּא", translit: "imma", english: "mother", emoji: "👩" },
      { hebrew: "אֶרֶץ", translit: "eretz", english: "land", emoji: "🌍" },
    ],
  },
  ב: {
    baseLetter: "ב",
    name: "Bet",
    sound: "B with a dot, V without",
    description:
      "Bet is the second letter and the first letter of the Torah (Bereshit). With a dot inside (בּ) it sounds like B in 'boy'. Without the dot (ב) it softens to V, like in 'vine'.",
    examples: [
      { hebrew: "בַּיִת", translit: "bayit", english: "house", emoji: "🏠" },
      { hebrew: "בֵּן", translit: "ben", english: "son", emoji: "👦" },
      { hebrew: "בֵּיצָה", translit: "beitzah", english: "egg", emoji: "🥚" },
    ],
  },
  ג: {
    baseLetter: "ג",
    name: "Gimel",
    sound: "G as in 'goat'",
    description:
      "Gimel makes a hard G sound, like in 'goat' or 'game'. The name Gimel comes from 'gamal' (camel), and the letter shape was once said to look like a person walking — always going forward.",
    examples: [
      { hebrew: "גָּדוֹל", translit: "gadol", english: "big", emoji: "🐘" },
      { hebrew: "גַּן", translit: "gan", english: "garden", emoji: "🌳" },
      { hebrew: "גֶּשֶׁם", translit: "geshem", english: "rain", emoji: "🌧️" },
    ],
  },
  ד: {
    baseLetter: "ד",
    name: "Dalet",
    sound: "D as in 'door'",
    description:
      "Dalet makes a D sound. The name actually means 'door' — and a door is exactly what you walk through into the next word.",
    examples: [
      { hebrew: "דֶּלֶת", translit: "delet", english: "door", emoji: "🚪" },
      { hebrew: "דָּג", translit: "dag", english: "fish", emoji: "🐟" },
      { hebrew: "דּוֹד", translit: "dod", english: "uncle", emoji: "🧔" },
    ],
  },
  ה: {
    baseLetter: "ה",
    name: "He",
    sound: "soft H breath",
    description:
      "He is a quiet puff of breath — like fogging up a window. At the end of a word it is often almost silent and just signals 'the' or a feminine ending.",
    examples: [
      { hebrew: "הוּא", translit: "hu", english: "he", emoji: "🧑" },
      { hebrew: "הִיא", translit: "hi", english: "she", emoji: "👧" },
      { hebrew: "הַר", translit: "har", english: "mountain", emoji: "⛰️" },
    ],
  },
  ו: {
    baseLetter: "ו",
    name: "Vav",
    sound: "V, or O / U with vowel marks",
    description:
      "Vav is shaped like a hook (its name means 'hook'). It can sound like V at the start of a word, or it becomes the vowel O (וֹ) or U (וּ) when it has a dot.",
    examples: [
      { hebrew: "וֶרֶד", translit: "vered", english: "rose", emoji: "🌹" },
      { hebrew: "יוֹם", translit: "yom", english: "day", emoji: "☀️" },
      { hebrew: "שָׁלוֹם", translit: "shalom", english: "peace / hello", emoji: "🕊️" },
    ],
  },
  ז: {
    baseLetter: "ז",
    name: "Zayin",
    sound: "Z as in 'zoo'",
    description:
      "Zayin makes a buzzing Z sound, like a zipper. Its name also means 'weapon' in older Hebrew, and the letter shape is tall and pointy like a sword.",
    examples: [
      { hebrew: "זֶה", translit: "zeh", english: "this", emoji: "👉" },
      { hebrew: "זְמַן", translit: "zman", english: "time", emoji: "⌚" },
      { hebrew: "זֶרַע", translit: "zera", english: "seed", emoji: "🌱" },
    ],
  },
  ח: {
    baseLetter: "ח",
    name: "Chet",
    sound: "ch from the back of the throat",
    description:
      "Chet is a 'throaty' sound — not the English 'ch' in 'chair', but more like clearing your throat softly, the same as in 'Chanukah' or 'Bach'.",
    examples: [
      { hebrew: "חַם", translit: "cham", english: "hot", emoji: "🔥" },
      { hebrew: "חָתוּל", translit: "chatul", english: "cat", emoji: "🐱" },
      { hebrew: "חַלּוֹן", translit: "chalon", english: "window", emoji: "🪟" },
    ],
  },
  ט: {
    baseLetter: "ט",
    name: "Tet",
    sound: "T as in 'top'",
    description:
      "Tet makes a plain T sound — same as Tav, just a different shape. Its name is connected to the word 'tov' (good), and you'll often see it as the first letter of words for nice things.",
    examples: [
      { hebrew: "טוֹב", translit: "tov", english: "good", emoji: "👍" },
      { hebrew: "טַבַּעַת", translit: "taba'at", english: "ring", emoji: "💍" },
      { hebrew: "טֶלֶפוֹן", translit: "telefon", english: "telephone", emoji: "📞" },
    ],
  },
  י: {
    baseLetter: "י",
    name: "Yod",
    sound: "Y, or long 'i' vowel",
    description:
      "Yod is the smallest letter — the 'jot' in 'jot and tittle'. As a consonant it sounds like Y in 'yes'; combined with vowels it can also stretch a sound to a long 'ee'.",
    examples: [
      { hebrew: "יֶלֶד", translit: "yeled", english: "child / boy", emoji: "🧒" },
      { hebrew: "יָם", translit: "yam", english: "sea", emoji: "🌊" },
      { hebrew: "יוֹם", translit: "yom", english: "day", emoji: "☀️" },
    ],
  },
  כ: {
    baseLetter: "כ",
    name: "Kaf",
    sound: "K with a dot, ch without",
    description:
      "Kaf with a dot inside (כּ) is a hard K like 'king'. Without the dot (כ) it softens to the same throaty 'ch' as Chet.",
    finalForm: "ך",
    finalNote: "At the end of a word, Kaf becomes ך (Kaf sofit) — same sound, longer tail.",
    examples: [
      { hebrew: "כֶּלֶב", translit: "kelev", english: "dog", emoji: "🐕" },
      { hebrew: "כֶּסֶף", translit: "kesef", english: "money", emoji: "💰" },
      { hebrew: "מֶלֶךְ", translit: "melech", english: "king", emoji: "👑" },
    ],
  },
  ל: {
    baseLetter: "ל",
    name: "Lamed",
    sound: "L as in 'love'",
    description:
      "Lamed is the tallest letter — it stands above the line like a tower or a teacher's pointer. Its name means 'to learn' or 'to teach'.",
    examples: [
      { hebrew: "לֵב", translit: "lev", english: "heart", emoji: "❤️" },
      { hebrew: "לֶחֶם", translit: "lechem", english: "bread", emoji: "🍞" },
      { hebrew: "לַיְלָה", translit: "laylah", english: "night", emoji: "🌙" },
    ],
  },
  מ: {
    baseLetter: "מ",
    name: "Mem",
    sound: "M as in 'mom'",
    description:
      "Mem makes the M sound. The name comes from 'mayim' (water), and you can imagine the wavy shape of the letter as a wave of water.",
    finalForm: "ם",
    finalNote: "At the end of a word it changes to ם (Mem sofit) — closed and square, like a box at the end.",
    examples: [
      { hebrew: "מַיִם", translit: "mayim", english: "water", emoji: "💧" },
      { hebrew: "אִמָּא", translit: "imma", english: "mother", emoji: "👩" },
      { hebrew: "שָׁלוֹם", translit: "shalom", english: "peace / hello", emoji: "🕊️" },
    ],
  },
  נ: {
    baseLetter: "נ",
    name: "Nun",
    sound: "N as in 'night'",
    description:
      "Nun is the N sound. Its name means 'fish' in Aramaic, and the shape is small and curled, like a little fish swimming.",
    finalForm: "ן",
    finalNote: "At the end of a word, Nun stretches into ן (Nun sofit) — a long line that drops below the row.",
    examples: [
      { hebrew: "נֵר", translit: "ner", english: "candle", emoji: "🕯️" },
      { hebrew: "נָהָר", translit: "nahar", english: "river", emoji: "🏞️" },
      { hebrew: "בֵּן", translit: "ben", english: "son", emoji: "👦" },
    ],
  },
  ס: {
    baseLetter: "ס",
    name: "Samech",
    sound: "S as in 'sun'",
    description:
      "Samech makes the S sound and is shaped like a closed circle — almost like a wheel rolling. It is one of two letters that can sound like 'S' (the other is Sin).",
    examples: [
      { hebrew: "סֵפֶר", translit: "sefer", english: "book", emoji: "📖" },
      { hebrew: "סוּס", translit: "sus", english: "horse", emoji: "🐴" },
      { hebrew: "סַבָּא", translit: "saba", english: "grandfather", emoji: "👴" },
    ],
  },
  ע: {
    baseLetter: "ע",
    name: "Ayin",
    sound: "silent — deep throat sound",
    description:
      "Ayin's name means 'eye'. In Modern Hebrew it is silent and just carries its vowel, but classically it is a deep sound made low in the throat — like the start of a yawn.",
    examples: [
      { hebrew: "עַיִן", translit: "ayin", english: "eye", emoji: "👁️" },
      { hebrew: "עֵץ", translit: "etz", english: "tree", emoji: "🌳" },
      { hebrew: "עִם", translit: "im", english: "with", emoji: "🤝" },
    ],
  },
  פ: {
    baseLetter: "פ",
    name: "Pe",
    sound: "P with a dot, F without",
    description:
      "Pe with a dot (פּ) sounds like P in 'pizza'. Without the dot (פ) it softens to F in 'fire'. Its name means 'mouth', and it is a great mouthy letter.",
    finalForm: "ף",
    finalNote: "At the end of a word it becomes ף (Pe sofit), almost always pronounced F.",
    examples: [
      { hebrew: "פֶּה", translit: "peh", english: "mouth", emoji: "👄" },
      { hebrew: "פִּיל", translit: "pil", english: "elephant", emoji: "🐘" },
      { hebrew: "פֶּרַח", translit: "perach", english: "flower", emoji: "🌸" },
    ],
  },
  צ: {
    baseLetter: "צ",
    name: "Tsadi",
    sound: "ts as in 'pizza'",
    description:
      "Tsadi makes a 'ts' sound — like the ending of 'cats' or the middle of 'pizza'. Press your tongue behind your teeth and let the 'ts' hiss out.",
    finalForm: "ץ",
    finalNote: "At the end of a word, Tsadi becomes ץ (Tsadi sofit) with a long tail.",
    examples: [
      { hebrew: "צָהוֹב", translit: "tzahov", english: "yellow", emoji: "🟡" },
      { hebrew: "צָפוֹן", translit: "tzafon", english: "north", emoji: "🧭" },
      { hebrew: "עֵץ", translit: "etz", english: "tree", emoji: "🌳" },
    ],
  },
  ק: {
    baseLetter: "ק",
    name: "Qof",
    sound: "K, deeper than Kaf",
    description:
      "Qof also sounds like K in modern Hebrew. In some traditions (Yemenite, Iraqi) it is pronounced deeper in the throat — a heavier 'Q' from the back.",
    examples: [
      { hebrew: "קָטָן", translit: "katan", english: "small", emoji: "🐭" },
      { hebrew: "קוֹף", translit: "kof", english: "monkey", emoji: "🐒" },
      { hebrew: "קוּם", translit: "kum", english: "get up!", emoji: "🌅" },
    ],
  },
  ר: {
    baseLetter: "ר",
    name: "Resh",
    sound: "R, rolled or guttural",
    description:
      "Resh is the R sound. In Modern Hebrew it is usually rolled at the back of the throat (like French R), not at the tip of the tongue like English R.",
    examples: [
      { hebrew: "רֹאשׁ", translit: "rosh", english: "head", emoji: "🧠" },
      { hebrew: "רוּחַ", translit: "ruach", english: "wind / spirit", emoji: "💨" },
      { hebrew: "רֶגֶל", translit: "regel", english: "leg / foot", emoji: "🦵" },
    ],
  },
  ש: {
    baseLetter: "ש",
    name: "Shin / Sin",
    sound: "Sh with right dot, S with left dot",
    description:
      "Shin has two personalities. With the dot on the upper-right (שׁ) it sounds 'sh' as in 'shalom'. With the dot on the upper-left (שׂ) it sounds 's' as in 'Sarah'.",
    examples: [
      { hebrew: "שָׁלוֹם", translit: "shalom", english: "peace / hello", emoji: "🕊️" },
      { hebrew: "שֶׁמֶשׁ", translit: "shemesh", english: "sun", emoji: "☀️" },
      { hebrew: "שַׂרָה", translit: "sara", english: "Sarah (name)", emoji: "👩" },
    ],
  },
  ת: {
    baseLetter: "ת",
    name: "Tav",
    sound: "T as in 'Torah'",
    description:
      "Tav is the very last letter of the alef-bet — a plain T sound. In Yemenite and old Ashkenazi pronunciation, Tav without a dot can also sound like 'S'.",
    examples: [
      { hebrew: "תּוֹדָה", translit: "toda", english: "thank you", emoji: "🙏" },
      { hebrew: "תֵּה", translit: "teh", english: "tea", emoji: "🍵" },
      { hebrew: "תַּפּוּחַ", translit: "tapuach", english: "apple", emoji: "🍎" },
    ],
  },
};

export interface LetterLesson {
  display: string;
  baseLetter: string;
  finalForm: string | null;
  name: string;
  sound: string;
  description: string;
  examples: LetterExample[];
}

export function normalizeHebrewLetter(letter: string): string {
  return FINAL_TO_BASE[letter] ?? letter;
}

export function getHebrewBaseLetter(segment: string): string | null {
  for (const c of Array.from(segment)) {
    if (HEBREW_BASE_LETTER_RE.test(c)) return normalizeHebrewLetter(c);
  }
  return null;
}

export function segmentHebrewWord(word: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter("he", { granularity: "grapheme" });
    return Array.from(segmenter.segment(word), (s) => s.segment);
  }
  return Array.from(word);
}

export function getLetterLesson(segment: string): LetterLesson | null {
  const baseLetter = getHebrewBaseLetter(segment);
  if (!baseLetter) return null;
  const info = LETTER_INFO[baseLetter];
  if (!info) return null;

  return {
    display: segment,
    baseLetter,
    finalForm: info.finalForm ?? null,
    name: info.name,
    sound: info.sound,
    description: info.description,
    examples: info.examples,
  };
}

export interface NikudInfo {
  /** Combining-mark codepoint (the actual nikud char). */
  mark: string;
  /** Character to display the mark on its own (often combined with א or ש). */
  display: string;
  name: string;
  sound: string;
  description: string;
  examples: LetterExample[];
}

const NIKUD_INFO: Record<string, NikudInfo> = {
  "\u05B7": {
    mark: "\u05B7",
    display: "\u25CC\u05B7",
    name: "Patach",
    sound: "short 'a' as in 'father'",
    description:
      "Patach is a small horizontal line under a letter. It makes a quick, open 'ah' sound — like saying 'ah' at the doctor.",
    examples: [
      { hebrew: "אַבָּא", translit: "aba", english: "father", emoji: "👨" },
      { hebrew: "יָד", translit: "yad", english: "hand", emoji: "🖐️" },
      { hebrew: "בַּיִת", translit: "bayit", english: "house", emoji: "🏠" },
    ],
  },
  "\u05B8": {
    mark: "\u05B8",
    display: "\u25CC\u05B8",
    name: "Kamatz",
    sound: "long 'a' (sometimes 'o')",
    description:
      "Kamatz looks like a small T under a letter. It sounds like 'ah' — almost the same as Patach. In a few words it sounds like 'o' (this is called Kamatz Katan).",
    examples: [
      { hebrew: "אָב", translit: "av", english: "father", emoji: "👨" },
      { hebrew: "שָׁלוֹם", translit: "shalom", english: "peace / hello", emoji: "🕊️" },
      { hebrew: "גָּדוֹל", translit: "gadol", english: "big", emoji: "🐘" },
    ],
  },
  "\u05B6": {
    mark: "\u05B6",
    display: "\u25CC\u05B6",
    name: "Segol",
    sound: "'e' as in 'bed'",
    description:
      "Segol is three little dots arranged like a triangle pointing down, sitting under the letter. It sounds like the 'e' in 'bed' or 'pen'.",
    examples: [
      { hebrew: "אֶרֶץ", translit: "eretz", english: "land", emoji: "🌍" },
      { hebrew: "מֶלֶךְ", translit: "melech", english: "king", emoji: "👑" },
      { hebrew: "פֶּה", translit: "peh", english: "mouth", emoji: "👄" },
    ],
  },
  "\u05B5": {
    mark: "\u05B5",
    display: "\u25CC\u05B5",
    name: "Tzere",
    sound: "'ey' as in 'they'",
    description:
      "Tzere is two dots side by side under the letter. It is a long 'ey' sound, like in 'they' or 'hey'.",
    examples: [
      { hebrew: "כֵּן", translit: "ken", english: "yes", emoji: "✅" },
      { hebrew: "סֵפֶר", translit: "sefer", english: "book", emoji: "📖" },
      { hebrew: "בֵּן", translit: "ben", english: "son", emoji: "👦" },
    ],
  },
  "\u05B4": {
    mark: "\u05B4",
    display: "\u25CC\u05B4",
    name: "Hiriq",
    sound: "'i' as in 'machine'",
    description:
      "Hiriq is a single dot under the letter. It sounds like 'ee' as in 'see' or 'machine'.",
    examples: [
      { hebrew: "אִמָּא", translit: "imma", english: "mother", emoji: "👩" },
      { hebrew: "עִיר", translit: "ir", english: "city", emoji: "🏙️" },
      { hebrew: "מִי", translit: "mi", english: "who?", emoji: "❓" },
    ],
  },
  "\u05B9": {
    mark: "\u05B9",
    display: "\u25CC\u05B9",
    name: "Holam",
    sound: "'o' as in 'go'",
    description:
      "Holam is a single dot above the letter (top-left). It sounds like 'oh'. When written with a vav (וֹ) it is called Holam Malei.",
    examples: [
      { hebrew: "רֹאשׁ", translit: "rosh", english: "head", emoji: "🧠" },
      { hebrew: "יוֹם", translit: "yom", english: "day", emoji: "☀️" },
      { hebrew: "טוֹב", translit: "tov", english: "good", emoji: "👍" },
    ],
  },
  "\u05BB": {
    mark: "\u05BB",
    display: "\u25CC\u05BB",
    name: "Kubutz",
    sound: "'u' as in 'rude'",
    description:
      "Kubutz is three little dots in a slanted line under the letter. It sounds like 'oo' in 'food' or 'rude'.",
    examples: [
      { hebrew: "שֻׁלְחָן", translit: "shulchan", english: "table", emoji: "🪑" },
      { hebrew: "סֻכָּר", translit: "sukar", english: "sugar", emoji: "🍬" },
      { hebrew: "חֻלְצָה", translit: "chultzah", english: "shirt", emoji: "👕" },
    ],
  },
  "\u05B0": {
    mark: "\u05B0",
    display: "\u25CC\u05B0",
    name: "Shva",
    sound: "silent or quick 'eh'",
    description:
      "Shva is two dots stacked vertically under the letter. Sometimes it is silent (skips the vowel), sometimes it is a fast 'eh' — like the 'e' in 'the'.",
    examples: [
      { hebrew: "שְׁמַע", translit: "shema", english: "listen / hear", emoji: "👂" },
      { hebrew: "פְּרִי", translit: "pri", english: "fruit", emoji: "🍎" },
      { hebrew: "לְךָ", translit: "lecha", english: "to you", emoji: "👉" },
    ],
  },
  "\u05BC": {
    mark: "\u05BC",
    display: "\u25CC\u05BC",
    name: "Dagesh",
    sound: "doubles or hardens the letter",
    description:
      "Dagesh is a small dot inside the letter. It hardens the sound: בּ becomes B (not V), כּ becomes K (not ch), פּ becomes P (not F). When it sits inside Vav it makes the 'oo' sound (וּ = Shuruk).",
    examples: [
      { hebrew: "אַבָּא", translit: "aba", english: "father", emoji: "👨" },
      { hebrew: "כִּסֵּא", translit: "kise", english: "chair", emoji: "🪑" },
      { hebrew: "סֻכָּר", translit: "sukar", english: "sugar", emoji: "🍬" },
    ],
  },
  "\u05C1": {
    mark: "\u05C1",
    display: "\u05E9\u05C1",
    name: "Shin dot",
    sound: "'sh' as in 'shoe'",
    description:
      "A dot on the upper-right of the letter Shin tells you to read it as 'sh', like in 'shalom' or 'shoe'.",
    examples: [
      { hebrew: "שָׁלוֹם", translit: "shalom", english: "peace / hello", emoji: "🕊️" },
      { hebrew: "שֶׁמֶשׁ", translit: "shemesh", english: "sun", emoji: "☀️" },
      { hebrew: "שַׁבָּת", translit: "shabbat", english: "Sabbath", emoji: "🕯️" },
    ],
  },
  "\u05C2": {
    mark: "\u05C2",
    display: "\u05E9\u05C2",
    name: "Sin dot",
    sound: "'s' as in 'sun'",
    description:
      "A dot on the upper-left of the letter Shin turns it into Sin — pronounced 's', the same as Samech.",
    examples: [
      { hebrew: "שָׂרָה", translit: "sarah", english: "Sarah (name)", emoji: "👩" },
      { hebrew: "שָׂמֵחַ", translit: "sameach", english: "happy", emoji: "😊" },
      { hebrew: "יִשְׂרָאֵל", translit: "yisrael", english: "Israel", emoji: "🇮🇱" },
    ],
  },
};

const HATAF_TO_BASE: Record<string, string> = {
  "\u05B1": "\u05B6",
  "\u05B2": "\u05B7",
  "\u05B3": "\u05B8",
};

const NIKUD_CHARS = new Set<string>([
  ...Object.keys(NIKUD_INFO),
  ...Object.keys(HATAF_TO_BASE),
]);

export function getNikudInSegment(segment: string): NikudInfo[] {
  const seen = new Set<string>();
  const result: NikudInfo[] = [];
  for (const c of Array.from(segment)) {
    if (!NIKUD_CHARS.has(c)) continue;
    const key = HATAF_TO_BASE[c] ?? c;
    if (seen.has(key)) continue;
    const info = NIKUD_INFO[key];
    if (!info) continue;
    seen.add(key);
    result.push(info);
  }
  return result;
}

/** Returns each unique nikud appearing anywhere in the word, in reading order. */
export function getNikudInWord(word: string): NikudInfo[] {
  const seen = new Set<string>();
  const result: NikudInfo[] = [];
  for (const c of Array.from(word)) {
    if (!NIKUD_CHARS.has(c)) continue;
    const key = HATAF_TO_BASE[c] ?? c;
    if (seen.has(key)) continue;
    const info = NIKUD_INFO[key];
    if (!info) continue;
    seen.add(key);
    result.push(info);
  }
  return result;
}

export function getNikudLesson(mark: string): NikudInfo | null {
  const key = HATAF_TO_BASE[mark] ?? mark;
  return NIKUD_INFO[key] ?? null;
}
