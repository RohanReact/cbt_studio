/** Shree-Dev 0708 legacy font codes to Unicode Devanagari. */
const PAIRS: ReadonlyArray<readonly [string, string]> = [[">",""],["$",""],["[","{"],["p","{"],["“","\""],["”","'"],["µH","क़"],["™","ख़्"],["˜","ख़"],["µJ","ग़"],["µO","ज़"],["µS","ड़"],["µT","ढ़"],["µ\\","फ़"],["ª","ं©"],["£","ै©"],["¤","ैं©"],["u","ी©"],["v","ीं©"],["}","े©"],["]","ें©"],["›","ॐ"],["@","ऽ"],["&","।"],["\"","‘"],["'","’"],["ú","क्ष्"],["j","क्ष"],["k","ज्ञ"],["l","श्र"],["Ì","त्र"],["Í","त्र्"],["Î","त्त्"],["®","्रु"],["¯","्रू"],["é","रु"],["ê","रू"],["#","ञ्च्"],["‚","ज्ज्"],["ƒ","च्च"],["„","ल्ल"],["†","ह्ण"],["‡","ह्ल"],["ˆ","ह्व"],["‰","्व"],["’","ङ्क"],["“","ङ्ख"],["”","ङ्ग"],["•","ङ्घ"],["¬","ङ्क्ष"],["–","ह्न"],["—","ड्ढ"],["œ","श्व"],["³","्न"],["¶","ङ्म"],["¸","क्क"],["¹","क्व"],["º","क्त"],["¼","ख्र"],["Ã","झ्र"],["¾","ग्न"],["Å","ट्ट"],["Æ","ट्ठ"],["Ç","ठ्ठ"],["È","ड्ड"],["É","ड्ढ"],["Ð","द्र"],["Ñ","दृ"],["Ò","द्ग"],["Ó","द्घ"],["Ô","द्द"],["Õ","द्ध"],["Ö","द्न"],["×","द्ब"],["Ø","द्भ"],["Ù","द्म"],["Ú","द्य"],["Û","द्व"],["Þ","न्न"],["à","प्र"],["á","प्त"],["ï","ष्ट"],["ð","ष्ठ"],["ò","स्र"],["ó","स्त्र"],["õ","ह्र"],["ö","हृ"],["÷","ह्म"],["ø","ह्य"],["ü","श्च"],["ý","श्न"],["ç","्य"],["Œ","्र"],["´","्र"],["«","्र"],["Š","क्"],["»","ख्"],["½","ग्"],["¿","घ्"],["H","क"],["I","ख"],["J","ग"],["K","घ"],["L","ङ"],["À","च्"],["Á","ज्"],["Â","झ्"],["Ä","ञ्"],["M","च"],["N","छ"],["O","ज"],["P","झ"],["Q","ट"],["R","ठ"],["S","ड"],["T","ढ"],["Ê","ण्"],["U","ण"],["Ë","त्"],["Ï","थ्"],["Ü","ध्"],["Ý","न्"],["V","त"],["W","थ"],["X","द"],["Y","ध"],["Z","न"],["ß","प्"],["â","फ्"],["ã","ब्"],["ä","भ्"],["å","म्"],["n","प"],["\\","फ"],["~","ब"],["^","भ"],["_","म"],["æ","य्"],["ë","ल्"],["ì","व्"],["í","श्"],["î","ष्"],["ù","ळ्"],["û","श्"],["ñ","स्"],["ô","ह्"],["`","य"],["a","र"],["b","ल"],["c","ल"],["d","व"],["e","श"],["f","ष"],["g","स"],["h","ह"],["i","ळ"],["Am¡","औ"],["Amo","ओ"],["Am°","ऑ"],["Am","आ"],["A","अ"],["B©","ई"],["B","इ"],["C","उ"],["D","ऊ"],["F","ऋ"],["G","ॠ"],["Eo","ऐ"],["E","ए"],["m","ा"],["r","ी"],["s","ी"],["t","ीं"],["ww","ु"],["w","ु"],["x","ु"],["y","ू"],["z","ू"],["¥","ृ"],["¦","ॄ"],["|","ें"],["o","े"],["¡","ै"],["¢","ैं"],["…","ः"],["§§","ं"],["§","ं"],["¨","ं"],["µ","़"],["þ","ु"],["ÿ","ू"],["°","ॅ"],["±","ँ"],["²","्"],["्ा",""],["्ो","े"],["्ौ","ै"],["अो","ओ"],["अा","आ"],["आै","औ"],["आे","ओ"],["ाो","ो"],["ाॅ","ॉ"],["ॅा","ॉ"],["ाे","ो"],["ंु","ुं"],["ेे","े"],["अै","अ‍ै"],["ाे","ो"],["अे","अ‍े"],["ंा","ां"],["अॅ","अ‍ॅ"],["ाै","ौ"],["ैा","ौ"],["ंृ","ृं"],["ँा","ाँ"],["ँू","ूँ"],["ेा","ो"],["ंे","ें"],["ाें","ों"],["ॅं","ँ"],["ंॅ","ँ"],[" ः"," :"],["ंू","ूं"]] as ReadonlyArray<readonly [string, string]>;

/**
 * Some Shree-Dev7 files report य म फ क् as ¶ ‘ ’ ³.
 * Those four are remapped onto the classic codes before the table runs.
 * Classic ङ्म (also ¶) is rare next to how often Dev7 uses ¶ for य.
 */
