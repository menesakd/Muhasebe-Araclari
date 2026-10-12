// Ortak yardımcılar: metin sadeleştirme, tutar ve tarih okuma.
// Tutarlar her yerde kuruş cinsinden tam sayı olarak tutulur (yuvarlama hatası olmasın diye).

const TR_HARF = {
  'İ': 'I', 'ı': 'I', 'i': 'I', 'Ş': 'S', 'ş': 'S', 'Ğ': 'G', 'ğ': 'G',
  'Ü': 'U', 'ü': 'U', 'Ö': 'O', 'ö': 'O', 'Ç': 'C', 'ç': 'C',
  'Â': 'A', 'â': 'A', 'Î': 'I', 'î': 'I', 'Û': 'U', 'û': 'U',
};

/** Karşılaştırma için metni büyük harfe çevirir, Türkçe harfleri sadeleştirir (uzunluk korunur). */
export function katla(s) {
  return String(s ?? '').replace(/[İıiŞşĞğÜüÖöÇçÂâÎîÛû]/g, (c) => TR_HARF[c]).toUpperCase();
}

/** "1.234,56", "1,234.56", "-15.000,00", "250,00 -" gibi yazımları kuruşa çevirir. Okuyamazsa null. */
export function kurusOku(s) {
  if (s == null) return null;
  let t = String(s).replace(/\s+/g, '').replace(/(TL|TRY|₺)$/i, '');
  if (!t) return null;
  let eksi = false;
  if (/^\(.*\)$/.test(t)) { eksi = true; t = t.slice(1, -1); }
  if (/^[-−–]/.test(t)) { eksi = true; t = t.slice(1); } else if (t.startsWith('+')) t = t.slice(1);
  if (/[-−–]$/.test(t)) { eksi = true; t = t.slice(0, -1); } else if (t.endsWith('+')) t = t.slice(0, -1);
  if (!/^\d[\d.,]*$/.test(t)) return null;
  let tam = t;
  let kesir = '';
  const m = t.match(/[.,](\d{1,2})$/);
  if (m) { tam = t.slice(0, -m[0].length); kesir = m[1]; }
  tam = tam.replace(/[.,]/g, '');
  if (!/^\d+$/.test(tam)) return null;
  const k = Number(tam) * 100 + Number((kesir + '00').slice(0, 2));
  return eksi ? -k : k;
}

/** Bir hücrede tutarın yanında başka yazı da varsa (ör. "44.257,99 A") ilk sayıyı kuruş olarak bulur. */
export function sayiBul(s) {
  const tam = kurusOku(s);
  if (tam != null) return tam;
  const p = String(s ?? '').split(/\s+/).filter(Boolean);
  for (let i = 0; i < p.length; i++) {
    let v = kurusOku(p[i]);
    if (v == null && /^[-−–+]$/.test(p[i]) && i + 1 < p.length) v = kurusOku(p[i] + p[i + 1]);
    if (v != null) return v;
  }
  return null;
}

/** Metin içindeki ilk gg.aa.yyyy / gg/aa/yyyy / gg-aa-yyyy / gg.aa.yy tarihini okur. */
export function tarihOku(s) {
  const m = String(s ?? '').match(/(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?!\d)/);
  if (!m) return null;
  const g = Number(m[1]);
  const a = Number(m[2]);
  let y = Number(m[3]);
  if (m[3].length === 2) y += 2000;
  if (a < 1 || a > 12 || g < 1 || g > 31) return null;
  return { g, a, y, sira: y * 10000 + a * 100 + g };
}

/** Tarihi gg.aa.yyyy biçiminde yazar. */
export function tarihYaz(t) {
  return `${String(t.g).padStart(2, '0')}.${String(t.a).padStart(2, '0')}.${t.y}`;
}

/** Kuruşu "1.234,56" biçiminde yazar. */
export function tutarYaz(k) {
  if (k == null) return '';
  const eksi = k < 0;
  const mutlak = Math.abs(k);
  const tam = Math.floor(mutlak / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const kurus = String(mutlak % 100).padStart(2, '0');
  return `${eksi ? '-' : ''}${tam},${kurus}`;
}

/** Boşlukları sadeleştirir. */
export function sade(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}
