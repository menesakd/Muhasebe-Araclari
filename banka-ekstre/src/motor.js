// Ekstre okuma motoru.
// PDF metnini konumlarıyla satırlara, satırları başlığa göre sütunlara, sütunları hareketlere çevirir;
// ardından her satırı bakiye zinciriyle doğrular (önceki bakiye + tutar = satır bakiyesi).

import { katla, kurusOku, tarihOku, tarihYaz, sade } from './ortak.js';
import { BANKALAR, GENEL_BANKA } from './bankalar.js';

// ---------------------------------------------------------------- PDF metni

/** pdf.js belgesinden sayfa sayfa metin parçalarını (x, y, genişlik, yazı boyu) çıkarır. y yukarıdan aşağı artar. */
export async function sayfalariOku(pdf) {
  const sayfalar = [];
  for (let no = 1; no <= pdf.numPages; no++) {
    const sayfa = await pdf.getPage(no);
    const vp = sayfa.getViewport({ scale: 1 });
    const icerik = await sayfa.getTextContent();
    const ogeler = [];
    for (const it of icerik.items) {
      if (typeof it.str !== 'string' || !it.str.trim()) continue;
      const m = carp(vp.transform, it.transform);
      if (Math.abs(m[1]) > 0.01 || Math.abs(m[2]) > 0.01 || m[0] <= 0) continue; // yatay olmayan yazıyı atla
      const fs = Math.abs(m[3]) || Math.abs(m[0]) || 8;
      // Baştaki/sondaki boşluklar genişliğe dahil; konumu yalnızca yazının kapladığı alana daralt.
      const ham = it.str;
      const bas = ham.length - ham.trimStart().length;
      const son = ham.length - ham.trimEnd().length;
      const harf = it.width / ham.length;
      ogeler.push({ s: ham.trim(), x: m[4] + bas * harf, y: m[5], w: it.width - (bas + son) * harf, fs });
    }
    sayfalar.push({ no, ogeler });
    sayfa.cleanup?.();
  }
  return sayfalar;
}

