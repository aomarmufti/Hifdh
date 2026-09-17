// Surah table for the standard 604-page Madani mushaf.
// `page` is the page the surah BEGINS on. A surah's last page is the page the
// next surah begins on, because two surahs routinely share a page.
export const SURAHS = [
  { n:   1, name: 'Al-Fatihah',    page:   1 },
  { n:   2, name: 'Al-Baqarah',    page:   2 },
  { n:   3, name: "Ali 'Imran",    page:  50 },
  { n:   4, name: 'An-Nisa',       page:  77 },
  { n:   5, name: "Al-Ma'idah",    page: 106 },
  { n:   6, name: "Al-An'am",      page: 128 },
  { n:   7, name: "Al-A'raf",      page: 151 },
  { n:   8, name: 'Al-Anfal',      page: 177 },
  { n:   9, name: 'At-Tawbah',     page: 187 },
  { n:  10, name: 'Yunus',         page: 208 },
  { n:  11, name: 'Hud',           page: 221 },
  { n:  12, name: 'Yusuf',         page: 235 },
  { n:  13, name: "Ar-Ra'd",       page: 249 },
  { n:  14, name: 'Ibrahim',       page: 255 },
  { n:  15, name: 'Al-Hijr',       page: 262 },
  { n:  16, name: 'An-Nahl',       page: 267 },
  { n:  17, name: 'Al-Isra',       page: 282 },
  { n:  18, name: 'Al-Kahf',       page: 293 },
  { n:  19, name: 'Maryam',        page: 305 },
  { n:  20, name: 'Ta-Ha',         page: 312 },
  { n:  21, name: 'Al-Anbiya',     page: 322 },
  { n:  22, name: 'Al-Hajj',       page: 332 },
  { n:  23, name: "Al-Mu'minun",   page: 342 },
  { n:  24, name: 'An-Nur',        page: 350 },
  { n:  25, name: 'Al-Furqan',     page: 359 },
  { n:  26, name: "Ash-Shu'ara",   page: 367 },
  { n:  27, name: 'An-Naml',       page: 377 },
  { n:  28, name: 'Al-Qasas',      page: 385 },
  { n:  29, name: "Al-'Ankabut",   page: 396 },
  { n:  30, name: 'Ar-Rum',        page: 404 },
  { n:  31, name: 'Luqman',        page: 411 },
  { n:  32, name: 'As-Sajdah',     page: 415 },
  { n:  33, name: 'Al-Ahzab',      page: 418 },
  { n:  34, name: 'Saba',          page: 428 },
  { n:  35, name: 'Fatir',         page: 434 },
  { n:  36, name: 'Ya-Sin',        page: 440 },
  { n:  37, name: 'As-Saffat',     page: 446 },
  { n:  38, name: 'Sad',           page: 453 },
  { n:  39, name: 'Az-Zumar',      page: 458 },
  { n:  40, name: 'Ghafir',        page: 467 },
  { n:  41, name: 'Fussilat',      page: 477 },
  { n:  42, name: 'Ash-Shura',     page: 483 },
  { n:  43, name: 'Az-Zukhruf',    page: 489 },
  { n:  44, name: 'Ad-Dukhan',     page: 496 },
  { n:  45, name: 'Al-Jathiyah',   page: 499 },
  { n:  46, name: 'Al-Ahqaf',      page: 502 },
  { n:  47, name: 'Muhammad',      page: 507 },
  { n:  48, name: 'Al-Fath',       page: 511 },
  { n:  49, name: 'Al-Hujurat',    page: 515 },
  { n:  50, name: 'Qaf',           page: 518 },
  { n:  51, name: 'Adh-Dhariyat',  page: 520 },
  { n:  52, name: 'At-Tur',        page: 523 },
  { n:  53, name: 'An-Najm',       page: 526 },
  { n:  54, name: 'Al-Qamar',      page: 528 },
  { n:  55, name: 'Ar-Rahman',     page: 531 },
  { n:  56, name: "Al-Waqi'ah",    page: 534 },
  { n:  57, name: 'Al-Hadid',      page: 537 },
  { n:  58, name: 'Al-Mujadila',   page: 542 },
  { n:  59, name: 'Al-Hashr',      page: 545 },
  { n:  60, name: 'Al-Mumtahanah', page: 549 },
  { n:  61, name: 'As-Saff',       page: 551 },
  { n:  62, name: "Al-Jumu'ah",    page: 553 },
  { n:  63, name: 'Al-Munafiqun',  page: 554 },
  { n:  64, name: 'At-Taghabun',   page: 556 },
  { n:  65, name: 'At-Talaq',      page: 558 },
  { n:  66, name: 'At-Tahrim',     page: 560 },
  { n:  67, name: 'Al-Mulk',       page: 562 },
  { n:  68, name: 'Al-Qalam',      page: 564 },
  { n:  69, name: 'Al-Haqqah',     page: 566 },
  { n:  70, name: "Al-Ma'arij",    page: 568 },
  { n:  71, name: 'Nuh',           page: 570 },
  { n:  72, name: 'Al-Jinn',       page: 572 },
  { n:  73, name: 'Al-Muzzammil',  page: 574 },
  { n:  74, name: 'Al-Muddaththir',page: 575 },
  { n:  75, name: 'Al-Qiyamah',    page: 577 },
  { n:  76, name: 'Al-Insan',      page: 578 },
  { n:  77, name: 'Al-Mursalat',   page: 580 },
  { n:  78, name: 'An-Naba',       page: 582 },
  { n:  79, name: "An-Nazi'at",    page: 583 },
  { n:  80, name: "'Abasa",        page: 585 },
  { n:  81, name: 'At-Takwir',     page: 586 },
  { n:  82, name: 'Al-Infitar',    page: 587 },
  { n:  83, name: 'Al-Mutaffifin', page: 587 },
  { n:  84, name: 'Al-Inshiqaq',   page: 589 },
  { n:  85, name: 'Al-Buruj',      page: 590 },
  { n:  86, name: 'At-Tariq',      page: 591 },
  { n:  87, name: "Al-A'la",       page: 591 },
  { n:  88, name: 'Al-Ghashiyah',  page: 592 },
  { n:  89, name: 'Al-Fajr',       page: 593 },
  { n:  90, name: 'Al-Balad',      page: 594 },
  { n:  91, name: 'Ash-Shams',     page: 595 },
  { n:  92, name: 'Al-Layl',       page: 595 },
  { n:  93, name: 'Ad-Duha',       page: 596 },
  { n:  94, name: 'Ash-Sharh',     page: 596 },
  { n:  95, name: 'At-Tin',        page: 597 },
  { n:  96, name: "Al-'Alaq",      page: 597 },
  { n:  97, name: 'Al-Qadr',       page: 598 },
  { n:  98, name: 'Al-Bayyinah',   page: 598 },
  { n:  99, name: 'Az-Zalzalah',   page: 599 },
  { n: 100, name: "Al-'Adiyat",    page: 599 },
  { n: 101, name: "Al-Qari'ah",    page: 600 },
  { n: 102, name: 'At-Takathur',   page: 600 },
  { n: 103, name: "Al-'Asr",       page: 601 },
  { n: 104, name: 'Al-Humazah',    page: 601 },
  { n: 105, name: 'Al-Fil',        page: 601 },
  { n: 106, name: 'Quraysh',       page: 602 },
  { n: 107, name: "Al-Ma'un",      page: 602 },
  { n: 108, name: 'Al-Kawthar',    page: 602 },
  { n: 109, name: 'Al-Kafirun',    page: 603 },
  { n: 110, name: 'An-Nasr',       page: 603 },
  { n: 111, name: 'Al-Masad',      page: 603 },
  { n: 112, name: 'Al-Ikhlas',     page: 604 },
  { n: 113, name: 'Al-Falaq',      page: 604 },
  { n: 114, name: 'An-Nas',        page: 604 }
];

