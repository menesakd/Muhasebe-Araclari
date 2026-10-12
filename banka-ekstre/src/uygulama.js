// Sayfa davranışı: dosya bırakma, PDF okuma, sonuç kartları, önizleme ve Excel indirme.
// pdf.js'i yükleyen `globalThis.pdfjsYukle` derleme sırasında sayfaya eklenir (tek dosya ya da klasör sürümü).

import { sayfalariOku, ekstreCoz } from './motor.js';
import { tarihYaz, tutarYaz } from './ortak.js';
import { excelOlustur, excelAdi, aktarilacakSatirlar } from './cikti.js';
import { zipPaketle } from './xlsx.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let pdfjsSozu = null;
const pdfjs = () => (pdfjsSozu ||= globalThis.pdfjsYukle());

const durum = {
  kayitlar: [],
  secenek: { siraNo: false, icVirmanDahil: false },
};
let sayac = 0;

// ---------------------------------------------------------------- örnek (ilk açılışta görünen)

function ornekSonuc() {
  const t = (g, a) => ({ g, a, y: 2026, sira: 2026 * 10000 + a * 100 + g });
  const hareketler = [
    { tarih: t(2, 9), aciklama: 'GELEN FAST - ÖRNEK TİCARET LTD. ŞTİ. - Ağustos faturası', tutar: 1250000, evrak: '2026090200123', bakiye: 1384050 },
    { tarih: t(3, 9), aciklama: 'GİDEN HAVALE - ÖRNEK NAKLİYAT - Eylül kirası', tutar: -450000, evrak: '2026090300456', bakiye: 934050 },
    { tarih: t(3, 9), aciklama: 'HAVALE ÜCRETİ', tutar: -422, evrak: '2026090300456', bakiye: 933628 },
    { tarih: t(3, 9), aciklama: 'BSMV HAVALE ÜCRETİ', tutar: -21, evrak: '2026090300456', bakiye: 933607 },
    { tarih: t(5, 9), aciklama: 'POS NET SATIŞ TUTARI', tutar: 286540, evrak: '2026090500789', bakiye: 1220147 },
  ].map((r) => ({ ...r, hata: false, icVirman: false }));
  return {
    banka: { ad: 'Örnek Banka', genel: false, imza: true },
    iban: '',
    hareketler,
    ozet: {
      satir: 5, icVirman: 0, giris: 1536540, cikis: -450443, acilis: 134050, acilisEkstrede: false,
      sonBakiye: 1220147, kapanis: null, kapanisUyumlu: true, bakiyeVar: true, bakiyesiz: 0,
      hataliSatir: 0, sifirAtlanan: 0, okunamayan: 0, ilkTarih: '02.09.2026', sonTarih: '05.09.2026',
    },
  };
}
const ORNEK = { id: 0, ad: 'ornek-ekstre.pdf', durum: 'hazir', sonuc: ornekSonuc(), acik: true, ornek: true };

// ---------------------------------------------------------------- dosyalar

async function dosyalariEkle(liste) {
  const dosyalar = [...liste];
  if (!dosyalar.length) return;
  const yeni = [];
  for (const f of dosyalar) {
    const k = { id: ++sayac, ad: f.name, durum: 'okunuyor', acik: false };
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') {
      k.durum = 'hata';
      k.hata = 'Bu dosya PDF değil. Bankanın internet şubesinden indirdiğiniz PDF ekstreyi bırakın.';
    } else {
      k.dosya = f;
    }
    durum.kayitlar.push(k);
    yeni.push(k);
  }
  ciz();
  for (const k of yeni) {
    if (k.durum !== 'okunuyor') continue;
    try {
      k.veri = new Uint8Array(await k.dosya.arrayBuffer());
    } catch {
      k.durum = 'hata';
      k.hata = 'Dosya okunamadı.';
      ciz();
      continue;
    }
    delete k.dosya;
    await coz(k);
  }
}

