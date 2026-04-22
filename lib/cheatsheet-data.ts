export interface LetterRow {
  letter: string;
  final?: string;
  name: string;
  translit: string;
  example: string;
}

export interface NikudRow {
  mark: string;
  name: string;
  sound: string;
  example: string;
}

export const letterRows: LetterRow[] = [
  {
    letter: "א",
    name: "Alef",
    translit: "silent / glottal stop",
    example: "אָב av (father)",
  },
  { letter: "ב", name: "Bet", translit: "b / v", example: "בַּיִת bayit" },
  { letter: "ג", name: "Gimel", translit: "g", example: "גָּדוֹל gadol" },
  { letter: "ד", name: "Dalet", translit: "d", example: "דֶּלֶת delet" },
  { letter: "ה", name: "He", translit: "h (often silent)", example: "הוּא hu" },
  { letter: "ו", name: "Vav", translit: "v / u / o", example: "וְ ve (and)" },
  { letter: "ז", name: "Zayin", translit: "z", example: "זֶה zeh" },
  { letter: "ח", name: "Chet", translit: "ch (guttural)", example: "חַם cham" },
  { letter: "ט", name: "Tet", translit: "t", example: "טוֹב tov" },
  { letter: "י", name: "Yod", translit: "y / i", example: "יוֹם yom" },
  { letter: "כ", final: "ך", name: "Kaf", translit: "k / ch", example: "כֶּלֶב kelev" },
  { letter: "ל", name: "Lamed", translit: "l", example: "לֶחֶם lechem" },
  { letter: "מ", final: "ם", name: "Mem", translit: "m", example: "מַיִם mayim" },
  { letter: "נ", final: "ן", name: "Nun", translit: "n", example: "נָהָר nahar" },
  { letter: "ס", name: "Samech", translit: "s", example: "סֵפֶר sefer" },
  { letter: "ע", name: "Ayin", translit: "silent / guttural", example: "עֵץ etz" },
  { letter: "פ", final: "ף", name: "Pe", translit: "p / f", example: "פֶּה peh" },
  { letter: "צ", final: "ץ", name: "Tsadi", translit: "ts", example: "צָהוֹב tzahov" },
  { letter: "ק", name: "Qof", translit: "k", example: "קָטָן katan" },
  { letter: "ר", name: "Resh", translit: "r", example: "רֹאשׁ rosh" },
  { letter: "ש", name: "Shin / Sin", translit: "sh / s", example: "שָׁלוֹם shalom" },
  { letter: "ת", name: "Tav", translit: "t", example: "תּוֹדָה toda" },
];

export const nikudRows: NikudRow[] = [
  { mark: "ַ", name: "Patach", sound: "a (as in father)", example: "אַבָּא aba" },
  { mark: "ָ", name: "Kamatz", sound: "a / o", example: "אָב av" },
  { mark: "ֶ", name: "Segol", sound: "e", example: "סֵפֶר sefer" },
  { mark: "ֵ", name: "Tzere", sound: "e", example: "כֵּן ken" },
  { mark: "ִ", name: "Hiriq", sound: "i", example: "אִמָּא imma" },
  { mark: "ֹ", name: "Holam", sound: "o", example: "שָׁלוֹם shalom" },
  { mark: "ֻ", name: "Kubutz", sound: "u", example: "שֻׁלְחָן shulchan" },
  { mark: "וּ", name: "Shuruk", sound: "u", example: "אַתָּה ata" },
  { mark: "ְ", name: "Shva", sound: "silent / reduced e", example: "לְמַעַן lema'an" },
  { mark: "ּ", name: "Dagesh", sound: "doubles / hardens", example: "כִּסֵּא kise" },
  { mark: "ׁ", name: "Shin dot (right)", sound: "sh", example: "שָׁלוֹם" },
  { mark: "ׂ", name: "Sin dot (left)", sound: "s", example: "יִשְׂרָאֵל" },
];