export const LAST_PAGE = 604;

// The page a surah ends on: where the next one starts (they can share a page).
export function surahEndPage(n) {
  const next = SURAHS.find((s) => s.n === n + 1);
  return next ? next.page : LAST_PAGE;
}

export function surahByNumber(n) { return SURAHS.find((s) => s.n === n); }

// The surah you are reading when you open page p. Several short surahs can
// begin on one page, so if any starts exactly on p the page opens with the
// first of them; otherwise a surah from an earlier page is still running.
export function surahAtPage(p) {
  const startsHere = SURAHS.find((s) => s.page === p);
  if (startsHere) return startsHere;
  let running = SURAHS[0];
  for (const s of SURAHS) { if (s.page < p) running = s; else break; }
  return running;
}

// The surahs actually recited when reading [from, to]: the surah running at the
// first page, plus every surah that begins inside the range. A surah merely
// ending on the first page (sharing it with the next) is not included.
export function surahsInPages(from, to) {
  const a = Math.min(from, to), b = Math.max(from, to);
  const out = [surahAtPage(a)];
  for (const s of SURAHS) {
    if (s.page >= a && s.page <= b && !out.includes(s)) out.push(s);
  }
  return out;
}

// "Al-Mulk" | "Al-Mulk -> Al-Haqqah" for a page range.
export function labelForPages(from, to) {
  const list = surahsInPages(from, to);
  if (!list.length) return '';
  if (list.length === 1) return list[0].name;
  return `${list[0].name} → ${list[list.length - 1].name}`;
}

export function pageCount(from, to) {
  return Math.abs(to - from) + 1;
}

// The page range covered by a span of surahs, inclusive.
export function pagesForSurahRange(fromSurah, toSurah) {
  const lo = Math.min(fromSurah, toSurah), hi = Math.max(fromSurah, toSurah);
  return { from: surahByNumber(lo).page, to: surahEndPage(hi) };
}

// Ayat per surah, in order. Totals 6236, the standard Kufan count - which is
// what makes this table checkable rather than merely plausible. Used to keep a
// verse reference honest: you cannot reflect on Al-Kawthar 9.
export const AYAH_COUNTS = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109,
  123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
  112, 78, 118, 64, 77, 227, 93, 88, 69, 60,
  34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
  54, 53, 89, 59, 37, 35, 38, 29, 18, 45,
  60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
  14, 11, 11, 18, 12, 12, 30, 52, 52, 44,
  28, 28, 20, 56, 40, 31, 50, 40, 46, 42,
  29, 19, 36, 25, 22, 17, 19, 26, 30, 20,
  15, 21, 11, 8, 8, 19, 5, 8, 8, 11,
  11, 8, 3, 9, 5, 4, 7, 3, 6, 3,
  5, 4, 5, 6
];

export const ayahCount = (n) => AYAH_COUNTS[n - 1] ?? 0;

// "Al-Baqarah 255" or "Al-Baqarah 255-257"
export function formatRef(surahNumber, from, to) {
  const s = surahByNumber(surahNumber);
  if (!s) return '';
  if (!from) return s.name;
  return to && to !== from ? `${s.name} ${from}\u2013${to}` : `${s.name} ${from}`;
}