const REMAP: Record<string, string> = {
  '\u00B6': '`',
  '\u2018': '_',
  '\u2019': '\\',
  '\u00B3': '\u0160',
};

const MATRAS = new Set([...'ािीुूृेैोौं:ँॅ']);
const CONSONANT = '[कखगघङचछजझञटठडड़ढढ़णतथदधनपफबभमयरलवशषसहक़ख़ग़ज़ड़ढ़फ़©]';

const SIG = new Set<number>();
for (const [from] of PAIRS) {
  for (const ch of from) {
    const cp = ch.codePointAt(0)!;
    if (cp > 127) SIG.add(cp);
  }
}
for (const ch of Object.keys(REMAP)) SIG.add(ch.codePointAt(0)!);

export function shreeSignatureCount(text: string) {
  let n = 0;
  for (const ch of text) if (SIG.has(ch.codePointAt(0)!)) n++;
  return n;
}

const ENGLISH_WORD =
  /^(?:this|that|with|from|have|booklet|test|paper|page|read|only|your|which|their|there|these|those|candidate|candidates|instruction|instructions|language|marathi|hindi|english|answer|question|questions|following|carefully|supplement|printed|pages|open|until|asked|code|part|name|roll|centre|center|signature|invigilator|main|back|cover|general|important|rough|work|space|number|serial|book|time|allowed|marks|each|correct|option|darken|circle|ball|point|sheet|side|not|both|either|wish|please|ensure|write|fill|given|below|above|other|such|also|using|must|should|would|could|does|been|being|what|when|where|while|about|after|before|will|they|them|then|than|into|over|under|between|school|board|exam|the|and|for|was|were|has|had|its|who|how|per|all|any|can|may|you|are|his|her|she|him|our|out|one|two|during|period|children|child|development)$/i;

/** Dashes and quotes appear in ordinary English and also in the Shree table. They are not evidence of Shree. */
const TYPOGRAPHIC = new Set([...'–—―‘’“”•…«»·']);

/** True when a font's extracted text is Shree-Dev codes rather than English. */
export function fontLooksLikeShree(text: string) {
  let strong = 0;
  let caret = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (ch === '$' || ch === '>' || ch === '{' || (cp > 160 && SIG.has(cp) && !TYPOGRAPHIC.has(ch))) strong++;
    if (ch === '^' || ch === '~' || ch === '`') caret++;
  }
  const tokens = text.split(/[^A-Za-z]+/).filter((t) => t.length >= 2);
  const english = tokens.some((t) => ENGLISH_WORD.test(t));
  const mixed = tokens.some((t) => t.length >= 4 && /[A-Z]/.test(t) && /[a-z]/.test(t));
  // Shree codes such as "Zmhr" have no vowels. English words such as "Child" do.
  const vowelless = tokens.some((t) => t.length >= 4 && !/[aeiou]/i.test(t));
  if (english && strong < 6) return false;
  if (strong >= 2) return true;
  if (!english && caret >= 1 && (strong >= 1 || mixed || vowelless)) return true;
  if (!english && mixed && vowelless) return true;
  return false;
}

export function shreeDevToUnicode(input: string) {
  let s = '';
  for (const ch of input) s += REMAP[ch] ?? ch;
  for (const [from, to] of PAIRS) {
    if (from && s.includes(from)) s = s.split(from).join(to);
  }
  let i = s.indexOf('{');
  while (i !== -1) {
    const next = s.charAt(i + 1);
    s = s.slice(0, i) + next + 'ि' + s.slice(i + (next ? 2 : 1));
    i = s.indexOf('{', i + 1);
  }
  const half = () => new RegExp(`([q])(्)(${CONSONANT})`, 'g');
  const cons = () => new RegExp(`([q])(${CONSONANT})`, 'g');
  s = s.replace(half(), '$2$3$1').replace(half(), '$2$3$1').replace(cons(), '$2$1').replace(/q/g, 'िं');
  for (const [mark, matra] of [
    ['ि्', 'ि'],
    ['िं्', 'िं'],
  ] as const) {
    let p = s.indexOf(mark);
    while (p !== -1) {
      const next = s.charAt(p + mark.length);
      s = s.slice(0, p) + '्' + next + matra + s.slice(p + mark.length + (next ? 1 : 0));
      p = s.indexOf(mark, p + 2);
    }
  }
  let guard = 0;
  let r = s.indexOf('©');
  while (r > 0 && guard++ < 2000) {
    let at = r - 1;
    while (at > 0) {
      const ch = s.charAt(at);
      if (MATRAS.has(ch) || ch === '्') {
        at--;
        continue;
      }
      if (s.charAt(at - 1) === '्') {
        at -= 2;
        continue;
      }
      break;
    }
    if (at < 0) break;
    const cluster = s.slice(at, r);
    s = s.slice(0, at) + 'र्' + cluster + s.slice(r + 1);
    const nextAt = s.indexOf('©', at + cluster.length + 1);
    if (nextAt <= r) break;
    r = nextAt;
  }
  for (const [from, to] of PAIRS) {
    if (from && (from.codePointAt(0) ?? 0) >= 0x0900 && s.includes(from)) s = s.split(from).join(to);
  }
  return s;
}
