// Örnek ekstreleri okuyup özet ve bakiye kontrolünü yazdırır.
// Kullanım: node araclar/test.mjs <pdf klasörü> [--ayrinti] [--genel] [--json cikti.json]
//   --ayrinti  her satırı yazdırır    --genel  yalnızca genel okuyucuyu dener (tanınmayan banka benzetimi)
// Örnek PDF'ler gizli banka verisi içerdiği için depoya konmaz (bkz. .gitignore).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sayfalariOku, ekstreCoz } from '../src/motor.js';
import { tarihYaz, tutarYaz } from '../src/ortak.js';

const kok = path.dirname(fileURLToPath(import.meta.url));
// Node'da pdf.js'in npm paketi gerekir (npm install). PDFJS ortam değişkeniyle başka bir yol verilebilir.
const pdfjs = await import(process.env.PDFJS || 'pdfjs-dist/legacy/build/pdf.mjs');

const klasor = process.argv[2] || path.join(kok, '../ornekler');
const ayrinti = process.argv.includes('--ayrinti');
const jsonIdx = process.argv.indexOf('--json');
const dosyalar = fs.readdirSync(klasor).filter((f) => f.toLowerCase().endsWith('.pdf')).sort();

const tum = {};
let sorunlu = 0;
for (const f of dosyalar) {
  const veri = new Uint8Array(fs.readFileSync(path.join(klasor, f)));
  const gorev = pdfjs.getDocument({ data: veri, verbosity: 0, isEvalSupported: false });
  const pdf = await gorev.promise;
  const sonuc = ekstreCoz(await sayfalariOku(pdf), { yalnizGenel: process.argv.includes('--genel') });
  await gorev.destroy();
  tum[f] = sonuc;
  console.log(`\n=== ${f}`);
  if (sonuc.hata) { console.log('  HATA:', sonuc.hata); sorunlu++; continue; }
  const o = sonuc.ozet;
  const durum = o.hataliSatir === 0 && o.kapanisUyumlu && o.bakiyesiz === 0
    ? 'TUTARLI'
    : `SORUN (${o.hataliSatir} uyumsuz, ${o.bakiyesiz} bakiyesiz${o.kapanisUyumlu ? '' : ', kapanış farklı'})`;
  if (durum !== 'TUTARLI') sorunlu++;
  console.log(`  ${sonuc.banka.ad}${sonuc.banka.imza ? '' : ' (imzasız)'} | ${sonuc.iban || '-'} | ${o.ilkTarih} – ${o.sonTarih}`);
  console.log(`  satır ${o.satir} | giriş ${tutarYaz(o.giris)} | çıkış ${tutarYaz(o.cikis)} | açılış ${tutarYaz(o.acilis)}${o.acilisEkstrede ? ' (ekstrede)' : ''} | son ${tutarYaz(o.sonBakiye)}${o.kapanis != null ? ` | kapanış ${tutarYaz(o.kapanis)}` : ''}`);
  const fark = o.acilis + o.giris + o.cikis - o.sonBakiye;
  console.log(`  bakiye zinciri: ${durum} | açılış+giriş+çıkış−son = ${tutarYaz(fark)} | iç virman ${o.icVirman} | sıfır atlanan ${o.sifirAtlanan} | okunamayan ${o.okunamayan}`);
  if (fark !== 0 && o.bakiyeVar) sorunlu++;
  const h = sonuc.hareketler;
  const goster = ayrinti ? h : [...h.slice(0, 3), ...h.slice(-2)];
  for (const r of goster) {
    console.log(`   ${r.hata ? '✗' : r.icVirman ? '~' : ' '} ${tarihYaz(r.tarih)} | ${tutarYaz(r.tutar).padStart(14)} | ${(r.evrak || '').padEnd(18)} | ${r.aciklama}`);
  }
  if (!ayrinti) for (const r of h.filter((x) => x.hata).slice(0, 5)) console.log(`   ✗ ${tarihYaz(r.tarih)} ${tutarYaz(r.tutar)} bakiye ${tutarYaz(r.bakiye)} | ${r.aciklama}`);
}
console.log(`\n${dosyalar.length} dosya, ${sorunlu} sorunlu`);
if (jsonIdx > 0) fs.writeFileSync(process.argv[jsonIdx + 1], JSON.stringify(tum, null, 1));
process.exitCode = sorunlu ? 1 : 0;