async function coz(k, sifre) {
  k.durum = 'okunuyor';
  ciz();
  let gorev = null;
  try {
    const lib = await pdfjs();
    gorev = lib.getDocument({ data: k.veri.slice(), password: sifre, isEvalSupported: false, verbosity: 0 });
    const pdf = await gorev.promise;
    const sayfalar = await sayfalariOku(pdf);
    const sonuc = ekstreCoz(sayfalar);
    if (sonuc.hata) {
      k.durum = 'hata';
      k.hata = sonuc.hata;
    } else {
      k.durum = 'hazir';
      k.sonuc = sonuc;
      k.acik = sonuc.ozet.hataliSatir > 0;
    }
  } catch (e) {
    if (e && e.name === 'PasswordException') {
      k.durum = 'sifre';
      k.sifreHatali = Boolean(sifre);
    } else if (e && e.name === 'InvalidPDFException') {
      k.durum = 'hata';
      k.hata = 'Dosya geçerli bir PDF değil ya da bozuk.';
    } else {
      k.durum = 'hata';
      k.hata = `PDF açılamadı: ${e?.message || e}`;
    }
  } finally {
    try { await gorev?.destroy(); } catch { /* yok say */ }
  }
  ciz();
}

// ---------------------------------------------------------------- indirme

let indirmeKatmani = null;
const cerceveIcinde = typeof window.claude?.use === 'function';
if (cerceveIcinde) window.claude.use('downloads').then((d) => { indirmeKatmani = d; }, () => {});

