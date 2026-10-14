// Derleme: src/ altındaki modülleri tek sayfada birleştirir. Dış bağımlılık yok.
//
// Çıktılar:
//   index.html                          pdf.js'i ./pdfjs/ klasöründen yükler (GitHub Pages ya da herhangi bir web sunucusu)
//   tek-dosya/ekstre-donusturucu.html   pdf.js içine gömülü tek dosya; internet gerekmez, çift tıklayıp açılır
//   --artifact <klasör>                 claude.ai sayfası için iskelet etiketleri olmayan sürüm + pdfjs/ kopyası
//
// Kullanım: node araclar/derle.mjs [--artifact <klasör>]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const kok = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const oku = (...p) => fs.readFileSync(path.join(kok, ...p), 'utf8');

const MODULLER = ['ortak.js', 'bankalar.js', 'motor.js', 'xlsx.js', 'cikti.js', 'uygulama.js'];

function modulleriBirlestir() {
  return MODULLER.map((ad) => {
    const kaynak = oku('src', ad)
      .replace(/^import\s[^;]+;\s*$/gm, '')
      .replace(/^export\s+(?=(async\s+)?function|const|let|class)/gm, '');
    return `// ---------- ${ad}\n${kaynak.trim()}\n`;
  }).join('\n');
}

const KLASOR_YUKLEYICI = `globalThis.pdfjsYukle = async () => {
  const lib = await import('./pdfjs/pdf.min.mjs');
  lib.GlobalWorkerOptions.workerSrc = new URL('./pdfjs/pdf.worker.min.mjs', document.baseURI).href;
  return lib;
};`;

const GOMULU_YUKLEYICI = `globalThis.pdfjsYukle = async () => {
  const adres = (kod) => URL.createObjectURL(new Blob([kod], { type: 'text/javascript' }));
  const lib = await import(adres(globalThis.PDFJS_KAYNAK));
  lib.GlobalWorkerOptions.workerSrc = adres(globalThis.PDFJS_ISCI_KAYNAK);
  return lib;
};`;

/** Bir JS kaynağını <script> içine güvenle konacak dize sabitine çevirir. */
function dizeSabiti(kaynak) {
  return JSON.stringify(kaynak).replace(/</g, '\\x3C');
}

function betik(yukleyici, uygulama) {
  return `<script type="module">\n${yukleyici}\n\n${uygulama}</script>`;
}

function tamBelge(icerik) {
  const i = icerik.indexOf('<main');
  const bas = icerik.slice(0, i).trim();
  const govde = icerik.slice(i).trim();
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
${bas}
</head>
<body>
${govde}
</body>
</html>
`;
}

const surum = JSON.parse(oku('package.json')).version;
const sablon = oku('src', 'sayfa.html').replaceAll('{{SURUM}}', surum);
const uygulama = modulleriBirlestir();
const yaz = (hedef, metin) => {
  fs.mkdirSync(path.dirname(hedef), { recursive: true });
  fs.writeFileSync(hedef, metin);
  console.log(`${path.relative(process.cwd(), hedef)}  ${(Buffer.byteLength(metin) / 1024).toFixed(0)} KB`);
};

// 1) klasör sürümü
const klasorIcerik = sablon.replace('<!--UYGULAMA-->', () => betik(KLASOR_YUKLEYICI, uygulama));
yaz(path.join(kok, 'index.html'), tamBelge(klasorIcerik));

// 2) tek dosya sürümü
const gomulu = `<script>
globalThis.PDFJS_KAYNAK = ${dizeSabiti(oku('pdfjs', 'pdf.min.mjs'))};
globalThis.PDFJS_ISCI_KAYNAK = ${dizeSabiti(oku('pdfjs', 'pdf.worker.min.mjs'))};
</script>
${betik(GOMULU_YUKLEYICI, uygulama)}`;
yaz(path.join(kok, 'tek-dosya', 'ekstre-donusturucu.html'), tamBelge(sablon.replace('<!--UYGULAMA-->', () => gomulu)));

// 3) claude.ai sayfası (isteğe bağlı)
const ai = process.argv.indexOf('--artifact');
if (ai > 0) {
  const hedef = path.resolve(process.argv[ai + 1]);
  yaz(path.join(hedef, 'index.html'), klasorIcerik);
  fs.mkdirSync(path.join(hedef, 'pdfjs'), { recursive: true });
  for (const f of ['pdf.min.mjs', 'pdf.worker.min.mjs']) fs.copyFileSync(path.join(kok, 'pdfjs', f), path.join(hedef, 'pdfjs', f));
}

// Birleşik betiğin sözdizimini doğrulamak için ayrı dosya (test aracı kullanır).
fs.mkdirSync(path.join(kok, '.derleme'), { recursive: true });
fs.writeFileSync(path.join(kok, '.derleme', 'uygulama.mjs'), `${KLASOR_YUKLEYICI}\n${uygulama}`);