function carp(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

// ---------------------------------------------------------------- satır ve hücreler

/** Aynı hizadaki parçaları satırlara toplar; her satırda yakın parçaları hücrelere birleştirir. */
export function satirlaraAyir(ogeler, sayfaNo) {
  const sirali = [...ogeler].sort((p, q) => p.y - q.y || p.x - q.x);
  const satirlar = [];
  for (const o of sirali) {
    const son = satirlar[satirlar.length - 1];
    if (son && o.y - son.y <= Math.max(1.5, 0.22 * o.fs)) son.ogeler.push(o);
    else satirlar.push({ y: o.y, sayfa: sayfaNo, ogeler: [o] });
  }
  for (const s of satirlar) {
    s.ogeler.sort((p, q) => p.x - q.x);
    s.hucreler = hucrele(s.ogeler);
    s.metin = s.hucreler.map((h) => h.s).join(' ');
    s.km = katla(s.metin);
  }
  return satirlar;
}

/** Soldan sağa sıralı parçaları, aralarındaki boşluğa bakarak hücrelere birleştirir. */
function hucrele(ogeler) {
  const out = [];
  for (const o of ogeler) {
    const s = o.s.replace(/\s+/g, ' ');
    const son = out[out.length - 1];
    if (son) {
      const bosluk = o.x - son.x2;
      if (bosluk < o.fs * 0.55) {
        const ara = bosluk > o.fs * 0.12 || son.s.endsWith(' ') || s.startsWith(' ') ? ' ' : '';
        son.s += ara + s;
        son.x2 = Math.max(son.x2, o.x + o.w);
        continue;
      }
    }
    out.push({ s, x: o.x, x2: o.x + o.w });
  }
  for (const h of out) h.s = sade(h.s);
  return out.filter((h) => h.s);
}

// ---------------------------------------------------------------- başlık satırı

/** Satır metnini (sadeleştirilmiş) ve her karakterin yaklaşık x konumunu verir. */
function konumluMetin(satir) {
  if (satir._km) return satir._km;
  let metin = '';
  const xs = [];
  satir.hucreler.forEach((h, i) => {
    if (i > 0) { metin += ' '; xs.push(h.x); }
    const k = katla(h.s);
    for (let j = 0; j < k.length; j++) { metin += k[j]; xs.push(h.x + ((h.x2 - h.x) * j) / k.length); }
  });
  const son = satir.hucreler[satir.hucreler.length - 1];
  xs.push(son ? son.x2 : 0);
  satir._km = { metin, xs };
  return satir._km;
}

function basligiEsle(ana, komsular, basliklar) {
  const dolu = new Map();
  const kolonlar = {};
  const kullanilan = new Set([ana]);
  for (const b of basliklar) {
    const adaylar = b.komsu ? [ana, ...komsular] : [ana];
    for (const s of adaylar) {
      const km = konumluMetin(s);
      const alanlar = dolu.get(s) || [];
      const r = new RegExp(b.r.source, 'g');
      let m;
      let bulundu = null;
      while ((m = r.exec(km.metin))) {
        if (!m[0].length) { r.lastIndex++; continue; }
        const bas = m.index;
        const son = m.index + m[0].length;
        if (alanlar.some(([p, q]) => bas < q && son > p)) continue;
        bulundu = [bas, son];
        break;
      }
      if (bulundu) {
        alanlar.push(bulundu);
        dolu.set(s, alanlar);
        kolonlar[b.k] = { x1: km.xs[bulundu[0]], x2: km.xs[bulundu[1]] };
        kullanilan.add(s);
        break;
      }
    }
  }
  return { kolonlar, kullanilan };
}

function zorunluTamam(banka, kolonlar) {
  return banka.zorunlu.every((z) => (Array.isArray(z) ? z.some((k) => kolonlar[k]) : kolonlar[z]));
}

const BASLIK_DEVAM = /^(\s|ACIKLAMASI|BAKIYESI|TARIHI|TARIH|NO|NUMARASI|TUTARI|ADI|SAATI|TIPI|KODU|\(\+\/-\)|\*)+$/;

/** Bir sayfada bankanın sütun başlığı satırını arar. */
function sayfadaBaslikBul(satirlar, banka) {
  let enIyi = null;
  for (const ana of satirlar) {
    if (banka.anaHucre && ana.hucreler.length !== banka.anaHucre) continue;
    if (ana.hucreler.length < 2) continue;
    const komsular = satirlar.filter((s) => s !== ana && Math.abs(s.y - ana.y) <= 14);
    const { kolonlar, kullanilan } = basligiEsle(ana, komsular, banka.basliklar);
    if (!zorunluTamam(banka, kolonlar)) continue;
    const puan = Object.keys(kolonlar).length;
    if (!enIyi || puan > enIyi.puan) enIyi = { kolonlar, puan, ana, kullanilan };
  }
  if (!enIyi) return null;
  let alt = Math.max(...[...enIyi.kullanilan].map((s) => s.y));
  for (const s of satirlar) {
    if (s.y > alt && s.y - alt <= 12 && BASLIK_DEVAM.test(s.km)) alt = s.y;
  }
  enIyi.alt = alt;
  return enIyi;
}

// ---------------------------------------------------------------- sütun sınırları

/**
 * Sütun sınırlarını belirler: başlıklar sütunların sırasını ve yaklaşık yerini verir,
 * sınır ise hareket satırlarındaki gerçek boşluğa (hiçbir yazının geçmediği x aralığına) oturtulur.
 */
function sinirHesapla(kolonlar, capalar) {
  const kol = Object.entries(kolonlar)
    .map(([k, v]) => ({ k, x1: v.x1, x2: v.x2, m: (v.x1 + v.x2) / 2 }))
    .sort((a, b) => a.m - b.m);
  const araliklar = capalar.flatMap((s) => s.ogeler.map((o) => [o.x, o.x + o.w])).sort((a, b) => a[0] - b[0]);
  const birlesik = [];
  for (const [a, b] of araliklar) {
    const son = birlesik[birlesik.length - 1];
    if (son && a <= son[1] + 0.8) son[1] = Math.max(son[1], b);
    else birlesik.push([a, b]);
  }
  const bosluklar = [];
  for (let i = 0; i < birlesik.length - 1; i++) bosluklar.push([birlesik[i][1], birlesik[i + 1][0]]);
  for (let i = 0; i < kol.length - 1; i++) {
    const A = kol[i];
    const B = kol[i + 1];
    const g = A.x2 <= B.x1 ? (A.x2 + B.x1) / 2 : (A.m + B.m) / 2;
    // Önce iki başlığın ortası arasındaki boşluklara, bulunamazsa iki başlığın dış kenarları arasına bak.
    const ara = (sol, sag) => {
      let sinir = null;
      let enYakin = Infinity;
      for (const [p, q] of bosluklar) {
        if (q - p < 1.2) continue;
        const orta = (p + q) / 2;
        if (orta <= sol || orta >= sag) continue;
        const icinde = g >= p && g <= q;
        const uzak = icinde ? 0 : Math.min(Math.abs(g - p), Math.abs(g - q));
        if (uzak < enYakin) { enYakin = uzak; sinir = icinde ? g : orta; }
      }
      return sinir;
    };
    A.sag = ara(A.m, B.m) ?? ara(A.x1, B.x2) ?? g;
  }
  kol.forEach((c, i) => { c.sol = i === 0 ? -Infinity : kol[i - 1].sag; });
  if (kol.length) kol[kol.length - 1].sag = Infinity;
  return kol;
}

function kolonBul(kol, o) {
  const x = o.x + Math.min(1, o.w / 2);
  const c = kol.find((c) => x >= c.sol && x < c.sag);
  return c ? c.k : null;
}

/** Parçaları sütunlara dağıtıp her sütunun metnini (satır sırasıyla) birleştirir. */
function alanlaraDagit(parcalar, kol) {
  const kutular = {};
  for (const { satir, alan } of parcalar) {
    for (const o of satir.ogeler) {
      const k = alan || kolonBul(kol, o);
      if (!k) continue;
      (kutular[k] ||= []).push({ ...o, sy: satir.y, sp: satir.sayfa });
    }
  }
  const sonuc = {};
  for (const [k, ogeler] of Object.entries(kutular)) {
    ogeler.sort((a, b) => a.sp - b.sp || a.sy - b.sy || a.x - b.x);
    const parcaMetin = [];
    let grup = [];
    for (const o of ogeler) {
      if (grup.length && (grup[0].sy !== o.sy || grup[0].sp !== o.sp)) {
        parcaMetin.push(hucrele(grup).map((h) => h.s).join(' '));
        grup = [];
      }
      grup.push(o);
    }
    if (grup.length) parcaMetin.push(hucrele(grup).map((h) => h.s).join(' '));
    sonuc[k] = sade(parcaMetin.join(' '));
  }
  return sonuc;
}

// ---------------------------------------------------------------- hareketleri çıkarma

const GENEL_OZEL = [
  { r: /(DEVREDEN|DEVIR|ONCEKI)\s*BAKIYE/, tur: 'acilis' },
  { r: /^(DEVIR|DEVREDEN)\s+[-+]?[\d.,]+$/, tur: 'acilis' }, // ör. "DEVİR 8.220.012,00"
  { r: /ACILIS\s*BAKIYESI/, tur: 'acilis' },
  { r: /(KAPANIS|DONEM\s*SONU)\s*BAKIYESI?/, tur: 'kapanis' },
];

function capaMi(s, kolonlar, banka) {
  const ilk = s.hucreler[0];
  if (!ilk || s.hucreler.length < 2) return false;
  if (!banka.tarihDeseni.test(ilk.s) || !tarihOku(ilk.s)) return false;
  const t = kolonlar.tarih;
  if (t && (ilk.x > t.x2 + 25 || ilk.x2 < t.x1 - 60)) return false;
  return true;
}

function ozelSatir(s, banka, kol) {
  const eslesen = [...(banka.ozelSatirlar || []), ...GENEL_OZEL].find((o) => o.r.test(s.km));
  if (!eslesen) return null;
  const alanlar = alanlaraDagit([{ satir: s }], kol);
  let deger = kurusOku(alanlar.bakiye);
  if (deger == null) {
    for (let i = s.hucreler.length - 1; i >= 0 && deger == null; i--) deger = kurusOku(s.hucreler[i].s);
  }
  return { tur: eslesen.tur, deger };
}

/** a, b'den önce mi? pay: a en fazla bu kadar (pt) aşağıda olsa da "önce" sayılır (aynı görsel satır). */
function once(a, b, pay = 0) {
  return a.sayfa < b.sayfa || (a.sayfa === b.sayfa && a.y < b.y + pay);
}

/**
 * Başlığın üstündeki bilgi alanında bir etiketin yanındaki tutarı bulur (ör. "Devir 6.442,23").
 * Etiket ile tutar küçük bir dikey kaymayla ayrı satırlara düşebildiği için 3 pt içindekiler birleştirilir.
 */
function ustBilgiTutari(satirlar, baslikY, desen) {
  const ogeler = satirlar.filter((s) => s.y < baslikY - 0.5).flatMap((s) => s.ogeler).sort((p, q) => p.y - q.y);
  const gruplar = [];
  for (const o of ogeler) {
    const son = gruplar[gruplar.length - 1];
    if (son && o.y - son.y <= 3) son.ogeler.push(o);
    else gruplar.push({ y: o.y, ogeler: [o] });
  }
  for (const g of gruplar) {
    const metin = katla(g.ogeler.sort((p, q) => p.x - q.x).map((o) => o.s).join(' '));
    const m = metin.match(desen);
    if (m) return kurusOku(m[1]);
  }
  return null;
}

/**
 * 'blok' yerleşimi için: açıklaması hareket satırının üstüne ve altına dağılmış (ortalanmış) biçimlerde
 * sayfadaki satırları, aralarındaki dikey boşluğa göre bloklara ayırır. Ayırma eşiği, olabildiğince çok
 * satırın tek hareket içeren bir bloğa düşeceği şekilde seçilir; böylece uzun ve kısa açıklamalı
 * hareketler yan yana gelse de satırlar karışmaz.
 */
function bloklaraAyir(satirlar, capaMi) {
  if (satirlar.length < 2) return [satirlar];
  const bosluk = satirlar.slice(1).map((s, i) => s.y - satirlar[i].y);
  const esikler = [-1, ...new Set(bosluk.map((g) => Math.round(g * 10) / 10))].sort((a, b) => a - b);
  let enIyi = null;
  let enIyiPuan = -1;
  for (const esik of esikler) {
    const bloklar = [[satirlar[0]]];
    bosluk.forEach((g, i) => {
      if (g > esik + 0.3) bloklar.push([]);
      bloklar[bloklar.length - 1].push(satirlar[i + 1]);
    });
    const puan = bloklar.reduce((t, b) => t + (b.filter(capaMi).length === 1 ? b.length : 0), 0);
    if (puan > enIyiPuan) { enIyiPuan = puan; enIyi = bloklar; }
  }
  return enIyi;
}

function hedefBul(s, mod, sayfaKayitlari, tumKayitlar, pay = 0) {
  const oncekiBul = () => {
    for (let i = tumKayitlar.length - 1; i >= 0; i--) if (once(tumKayitlar[i].capa, s, pay)) return tumKayitlar[i];
    return null;
  };
  if (mod === 'ust') {
    return sayfaKayitlari.find((k) => k.capa.y > s.y) || oncekiBul();
  }
  if (mod === 'yakin') {
    let enIyi = null;
    let enAz = Infinity;
    for (const k of sayfaKayitlari) {
      const d = Math.abs(k.capa.y - s.y) + (k.capa.y > s.y ? 0.01 : 0); // eşitlikte üsttekini seç
      if (d < enAz) { enAz = d; enIyi = k; }
    }
    return enIyi || oncekiBul();
  }
  return oncekiBul();
}

/** Seçilen bankanın kurallarıyla tüm sayfalardan ham kayıtları çıkarır. */
function kayitlariCikar(tumSatirlar, banka) {
  const kayitlar = [];
  const ozeller = [];
  let sonKolonlar = null;
  for (const satirlar of tumSatirlar) {
    const baslik = sayfadaBaslikBul(satirlar, banka);
    let kolonlar;
    let govde;
    if (baslik) {
      if (banka.ustAcilis && !sonKolonlar) {
        const deger = ustBilgiTutari(satirlar, baslik.ana.y, banka.ustAcilis);
        if (deger != null) ozeller.push({ tur: 'acilis', deger });
      }
      kolonlar = baslik.kolonlar;
      sonKolonlar = kolonlar;
      govde = satirlar.filter((s) => s.y > baslik.alt + 0.5);
    } else if (sonKolonlar) {
      kolonlar = sonKolonlar;
      govde = satirlar;
    } else {
      continue;
    }
    const altBilgi = [...(banka.altBilgi || []), ...(banka.genel ? GENEL_ALT : [])];
    const sonIdx = govde.findIndex((s) => altBilgi.some((r) => r.test(s.km)));
    if (sonIdx >= 0) govde = govde.slice(0, sonIdx);
    const capa = (s) => capaMi(s, kolonlar, banka);
    // Başlıksız sayfada ilk hareketten önceki satırlar atılır; sayfaBasiDevam olan biçimlerde ise
    // bunlar önceki sayfadaki son hareketin açıklamasının devamıdır.
    if (!baslik && !banka.sayfaBasiDevam) {
      const ilk = govde.findIndex(capa);
      govde = ilk >= 0 ? govde.slice(ilk) : [];
    }
    const capalar = govde.filter(capa);
    const kol = sinirHesapla(kolonlar, capalar);
    const sayfaKayitlari = [];
    const devamlar = [];
    const capaKaydi = new Map();
    const siradakiler = [];
    for (const s of govde) {
      if (capa(s)) {
        const k = { capa: s, ekler: [], kol };
        kayitlar.push(k);
        sayfaKayitlari.push(k);
        capaKaydi.set(s, k);
        siradakiler.push(s);
        continue;
      }
      const oz = ozelSatir(s, banka, kol);
      if (oz) { ozeller.push(oz); continue; }
      devamlar.push(s);
      siradakiler.push(s);
    }
    if (banka.yerlesim === 'blok') {
      for (const blok of bloklaraAyir(siradakiler, (s) => capaKaydi.has(s))) {
        const icCapalar = blok.filter((s) => capaKaydi.has(s));
        for (const s of blok) {
          if (capaKaydi.has(s)) continue;
          const hedef = icCapalar.length === 1
            ? capaKaydi.get(icCapalar[0])
            : icCapalar.length === 0
              ? hedefBul(blok[0], 'alt', sayfaKayitlari, kayitlar) // hareketsiz blok: önceki hareketin devamı
              : hedefBul(s, 'yakin', sayfaKayitlari, kayitlar);
          if (hedef) hedef.ekler.push({ satir: s });
        }
      }
    } else {
      for (const s of devamlar) {
        const kural = banka.devam ? banka.devam(s, kol) : { mod: banka.yerlesim };
        const hedef = hedefBul(s, kural.mod, sayfaKayitlari, kayitlar, banka.ayniSatirPayi || 0);
        if (hedef) hedef.ekler.push({ satir: s, alan: kural.alan });
      }
    }
  }
  return { kayitlar, ozeller };
}

const GENEL_ALT = [/^SAYFA\b/, /DEKONT YERINE/, /UYUSMAZLIK HALINDE/, /KAYITLARI ESAS/];

function varsayilanKayit(a) {
  let tutar = kurusOku(a.tutar);
  if (tutar == null && (a.borc || a.alacak)) {
    tutar = Math.abs(kurusOku(a.alacak) || 0) - Math.abs(kurusOku(a.borc) || 0);
  }
  return { tutar, bakiye: kurusOku(a.bakiye), aciklama: a.aciklama, evrak: a.evrak };
}

function genelTur(aciklama) {
  const k = katla(aciklama);
  if (/^(DEVREDEN|DEVIR|ONCEKI)\s*BAKIYE|^ACILIS\s*BAKIYESI|^ACILIS$/.test(k)) return 'acilis';
  if (/^(KAPANIS|DONEM\s*SONU)\s*BAKIYESI?/.test(k)) return 'kapanis';
  if (/^GUN\s*SONU\s*BAKIYESI/.test(k)) return 'atla';
  return 'hareket';
}

// ---------------------------------------------------------------- sıralama ve bakiye kontrolü

function zincir(h, acilis) {
  let onceki = acilis ?? (h.length && h[0].bakiye != null ? h[0].bakiye - h[0].tutar : null);
  let hata = 0;
  for (const r of h) {
    if (r.bakiye != null && onceki != null && onceki + r.tutar !== r.bakiye) hata++;
    onceki = r.bakiye ?? (onceki != null ? onceki + r.tutar : null);
  }
  return hata;
}

/** Aynı gün içindeki satırları, bakiye zinciri tutacak şekilde yeniden sıralar (bazı bankalar gün içini farklı dizer). */
function gunIciSirala(h, acilis) {
  let onceki = acilis ?? (h.length && h[0].bakiye != null ? h[0].bakiye - h[0].tutar : null);
  for (let i = 0; i < h.length; i++) {
    if (onceki != null && h[i].bakiye != null && onceki + h[i].tutar !== h[i].bakiye) {
      for (let j = i + 1; j < h.length && h[j].tarih.sira === h[i].tarih.sira; j++) {
        if (h[j].bakiye != null && onceki + h[j].tutar === h[j].bakiye) {
          const [x] = h.splice(j, 1);
          h.splice(i, 0, x);
          break;
        }
      }
    }
    onceki = h[i].bakiye ?? (onceki != null ? onceki + h[i].tutar : null);
  }
}

/** Tutarlar işaretsiz yazılmışsa (hiç eksi yok) giriş/çıkışı bakiye farkından çıkarır. Yalnızca genel okuyucuda kullanılır. */
function isaretCikar(h, acilis) {
  if (!h.length || h.some((r) => r.tutar < 0) || !h.some((r) => r.bakiye != null)) return;
  let onceki = acilis;
  for (const r of h) {
    if (r.bakiye != null && onceki != null && onceki + r.tutar !== r.bakiye && onceki - r.tutar === r.bakiye) {
      r.tutar = -r.tutar;
    }
    onceki = r.bakiye ?? (onceki != null ? onceki + r.tutar : null);
  }
}

function duzenleVeDogrula(hamKayitlar, ozeller, secenek = {}) {
  let acilis = null;
  let kapanis = null;
  let sifir = 0;
  const okunamayan = [];
  let h = [];
  for (const r of hamKayitlar) {
    if (r.tur === 'acilis') { if (acilis == null) acilis = r.bakiye ?? r.tutar; continue; }
    if (r.tur === 'kapanis') { kapanis = r.bakiye ?? r.tutar; continue; }
    if (r.tur === 'atla') continue;
    if (!r.tarih || r.tutar == null) { okunamayan.push(r); continue; }
    if (r.tutar === 0) { sifir++; continue; }
    h.push(r);
  }
  for (const o of ozeller) {
    if (o.tur === 'acilis' && acilis == null) acilis = o.deger;
    if (o.tur === 'kapanis') kapanis = o.deger;
  }
  // Ekstre yeniden eskiye diziliyse ters çevir.
  if (h.length >= 2) {
    const ilk = h[0].tarih.sira;
    const son = h[h.length - 1].tarih.sira;
    if (ilk > son || (ilk === son && zincir([...h].reverse(), acilis) < zincir(h, acilis))) h.reverse();
  }
  if (secenek.isaretCikar) isaretCikar(h, acilis);
  gunIciSirala(h, acilis);
  const turetilmisAcilis = h.length && h[0].bakiye != null ? h[0].bakiye - h[0].tutar : null;
  let onceki = acilis ?? turetilmisAcilis;
  let hataliSatir = 0;
  let icVirmanSayisi = 0;
  h = h.map((r) => {
    // Bakiyeyi değiştirmeyen satır: hesabın kendi içindeki virman (ör. İş Bankası ek hesap/KMH borcu tahsilatı).
    const icVirman = r.bakiye != null && onceki != null && r.bakiye === onceki;
    const hata = !icVirman && r.bakiye != null && onceki != null && onceki + r.tutar !== r.bakiye;
    if (hata) hataliSatir++;
    if (icVirman) icVirmanSayisi++;
    onceki = r.bakiye ?? (onceki != null ? onceki + r.tutar : null);
    return { ...r, hata, icVirman };
  });
  const bakiyeVar = h.some((r) => r.bakiye != null);
  const bakiyesiz = h.filter((r) => r.bakiye == null).length;
  const sonBakiye = h.length ? onceki : acilis;
  const sayilan = h.filter((r) => !r.icVirman);
  return {
    hareketler: h,
    ozet: {
      satir: h.length,
      icVirman: icVirmanSayisi,
      giris: sayilan.reduce((t, r) => t + (r.tutar > 0 ? r.tutar : 0), 0),
      cikis: sayilan.reduce((t, r) => t + (r.tutar < 0 ? r.tutar : 0), 0),
      acilis: acilis ?? turetilmisAcilis,
      acilisEkstrede: acilis != null,
      sonBakiye,
      kapanis,
      kapanisUyumlu: kapanis == null || kapanis === sonBakiye,
      bakiyeVar,
      bakiyesiz,
      hataliSatir,
      sifirAtlanan: sifir,
      okunamayan: okunamayan.length,
      ilkTarih: h.length ? tarihYaz(h[0].tarih) : null,
      sonTarih: h.length ? tarihYaz(h[h.length - 1].tarih) : null,
    },
  };
}

// ---------------------------------------------------------------- dışa açık giriş noktası

function cozumle(tumSatirlar, banka) {
  const { kayitlar, ozeller } = kayitlariCikar(tumSatirlar, banka);
  const ham = kayitlar.map((k) => {
    const a = alanlaraDagit([{ satir: k.capa }, ...k.ekler], k.kol);
    if (banka.duzelt) for (const key of Object.keys(a)) a[key] = banka.duzelt(a[key]);
    const r = (banka.kayit || varsayilanKayit)(a);
    r.tarih = tarihOku(a.tarih);
    r.aciklama = sade(r.aciklama);
    r.evrak = sade(r.evrak);
    if (!r.tur) r.tur = genelTur(r.aciklama);
    return r;
  });
  return duzenleVeDogrula(ham, ozeller, { isaretCikar: !!banka.genel });
}

function karsilastir(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
}

/**
 * Sayfa metinlerinden ekstreyi çözer.
 * Dönüş: { banka, iban, hareketler: [{tarih, aciklama, tutar, evrak, bakiye, hata}], ozet } ya da { hata }.
 */
export function ekstreCoz(sayfalar, secenek = {}) {
  const ogeSayisi = sayfalar.reduce((t, s) => t + s.ogeler.length, 0);
  if (!ogeSayisi) {
    return { hata: 'Bu PDF’te okunabilir metin yok. Taranmış (resim) bir belge olabilir; bankanın internet şubesinden indirilen PDF’i deneyin.' };
  }
  const tumSatirlar = sayfalar.map((s) => satirlaraAyir(s.ogeler, s.no));
  const metin = katla(tumSatirlar.flat().map((s) => s.metin).join('\n'));
  const adaylar = [];
  const denenecek = secenek.yalnizGenel ? [GENEL_BANKA] : [...BANKALAR, GENEL_BANKA];
  for (const banka of denenecek) {
    let baslik = null;
    for (const st of tumSatirlar.slice(0, 3)) {
      baslik = sayfadaBaslikBul(st, banka);
      if (baslik) break;
    }
    if (!baslik) continue;
    adaylar.push({ banka, imza: (banka.imzalar || []).some((r) => r.test(metin)), puan: baslik.puan });
  }
  if (!adaylar.length) {
    return { hata: 'Hareket tablosunun başlığı bulunamadı. Bu ekstre biçimi henüz tanınmıyor.' };
  }
  let enIyi = null;
  for (const a of adaylar) {
    const sonuc = cozumle(tumSatirlar, a.banka);
    const n = sonuc.hareketler.length;
    const oran = n ? sonuc.ozet.hataliSatir / n : 1;
    const kademe = oran === 0 ? 3 : oran <= 0.05 ? 2 : oran <= 0.2 ? 1 : 0;
    const anahtar = [n > 0 ? 1 : 0, kademe, a.imza ? 1 : 0, a.banka.genel ? 0 : 1, a.puan, n];
    if (!enIyi || karsilastir(anahtar, enIyi.anahtar) > 0) enIyi = { sonuc, anahtar, aday: a };
  }
  const { sonuc, aday } = enIyi;
  if (!sonuc.hareketler.length) {
    return { hata: 'Ekstrede hareket satırı bulunamadı.' };
  }
  const iban = (metin.match(/TR\s?\d{2}[\d\s*]{18,34}/) || [''])[0].replace(/\s+/g, '').slice(0, 26);
  return {
    banka: { kod: aday.banka.kod, ad: aday.banka.ad, genel: !!aday.banka.genel, imza: aday.imza },
    iban,
    hareketler: sonuc.hareketler,
    ozet: sonuc.ozet,
  };
}

// Test ve hata ayıklama için iç işlevler.
export const _ic = { satirlaraAyir, sayfadaBaslikBul, sinirHesapla, capaMi, alanlaraDagit };
