// Banka biçimleri.
// Her biçim: sütun başlıkları (sadeleştirilmiş metinde aranır), hareket satırının tarih deseni,
// açıklamanın çok satırlı olduğunda nereye taştığı (yerlesim) ve sayfa altı yazıları.
//   yerlesim: 'alt'   → devam satırları hareket satırının altında
//             'ust'   → devam satırları hareket satırının üstünde
//             'yakin' → devam satırları hareket satırının üstünde ve altında (ortalanmış)

import { katla, kurusOku, sayiBul, sade } from './ortak.js';

/** Kelime sınırlı başlık deseni (boşluklar esnek). */
function K(metin) {
  const kacis = metin.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&').replace(/ /g, '\\s*');
  return new RegExp(`(?<![A-Z0-9])${kacis}(?![A-Z0-9])`);
}
const b = (k, metin, ek = {}) => ({ k, r: K(metin), ...ek });
const r = (k, desen, ek = {}) => ({ k, r: desen, ...ek });

function isaretle(v, eksi) {
  if (v == null) return null;
  return eksi ? -Math.abs(v) : Math.abs(v);
}

function birlestir(a, b2, ayrac = ' - ') {
  return [a, b2].map(sade).filter(Boolean).join(ayrac);
}

export const BANKALAR = [
  {
    kod: 'akbank',
    ad: 'Akbank',
    imzalar: [/AKBANK T\.A\.S/, /AKBANK\.COM/],
    basliklar: [
      b('tarih', 'TARIH'), b('saat', 'SAAT'), b('valor', 'VALOR'), b('evrak', 'FIS NO'),
      b('tutar', 'MEBLAG'), b('bakiye', 'BAKIYE'), b('ba', 'B/A'), b('aciklama', 'ACIKLAMA'),
    ],
    zorunlu: ['tarih', 'evrak', 'tutar', 'bakiye', 'ba', 'aciklama'],
    tarihDeseni: /^\d{2}\.\d{2}\.\d{4}$/,
    yerlesim: 'alt',
    altBilgi: [/^AKBANK T\.A\.S/, /^\d+ \/ \d+$/],
    // Meblağ işaretsiz; B (borç) çıkış, A (alacak) giriş.
    kayit: (a) => ({
      tutar: isaretle(kurusOku(a.tutar), katla(a.ba).trim() === 'B'),
      bakiye: kurusOku(a.bakiye),
      aciklama: a.aciklama,
      evrak: a.evrak,
    }),
  },
  {
    kod: 'vakifbank',
    ad: 'Vakıfbank',
    imzalar: [/VAKIFBANK\.COM/, /VAKIFLAR BANKASI/],
    basliklar: [
      b('tarih', 'TARIH'), b('saat', 'SAAT'), b('evrak', 'ISLEM NO'), b('tutar', 'MIKTAR'),
      b('bakiye', 'BAKIYE'), b('islemAdi', 'ISLEM ADI'),
    ],
    zorunlu: ['tarih', 'evrak', 'tutar', 'bakiye', 'islemAdi'],
    tarihDeseni: /^\d{2}\.\d{2}\.\d{4}$/,
    yerlesim: 'yakin',
    // Satır başından başlayan devam satırları açıklama detayıdır (hareketin altında);
    // İşlem Adı sütunundaki taşmalar ise hareket satırına ortalanmıştır.
    devam: (satir, kol) => {
      const ia = kol.find((c) => c.k === 'islemAdi');
      return ia && satir.ogeler[0].x < ia.sol - 2 ? { mod: 'alt', alan: 'detay' } : { mod: 'yakin' };
    },
    altBilgi: [/DEKONT YERINE KULLANILAMAZ/, /VAKIFBANK\.COM/, /^SF\.\s*\d/],
    kayit: (a) => ({
      tutar: kurusOku(a.tutar),
      bakiye: kurusOku(a.bakiye),
      aciklama: birlestir(a.islemAdi, a.detay),
      evrak: a.evrak,
    }),
  },
  {
    kod: 'yapikredi',
    ad: 'Yapı Kredi',
    imzalar: [/YAPI VE KREDI BANKASI/, /YAPIKREDI\.COM/],
    basliklar: [
      b('tarih', 'TARIH'), b('valor', 'VALOR'), b('aciklama', 'ACIKLAMA'), b('tutar', 'ISLEM TUTARI'),
      b('saat', 'ISLEM SAATI'), b('bakiye', 'BAKIYE'), b('evrak', 'DEKONT NO'),
    ],
    zorunlu: ['tarih', 'aciklama', 'tutar', 'saat', 'bakiye', 'evrak'],
    tarihDeseni: /^\d{2}\.\d{2}\.\d{4}$/,
    yerlesim: 'alt',
    altBilgi: [/^YAPI VE KREDI BANKASI/, /^ISLETMENIN MERKEZI/, /^\d+ \/ \d+$/],
    // Açılış, gün sonu ve kapanış bakiyesi satırları hareket değildir.
    kayit: (a) => {
      const ac = katla(a.aciklama);
      let tur;
      if (/^ACILIS BAKIYESI/.test(ac)) tur = 'acilis';
      else if (/^KAPANIS BAKIYESI/.test(ac)) tur = 'kapanis';
      else if (/^GUNSONU BAKIYESI/.test(ac)) tur = 'atla';
      return { tur, tutar: kurusOku(a.tutar), bakiye: kurusOku(a.bakiye), aciklama: a.aciklama, evrak: a.evrak };
    },
  },
  {
    kod: 'qnb',
    ad: 'QNB',
    imzalar: [/KREDIGO/, /QNB FINANSBANK A\.S/],
    basliklar: [
      b('tarih', 'ISLEM TARIHI'), b('kanal', 'KANAL'), b('aciklama', 'ISLEM ACIKLAMASI'),
      b('tutar', 'TUTAR'), b('bakiye', 'BAKIYE'),
    ],
    zorunlu: ['tarih', 'kanal', 'aciklama', 'tutar', 'bakiye'],
    tarihDeseni: /^\d{2}\/\d{2}\/\d{4}$/,
    yerlesim: 'yakin',
    altBilgi: [/^SAYFA\s*:/, /^BU DOKUMAN BILGI AMACLI/],
  },
  {
    kod: 'halkbank',
    ad: 'Halkbank',
    imzalar: [/HALK BANKASI/, /HALKBANK\.COM/],
    basliklar: [
      b('tarih', 'ISLEM TARIHI'), b('aciklama', 'ACIKLAMA'), b('tutar', 'ISLEM TUTARI'),
      b('bakiye', 'BAKIYE'), b('evrak', 'DEKONT NO'),
    ],
    zorunlu: ['tarih', 'aciklama', 'tutar', 'bakiye', 'evrak'],
    tarihDeseni: /^\d{2}-\d{2}-\d{4}$/,
    yerlesim: 'alt',
    altBilgi: [/^SAYFA NO/, /^TURKIYE HALK BANKASI/],
  },
  {
    kod: 'halkbank-eski',
    ad: 'Halkbank',
    imzalar: [/HALK BANKASI/, /HALKBANK/],
    basliklar: [
      b('tarih', 'ISLEM TARIHI'), b('valor', 'VALOR TARIHI'), b('tutar', 'ISLEM TUTARI'),
      r('tutarIsaret', /\(\+\/-\)/), b('bakiye', 'BAKIYE'), r('bakiyeIsaret', /\(\+\/-\)/),
      b('aciklama', 'ACIKLAMA'),
    ],
    zorunlu: ['tarih', 'tutar', 'tutarIsaret', 'bakiye', 'aciklama'],
    tarihDeseni: /^\d{2}\.\d{2}\.\d{4}$/,
    yerlesim: 'alt',
    altBilgi: [/^TURKIYE HALK BANKASI/, /^EKSTRENIZE/],
    // Tutar ve bakiyenin işareti ayrı sütunda (+ / -).
    kayit: (a) => ({
      tutar: isaretle(kurusOku(a.tutar), (a.tutarIsaret || '').includes('-')),
      bakiye: isaretle(kurusOku(a.bakiye), (a.bakiyeIsaret || '').includes('-')),
      aciklama: a.aciklama,
      evrak: '',
    }),
  },
  {
    kod: 'isbank',
    ad: 'İş Bankası',
    imzalar: [/IS BANKASI/, /ISBANK\.COM/],
    basliklar: [
      b('tarih', 'TARIH/SAAT'), b('kanal', 'KANAL/SUBE'), b('tutar', 'ISLEM TUTARI'), b('bakiye', 'BAKIYE'),
      b('ekBakiye', 'BAKIYESI'), r('islemKodu', /(?<![A-Z0-9])ISLEM(?=\s*ISLEM\s*TIPI)/), b('tip', 'ISLEM TIPI'),
      b('aciklama', 'ACIKLAMA'),
    ],
    zorunlu: ['tarih', 'tutar', 'bakiye', 'tip', 'aciklama'],
    tarihDeseni: /^\d{2}\/\d{2}\/\d{4}-\d{2}:\d{2}(:\d{2})?$/,
    yerlesim: 'ust',
    altBilgi: [/^\(\*\)/, /^BU HESAP OZETI/, /IS BANKASI AS/, /^SAYFA\s*\d+\s*\/\s*\d+/],
    // Ek hesap (KMH) kullanılınca "Bakiye" 0 görünür, eksi kısım "Ek Hesap Bakiyesi"ndedir; gerçek bakiye ikisinin toplamı.
    kayit: (a) => {
      const bakiye = kurusOku(a.bakiye);
      const ek = kurusOku(a.ekBakiye) || 0;
      return {
        tutar: kurusOku(a.tutar),
        bakiye: bakiye == null ? null : bakiye + ek,
        ekHesap: ek !== 0,
        aciklama: birlestir(a.tip, a.aciklama),
        evrak: '',
      };
    },
  },
  {
    kod: 'sekerbank',
    ad: 'Şekerbank',
    imzalar: [/SEKERBANK/, /TR\s?\d{2}\s?0005\s?9/],
    basliklar: [
      b('tarih', 'TARIH'), b('yaptiran', 'ISLEMI YAPTIRAN'), b('evrak', 'ISLEM NO'), b('aciklama', 'ACIKLAMA'),
      b('tutar', 'MEBLAG'), b('bakiye', 'BAKIYE'),
    ],
    zorunlu: ['tarih', 'evrak', 'aciklama', 'tutar', 'bakiye'],
    tarihDeseni: /^\d{2}\.\d{2}\.\d{4}$/,
    // Açıklama ve "İşlemi Yaptıran" hareket satırının altına taşar; ilk satırları hareket satırından
    // ~1,5 pt yukarıda basıldığı için o kadar yukarıdaki satır da aynı harekete sayılır.
    yerlesim: 'alt',
    ayniSatirPayi: 2.5,
    // Dönem başı bakiyesi tablonun üstünde: "Tarih : 01.01.2026 - 30.09.2026 ... Devir 6.442,23"
    ustAcilis: /DEVIR\s+([-+]?[\d.,]+)$/,
    altBilgi: [/^SEKERBANK - HESAP EKSTRESI/, /^SEKERBANK T\.A\.S/],
    // "İşlemi Yaptıran" açıklamaya eklenmez: çoğunlukla hesap sahibinin kendi unvanıdır, başka biri olduğunda
    // (ör. para çekme) adı zaten açıklamada geçer.
  },
  {
    kod: 'teb',
    ad: 'TEB',
    imzalar: [/TURK EKONOMI/, /TEB\.COM\.TR/],
    basliklar: [
      b('tarih', 'TARIH'), b('valor', 'VALOR'), b('saat', 'SAAT'), b('aciklama', 'ACIKLAMA'),
      b('ozel', 'ISLEM OZEL'), b('tip', 'ISLEM TIPI'), b('tutar', 'TUTAR'), b('bakiye', 'BAKIYE'),
      b('evrak', 'DEKONT NO'), b('alici', 'ALICI'),
    ],
    zorunlu: ['tarih', 'aciklama', 'tutar', 'bakiye', 'evrak'],
    tarihDeseni: /^\d{2}\/\d{2}\/\d{4}$/,
    yerlesim: 'alt',
    altBilgi: [/TURK EKONOM/, /TEB\.COM\.TR/],
    // Telefondan yazdırılan TEB PDF'lerinde küçük "i" harfi "#" olarak geliyor.
    duzelt: (s) => s.replace(/#/g, 'i'),
    kayit: (a) => ({
      tutar: kurusOku(a.tutar),
      bakiye: kurusOku(a.bakiye),
      aciklama: birlestir(a.aciklama, a.ozel && a.ozel !== '-' ? a.ozel : '', ' / '),
      evrak: a.evrak,
    }),
  },
  {
    kod: 'ziraat',
    ad: 'Ziraat Bankası',
    imzalar: [/ZIRAATBANK\.COM/, /ZIRAAT BANKASI ANONIM/],
    basliklar: [
      b('tarih', 'TARIH'), b('evrak', 'REFERANS'), b('tutar', 'TUTAR'), b('bakiye', 'BAKIYE'),
      b('aciklama', 'ACIKLAMA'),
    ],
    zorunlu: ['tarih', 'evrak', 'tutar', 'bakiye', 'aciklama'],
    tarihDeseni: /^\d{2}\.\d{2}\.(\d{2}|\d{4})$/,
    yerlesim: 'alt',
    altBilgi: [/^TARAFLAR ARASINDA/, /^SAYFA NO/],
  },
  {
    kod: 'ziraatkatilim',
    ad: 'Ziraat Katılım',
    // Ekstrede banka adı geçmeyebilir; IBAN'daki banka kodu 00209 Ziraat Katılım'dır.
    imzalar: [/ZIRAAT KATILIM/, /TR\s?\d{2}\s?0020\s?9/],
    basliklar: [b('tarih', 'TARIH'), b('aciklama', 'ACIKLAMA'), b('tutar', 'TUTAR'), b('bakiye', 'BAKIYE')],
    zorunlu: ['tarih', 'aciklama', 'tutar', 'bakiye'],
    anaHucre: 4,
    tarihDeseni: /^\d{2}\.\d{2}\.\d{4}$/,
    // Açıklama hareket satırının üstüne ve altına ortalanmış; sonraki sayfalarda başlık tekrarlanmaz
    // ve sayfa başındaki satırlar önceki sayfadaki son hareketin açıklamasının devamıdır.
    yerlesim: 'blok',
    sayfaBasiDevam: true,
    ozelSatirlar: [{ r: /^DEVIR\s+[-+]?[\d.,]+$/, tur: 'acilis' }],
    altBilgi: [/^SAYFA\s*\d+\s*\/\s*\d+/],
  },
  {
    kod: 'kuveytturk',
    ad: 'Kuveyt Türk',
    imzalar: [/KUVEYT TURK/],
    basliklar: [
      b('aciklama', 'ACIKLAMA'), b('tutar', 'TUTAR'), b('bakiye', 'BAKIYE'),
      b('tarih', 'TARIHI', { komsu: true }),
    ],
    zorunlu: ['tarih', 'aciklama', 'tutar', 'bakiye'],
    anaHucre: 3,
    tarihDeseni: /^\d{2}\.\d{2}\.\d{4}$/,
    yerlesim: 'yakin',
    altBilgi: [],
    kayit: (a) => ({
      tur: /^ACILIS$/.test(katla(a.aciklama).trim()) ? 'acilis' : undefined,
      tutar: kurusOku(a.tutar),
      bakiye: kurusOku(a.bakiye),
      aciklama: a.aciklama,
      evrak: '',
    }),
  },
];

/**
 * Tanınmayan bankalar için genel okuyucu: yaygın başlık adlarını arar.
 * Bilinen her sütunu ayrı tanımlar ki saat, valör, kanal gibi değerler tutar/bakiye sütununa karışmasın.
 * Tutarlar işaretsizse işaret bakiye farkından çıkarılır (motor tarafında).
 */
export const GENEL_BANKA = {
  kod: 'genel',
  ad: 'Tanınmayan banka',
  genel: true,
  basliklar: [
    r('tarih', /(?<![A-Z0-9])(ISLEM\s*TARIHI|TARIH\s*\/\s*SAAT|TARIHI?)(?![A-Z0-9])/, { komsu: true }),
    r('valor', /(?<![A-Z0-9])VALOR(\s*TARIHI)?(?![A-Z0-9])/),
    r('saat', /(?<![A-Z0-9])(ISLEM\s*)?SAATI?(?![A-Z0-9])/),
    r('kanal', /(?<![A-Z0-9])(KANAL(\s*\/\s*SUBE)?|SUBE)(?![A-Z0-9])/),
    r('evrak', /(?<![A-Z0-9])(DEKONT\s*NO|FIS\s*NO|EVRAK\s*NO|REFERANS(\s*NO)?|ISLEM\s*NO|REF\.?\s*NO)(?![A-Z0-9])/),
    r('tutar', /(?<![A-Z0-9])(ISLEM\s*TUTARI|TUTARI?|MEBLAG|MIKTAR)(?![A-Z0-9])/),
    r('isaret', /\(\+\/-\)|(?<![A-Z0-9])B\/A(?![A-Z0-9])/),
    r('borc', /(?<![A-Z0-9])(BORC|CIKAN|CEKILEN)(?![A-Z0-9])/),
    r('alacak', /(?<![A-Z0-9])(ALACAK|GIREN|YATAN)(?![A-Z0-9])/),
    r('bakiye', /(?<![A-Z0-9])BAKIYE(?![A-Z0-9])/),
    r('bakiyeIsaret', /\(\+\/-\)/),
    r('ekBakiye', /(?<![A-Z0-9])(EK\s*HESAP\s*)?BAKIYESI(?![A-Z0-9])/),
    r('tip', /(?<![A-Z0-9])ISLEM\s*(TIPI|TURU|ADI)(?![A-Z0-9])/),
    r('ozel', /(?<![A-Z0-9])(ISLEM\s*)?OZEL(\s*ACIKLAMA(SI)?)?(?![A-Z0-9])/),
    r('alici', /(?<![A-Z0-9])(ALICI|GONDEREN|KARSI\s*TARAF)(?![A-Z0-9])/),
    r('aciklama', /(?<![A-Z0-9])(ISLEM\s*)?ACIKLAMA(SI)?(?![A-Z0-9])/),
  ],
  zorunlu: ['tarih', ['tutar', 'borc', 'alacak'], ['aciklama', 'tip']],
  tarihDeseni: /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/,
  // Blok yerleşimi açıklama hareketin altında, üstünde ya da iki yanında olsa da çoğu düzende doğru eşleşir
  // (11 örnek ekstrede 'yakin'a göre 1.204 yerine 1.366 / 1.413 satır).
  yerlesim: 'blok',
  altBilgi: [],
  kayit: (a) => {
    let tutar = sayiBul(a.tutar);
    const isaret = katla(a.isaret || '').trim();
    if (tutar != null) {
      if (isaret === 'B' || isaret.includes('-')) tutar = -Math.abs(tutar);
      else if (isaret === 'A' || isaret.includes('+')) tutar = Math.abs(tutar);
    } else if (a.borc || a.alacak) {
      tutar = Math.abs(sayiBul(a.alacak) || 0) - Math.abs(sayiBul(a.borc) || 0);
    }
    let bakiye = sayiBul(a.bakiye);
    if (bakiye != null && (a.bakiyeIsaret || '').includes('-')) bakiye = -Math.abs(bakiye);
    const ek = sayiBul(a.ekBakiye);
    const ekHesap = bakiye != null && ek != null && ek < 0;
    if (ekHesap) bakiye += ek;
    const ozel = a.ozel && a.ozel !== '-' ? a.ozel : '';
    return { tutar, bakiye, ekHesap, aciklama: birlestir(birlestir(a.tip, a.aciklama), ozel, ' / '), evrak: a.evrak };
  },
};
