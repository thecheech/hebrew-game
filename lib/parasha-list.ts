/**
 * Complete ordered list of all 54 Torah portions.
 * slug matches the public/parasha/{slug}/ directory.
 * availableAliyot is set at build time; empty means data not yet generated.
 */

export type ParashaEntry = {
  id: string;          // PocketTorah canonical name, e.g. "Achrei Mot"
  slug: string;        // URL slug, e.g. "achrei-mot"
  hebrew: string;      // Pointed Hebrew name
  book: "Genesis" | "Exodus" | "Leviticus" | "Numbers" | "Deuteronomy";
  num: number;         // 1–54
};

export const PARASHA_LIST: ParashaEntry[] = [
  // ── Genesis ──────────────────────────────────────────────────────────────
  { num:  1, id: "Bereshit",          slug: "bereshit",          hebrew: "בְּרֵאשִׁית",      book: "Genesis"      },
  { num:  2, id: "Noach",             slug: "noach",             hebrew: "נֹחַ",             book: "Genesis"      },
  { num:  3, id: "Lech-Lecha",        slug: "lech-lecha",        hebrew: "לֶךְ־לְךָ",        book: "Genesis"      },
  { num:  4, id: "Vayera",            slug: "vayera",            hebrew: "וַיֵּרָא",         book: "Genesis"      },
  { num:  5, id: "Chayei Sara",       slug: "chayei-sara",       hebrew: "חַיֵּי שָׂרָה",    book: "Genesis"      },
  { num:  6, id: "Toldot",            slug: "toldot",            hebrew: "תּוֹלְדוֹת",       book: "Genesis"      },
  { num:  7, id: "Vayetzei",          slug: "vayetzei",          hebrew: "וַיֵּצֵא",         book: "Genesis"      },
  { num:  8, id: "Vayishlach",        slug: "vayishlach",        hebrew: "וַיִּשְׁלַח",      book: "Genesis"      },
  { num:  9, id: "Vayeshev",          slug: "vayeshev",          hebrew: "וַיֵּשֶׁב",        book: "Genesis"      },
  { num: 10, id: "Miketz",            slug: "miketz",            hebrew: "מִקֵּץ",           book: "Genesis"      },
  { num: 11, id: "Vayigash",          slug: "vayigash",          hebrew: "וַיִּגַּשׁ",       book: "Genesis"      },
  { num: 12, id: "Vayechi",           slug: "vayechi",           hebrew: "וַיְחִי",          book: "Genesis"      },
  // ── Exodus ───────────────────────────────────────────────────────────────
  { num: 13, id: "Shemot",            slug: "shemot",            hebrew: "שְׁמוֹת",          book: "Exodus"       },
  { num: 14, id: "Vaera",             slug: "vaera",             hebrew: "וָאֵרָא",          book: "Exodus"       },
  { num: 15, id: "Bo",                slug: "bo",                hebrew: "בֹּא",             book: "Exodus"       },
  { num: 16, id: "Beshalach",         slug: "beshalach",         hebrew: "בְּשַׁלַּח",       book: "Exodus"       },
  { num: 17, id: "Yitro",             slug: "yitro",             hebrew: "יִתְרוֹ",          book: "Exodus"       },
  { num: 18, id: "Mishpatim",         slug: "mishpatim",         hebrew: "מִשְׁפָּטִים",     book: "Exodus"       },
  { num: 19, id: "Terumah",           slug: "terumah",           hebrew: "תְּרוּמָה",        book: "Exodus"       },
  { num: 20, id: "Tetzaveh",          slug: "tetzaveh",          hebrew: "תְּצַוֶּה",        book: "Exodus"       },
  { num: 21, id: "Ki Tisa",           slug: "ki-tisa",           hebrew: "כִּי תִשָּׂא",     book: "Exodus"       },
  { num: 22, id: "Vayakhel",          slug: "vayakhel",          hebrew: "וַיַּקְהֵל",       book: "Exodus"       },
  { num: 23, id: "Pekudei",           slug: "pekudei",           hebrew: "פְקוּדֵי",         book: "Exodus"       },
  // ── Leviticus ────────────────────────────────────────────────────────────
  { num: 24, id: "Vayikra",           slug: "vayikra",           hebrew: "וַיִּקְרָא",       book: "Leviticus"    },
  { num: 25, id: "Tzav",              slug: "tzav",              hebrew: "צַו",              book: "Leviticus"    },
  { num: 26, id: "Shmini",            slug: "shmini",            hebrew: "שְּׁמִינִי",       book: "Leviticus"    },
  { num: 27, id: "Tazria",            slug: "tazria",            hebrew: "תַזְרִיעַ",        book: "Leviticus"    },
  { num: 28, id: "Metzora",           slug: "metzora",           hebrew: "מְּצֹרָע",         book: "Leviticus"    },
  { num: 29, id: "Achrei Mot",        slug: "achrei-mot",        hebrew: "אַחֲרֵי מוֹת",     book: "Leviticus"    },
  { num: 30, id: "Kedoshim",          slug: "kedoshim",          hebrew: "קְדשִׁים",         book: "Leviticus"    },
  { num: 31, id: "Emor",              slug: "emor",              hebrew: "אֱמוֹר",           book: "Leviticus"    },
  { num: 32, id: "Behar",             slug: "behar",             hebrew: "בְּהַר",           book: "Leviticus"    },
  { num: 33, id: "Bechukotai",        slug: "bechukotai",        hebrew: "בְּחֻקֹּתַי",     book: "Leviticus"    },
  // ── Numbers ──────────────────────────────────────────────────────────────
  { num: 34, id: "Bamidbar",          slug: "bamidbar",          hebrew: "בְּמִדְבַּר",      book: "Numbers"      },
  { num: 35, id: "Nasso",             slug: "nasso",             hebrew: "נָשׂא",            book: "Numbers"      },
  { num: 36, id: "Beha'alotcha",      slug: "behaalotcha",       hebrew: "בְּהַעֲלֹתְךָ",   book: "Numbers"      },
  { num: 37, id: "Sh'lach",           slug: "shlach",            hebrew: "שְׁלַח־לְךָ",      book: "Numbers"      },
  { num: 38, id: "Korach",            slug: "korach",            hebrew: "קוֹרַח",           book: "Numbers"      },
  { num: 39, id: "Chukat",            slug: "chukat",            hebrew: "חֻקַּת",           book: "Numbers"      },
  { num: 40, id: "Balak",             slug: "balak",             hebrew: "בָּלָק",           book: "Numbers"      },
  { num: 41, id: "Pinchas",           slug: "pinchas",           hebrew: "פִּינְחָס",        book: "Numbers"      },
  { num: 42, id: "Matot",             slug: "matot",             hebrew: "מַּטּוֹת",         book: "Numbers"      },
  { num: 43, id: "Masei",             slug: "masei",             hebrew: "מַסְעֵי",          book: "Numbers"      },
  // ── Deuteronomy ──────────────────────────────────────────────────────────
  { num: 44, id: "Devarim",           slug: "devarim",           hebrew: "דְּבָרִים",        book: "Deuteronomy"  },
  { num: 45, id: "Va'ethanan",        slug: "vaethanan",         hebrew: "וָאֶתְחַנַּן",     book: "Deuteronomy"  },
  { num: 46, id: "Eikev",             slug: "eikev",             hebrew: "עֵקֶב",            book: "Deuteronomy"  },
  { num: 47, id: "Re'eh",             slug: "reeh",              hebrew: "רְאֵה",            book: "Deuteronomy"  },
  { num: 48, id: "Shoftim",           slug: "shoftim",           hebrew: "שׁוֹפְטִים",       book: "Deuteronomy"  },
  { num: 49, id: "Ki Teitzei",        slug: "ki-teitzei",        hebrew: "כִּי־תֵצֵא",       book: "Deuteronomy"  },
  { num: 50, id: "Ki Tavo",           slug: "ki-tavo",           hebrew: "כִּי־תָבוֹא",      book: "Deuteronomy"  },
  { num: 51, id: "Nitzavim",          slug: "nitzavim",          hebrew: "נִצָּבִים",        book: "Deuteronomy"  },
  { num: 52, id: "Vayeilech",         slug: "vayeilech",         hebrew: "וַיֵּלֶךְ",        book: "Deuteronomy"  },
  { num: 53, id: "Haazinu",           slug: "haazinu",           hebrew: "הַאֲזִינוּ",       book: "Deuteronomy"  },
  { num: 54, id: "Vezot Haberakhah",  slug: "vezot-haberakhah",  hebrew: "וְזֹאת הַבְּרָכָה", book: "Deuteronomy" },
];

export const BOOK_LABELS: Record<ParashaEntry["book"], string> = {
  Genesis:      "Bereishit / Genesis",
  Exodus:       "Shemot / Exodus",
  Leviticus:    "Vayikra / Leviticus",
  Numbers:      "Bamidbar / Numbers",
  Deuteronomy:  "Devarim / Deuteronomy",
};

/** Return the ParashaEntry for a given URL slug, or undefined. */
export function findBySlug(slug: string): ParashaEntry | undefined {
  return PARASHA_LIST.find((p) => p.slug === slug);
}