async function dosyaKaydet(ad, veri) {
  if (cerceveIcinde) {
    const d = indirmeKatmani || (await window.claude.use('downloads').catch(() => null));
    if (d) {
      try {
        await d.save({ filename: ad, data: veri });
        bildir(`${ad} kaydedildi.`);
      } catch (e) {
        if (e?.code === 'declined') return;
        if (e?.code === 'rate_limited') bildir('Önceki kaydetme penceresi hâlâ açık; onu yanıtlayın.');
        else bildir(`Dosya kaydedilemedi (${e?.code || e?.message || 'bilinmeyen hata'}).`);
      }
      return;
    }
  }
  const tur = ad.endsWith('.zip') ? 'application/zip' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const url = URL.createObjectURL(new Blob([veri], { type: tur }));
  const a = document.createElement('a');
  a.href = url;
  a.download = ad;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function excelIndir(k) {
  return dosyaKaydet(excelAdi(k.ad), excelOlustur(k.sonuc, durum.secenek));
}

function tumunuIndir() {
  const hazir = durum.kayitlar.filter((k) => k.durum === 'hazir');
  const adlar = new Set();
  const dosyalar = hazir.map((k) => {
    let ad = excelAdi(k.ad);
    for (let i = 2; adlar.has(ad); i++) ad = excelAdi(k.ad).replace(/\.xlsx$/, ` (${i}).xlsx`);
    adlar.add(ad);
    return { ad, veri: excelOlustur(k.sonuc, durum.secenek) };
  });
  return dosyaKaydet('ekstreler-excel.zip', zipPaketle(dosyalar));
}

let bildirimZamani = null;
function bildir(metin) {
  const el = $('#bildirim');
  el.textContent = metin;
  el.hidden = false;
  clearTimeout(bildirimZamani);
  bildirimZamani = setTimeout(() => { el.hidden = true; }, 4500);
}

// ---------------------------------------------------------------- çizim

const ibanYaz = (iban) => (iban ? iban.replace(/(.{4})/g, '$1 ').trim() : '');

function durumCipi(k) {
  if (k.durum === 'okunuyor') return '<span class="cip cip-bilgi">Okunuyor…</span>';
  if (k.durum === 'sifre') return '<span class="cip cip-uyari">Şifreli</span>';
  if (k.durum === 'hata') return '<span class="cip cip-kotu">Okunamadı</span>';
  const o = k.sonuc.ozet;
  if (!o.bakiyeVar) return '<span class="cip cip-uyari">Bakiye kontrolü yapılamadı</span>';
  if (o.hataliSatir > 0) return `<span class="cip cip-kotu">${o.hataliSatir} satır bakiyeyi tutmuyor</span>`;
  if (!o.kapanisUyumlu) return '<span class="cip cip-kotu">Kapanış bakiyesi farklı</span>';
  if (o.bakiyesiz > 0) return `<span class="cip cip-uyari">${o.bakiyesiz} satırda bakiye yok</span>`;
  return '<span class="cip cip-iyi"><svg aria-hidden="true" viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" /></svg>Bakiye tutarlı</span>';
}

function notlar(k) {
  const { sonuc } = k;
  const o = sonuc.ozet;
  const n = [];
  if (k.ornek) n.push('Bu bir örnek. Kendi ekstrenizi bıraktığınızda kaldırılır.');
  if (sonuc.banka.genel) n.push('Banka biçimi tanınmadı, genel okuyucu kullanıldı. Bakiye kontrolü tutarlıysa tarih ve tutarlar doğrudur; açıklamaları gözden geçirin.');
  else if (!sonuc.banka.imza && !k.ornek) n.push(`Ekstrede banka adı geçmiyor; sayfa düzeni ${sonuc.banka.ad} biçimine uyuyor.`);
  if (o.hataliSatir > 0) n.push(`${o.hataliSatir} satırda “önceki bakiye + tutar” satırdaki bakiyeyi tutmuyor. Bu satırlar tabloda işaretli; aktarmadan önce PDF ile karşılaştırın.`);
  if (!o.kapanisUyumlu) n.push(`Ekstredeki kapanış bakiyesi (${tutarYaz(o.kapanis)}) son satırın bakiyesinden (${tutarYaz(o.sonBakiye)}) farklı.`);
  if (o.bakiyeVar && o.bakiyesiz > 0) n.push(`${o.bakiyesiz} satırda bakiye okunamadı; bu satırlar kontrol edilemedi.`);
  if (!o.bakiyeVar) n.push('Bakiye sütunu okunamadığı için satırlar bakiyeyle doğrulanamadı. Toplamları ekstreyle karşılaştırın.');
  if (o.icVirman > 0) {
    n.push(durum.secenek.icVirmanDahil
      ? `${o.icVirman} satır bakiyeyi değiştirmiyor (ek hesap / KMH iç virmanı); seçiminiz gereği Excel'e eklendi.`
      : `${o.icVirman} satır bakiyeyi değiştirmiyor (ek hesap / KMH iç virmanı); Excel'e alınmadı. Eklemek için yukarıdaki seçeneği işaretleyin.`);
  }
  const ekHesapli = sonuc.hareketler.filter((r) => r.ekHesap).length;
  if (ekHesapli > 0) n.push(`${ekHesapli} satırda ek hesap (KMH) kullanılmış; Bakiye sütununa ekstredeki “Bakiye” ile “Ek Hesap Bakiyesi”nin toplamı, yani net bakiye yazıldı.`);
  if (o.sifirAtlanan > 0) n.push(`${o.sifirAtlanan} sıfır tutarlı satır (ör. yetersiz bakiye denemesi) Excel'e alınmadı.`);
  if (o.okunamayan > 0) n.push(`${o.okunamayan} satırın tarihi ya da tutarı okunamadı ve Excel'e alınmadı.`);
  if (!k.ornek && sonuc.hareketler.every((r) => !r.evrak)) {
    n.push(durum.secenek.siraNo
      ? 'Bu ekstrede evrak numarası yok; Evrak No sütununa sıra numarası yazılıyor.'
      : 'Bu ekstrede evrak numarası yok; Evrak No sütunu boş kalacak.');
  }
  return n;
}

function mutabakat(o) {
  const kalem = (isaret, etiket, deger, sinif = '') =>
    `<div class="kalem ${sinif}"><i aria-hidden="true">${isaret}</i><span>${etiket}</span><b>${tutarYaz(deger)}</b></div>`;
  return `<div class="mutabakat" aria-label="Bakiye mutabakatı">
    ${kalem('', 'Açılış bakiyesi', o.acilis)}
    ${kalem('+', 'Giren', o.giris)}
    ${kalem('−', 'Çıkan', Math.abs(o.cikis))}
    ${kalem('=', 'Son bakiye', o.sonBakiye, 'son')}
  </div>`;
}

function onizleme(k) {
  const aktarim = aktarilacakSatirlar(k.sonuc, durum.secenek);
  const evrakHaritasi = new Map(aktarim.map((r) => [r.kaynak, r.evrak]));
  const satirlar = k.sonuc.hareketler.map((r) => {
    const aktariliyor = evrakHaritasi.has(r);
    const sinif = [r.hata ? 'hata' : '', aktariliyor ? '' : 'disarida'].filter(Boolean).join(' ');
    const etiket = r.hata
      ? '<span class="satir-etiket kotu">bakiye tutmuyor</span>'
      : !aktariliyor ? '<span class="satir-etiket">iç virman · Excel’e alınmıyor</span>' : '';
    return `<tr class="${sinif}">
      <td class="sayi">${tarihYaz(r.tarih)}</td>
      <td class="aciklama">${esc(r.aciklama)}${etiket}</td>
      <td class="sayi tutar ${r.tutar < 0 ? 'eksi' : ''}">${tutarYaz(r.tutar)}</td>
      <td class="sayi evrak">${esc(aktariliyor ? evrakHaritasi.get(r) : r.evrak)}</td>
      <td class="sayi bakiye">${r.bakiye == null ? '' : tutarYaz(r.bakiye)}</td>
    </tr>`;
  }).join('');
  return `<div class="onizleme" id="onizleme-${k.id}">
    <table>
      <thead><tr><th>Tarih</th><th>Açıklama</th><th class="sag">Tutar</th><th>Evrak No</th><th class="sag">Bakiye</th></tr></thead>
      <tbody>${satirlar}</tbody>
    </table>
  </div>`;
}

function kart(k) {
  const baslik = k.durum === 'hazir' ? esc(k.sonuc.banka.ad) : 'Ekstre';
  let govde = '';
  if (k.durum === 'okunuyor') {
    govde = '<p class="fis-mesaj">Sayfalar okunuyor ve satırlar ayrıştırılıyor.</p>';
  } else if (k.durum === 'hata') {
    govde = `<p class="fis-mesaj kotu">${esc(k.hata)}</p>`;
  } else if (k.durum === 'sifre') {
    govde = `<form class="sifre" data-id="${k.id}">
      <label for="sifre-${k.id}">${k.sifreHatali ? 'Şifre yanlış. Tekrar deneyin:' : 'Bu PDF şifreli. Bankanın bildirdiği şifreyi girin (çoğunlukla TC kimlik / vergi no ya da doğum tarihi):'}</label>
      <div class="sifre-satir"><input type="password" id="sifre-${k.id}" autocomplete="off" required><button class="birincil" type="submit">Aç</button></div>
    </form>`;
  } else {
    const { sonuc } = k;
    const o = sonuc.ozet;
    const aktarim = aktarilacakSatirlar(sonuc, durum.secenek);
    const bilgi = [
      sonuc.iban ? `<div><dt>IBAN</dt><dd class="sayi">${ibanYaz(sonuc.iban)}</dd></div>` : '',
      `<div><dt>Dönem</dt><dd class="sayi">${o.ilkTarih} – ${o.sonTarih}</dd></div>`,
      `<div><dt>Excel'e yazılacak</dt><dd class="sayi">${aktarim.length} satır</dd></div>`,
    ].join('');
    const notListe = notlar(k).map((t) => `<li>${esc(t)}</li>`).join('');
    govde = `<dl class="fis-bilgi">${bilgi}</dl>
      ${mutabakat(o)}
      ${notListe ? `<ul class="notlar">${notListe}</ul>` : ''}
      <div class="fis-eylem">
        ${k.ornek ? '' : `<button class="birincil" type="button" data-eylem="indir" data-id="${k.id}">Excel indir</button>`}
        <button class="ikincil" type="button" data-eylem="ac" data-id="${k.id}" aria-expanded="${k.acik}" aria-controls="onizleme-${k.id}">${k.acik ? 'Satırları gizle' : 'Satırları göster'}</button>
        ${k.ornek ? '' : `<span class="cikti-adi">${esc(excelAdi(k.ad))}</span>`}
      </div>
      ${k.acik ? onizleme(k) : ''}`;
  }
  return `<article class="fis${k.ornek ? ' fis-ornek' : ''}" data-id="${k.id}">
    <header class="fis-ust">
      <div class="fis-kimlik">
        <h2>${baslik}${k.ornek ? ' <span class="cip cip-ornek">Örnek</span>' : ''}</h2>
        <p class="dosya">${esc(k.ad)}</p>
      </div>
      ${durumCipi(k)}
    </header>
    ${govde}
  </article>`;
}

function ciz() {
  const liste = durum.kayitlar.length ? durum.kayitlar : [ORNEK];
  $('#liste').innerHTML = liste.map(kart).join('');
  const hazir = durum.kayitlar.filter((k) => k.durum === 'hazir');
  const cubuk = $('#aracCubugu');
  cubuk.hidden = durum.kayitlar.length === 0;
  if (!cubuk.hidden) {
    const tutarli = hazir.filter((k) => k.sonuc.ozet.bakiyeVar && k.sonuc.ozet.hataliSatir === 0 && k.sonuc.ozet.kapanisUyumlu && k.sonuc.ozet.bakiyesiz === 0).length;
    const okunuyor = durum.kayitlar.filter((k) => k.durum === 'okunuyor').length;
    const parcalar = [`${durum.kayitlar.length} dosya`];
    if (hazir.length) parcalar.push(`${tutarli}/${hazir.length} bakiye tutarlı`);
    if (okunuyor) parcalar.push(`${okunuyor} okunuyor`);
    $('#ozetMetin').textContent = parcalar.join(' · ');
    $('#tumunuIndir').hidden = hazir.length < 2;
  }
}

// ---------------------------------------------------------------- olaylar

$('#dosyaSec').addEventListener('change', (e) => {
  dosyalariEkle(e.target.files);
  e.target.value = '';
});

const alan = $('#birakAlan');
let surukleme = 0;
window.addEventListener('dragenter', (e) => {
  if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
  e.preventDefault();
  surukleme++;
  alan.classList.add('uzerinde');
});
window.addEventListener('dragover', (e) => {
  if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
  e.preventDefault();
});
window.addEventListener('dragleave', () => {
  surukleme = Math.max(0, surukleme - 1);
  if (!surukleme) alan.classList.remove('uzerinde');
});
window.addEventListener('drop', (e) => {
  if (!e.dataTransfer?.files?.length) return;
  e.preventDefault();
  surukleme = 0;
  alan.classList.remove('uzerinde');
  dosyalariEkle(e.dataTransfer.files);
});

$('#siraNo').addEventListener('change', (e) => { durum.secenek.siraNo = e.target.checked; ciz(); });
$('#icVirman').addEventListener('change', (e) => { durum.secenek.icVirmanDahil = e.target.checked; ciz(); });

$('#liste').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-eylem]');
  if (!b) return;
  const id = Number(b.dataset.id);
  const k = id === 0 ? ORNEK : durum.kayitlar.find((x) => x.id === id);
  if (!k) return;
  if (b.dataset.eylem === 'ac') {
    k.acik = !k.acik;
    ciz();
    document.querySelector(`button[data-eylem="ac"][data-id="${id}"]`)?.focus();
  } else if (b.dataset.eylem === 'indir') {
    excelIndir(k);
  }
});

$('#liste').addEventListener('submit', (e) => {
  const f = e.target.closest('form.sifre');
  if (!f) return;
  e.preventDefault();
  const k = durum.kayitlar.find((x) => x.id === Number(f.dataset.id));
  const sifre = f.querySelector('input').value;
  if (k && sifre) coz(k, sifre);
});

$('#tumunuIndir').addEventListener('click', () => tumunuIndir());
$('#temizle').addEventListener('click', () => {
  durum.kayitlar = [];
  ciz();
});

ciz();
