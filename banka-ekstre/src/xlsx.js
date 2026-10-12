// Küçük XLSX yazıcı: tek çalışma sayfası; tarih, metin ve tutar hücreleri.
// Dış kütüphane kullanmaz; dosya sıkıştırmasız ZIP (STORE) olarak paketlenir, Excel ve muhasebe programları bunu sorunsuz açar.

const kodla = (s) => new TextEncoder().encode(s);

let crcTablo = null;
function crc32(b) {
  if (!crcTablo) {
    crcTablo = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTablo[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = crcTablo[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Dosyaları sıkıştırmasız ZIP olarak paketler. dosyalar: [{ ad, veri: Uint8Array }] */
export function zipPaketle(dosyalar) {
  const parcalar = [];
  const merkez = [];
  let ofset = 0;
  for (const d of dosyalar) {
    const ad = kodla(d.ad);
    const crc = crc32(d.veri);
    const n = d.veri.length;
    const yerel = new DataView(new ArrayBuffer(30));
    yerel.setUint32(0, 0x04034b50, true);
    yerel.setUint16(4, 20, true);
    yerel.setUint16(6, 0x0800, true); // UTF-8 dosya adı
    yerel.setUint16(8, 0, true); // STORE
    yerel.setUint16(10, 0, true);
    yerel.setUint16(12, 0x21, true); // 01.01.1980
    yerel.setUint32(14, crc, true);
    yerel.setUint32(18, n, true);
    yerel.setUint32(22, n, true);
    yerel.setUint16(26, ad.length, true);
    yerel.setUint16(28, 0, true);
    parcalar.push(new Uint8Array(yerel.buffer), ad, d.veri);
    const m = new DataView(new ArrayBuffer(46));
    m.setUint32(0, 0x02014b50, true);
    m.setUint16(4, 20, true);
    m.setUint16(6, 20, true);
    m.setUint16(8, 0x0800, true);
    m.setUint16(10, 0, true);
    m.setUint16(12, 0, true);
    m.setUint16(14, 0x21, true);
    m.setUint32(16, crc, true);
    m.setUint32(20, n, true);
    m.setUint32(24, n, true);
    m.setUint16(28, ad.length, true);
    m.setUint32(42, ofset, true);
    merkez.push(new Uint8Array(m.buffer), ad);
    ofset += 30 + ad.length + n;
  }
  const merkezBoy = merkez.reduce((t, p) => t + p.length, 0);
  const son = new DataView(new ArrayBuffer(22));
  son.setUint32(0, 0x06054b50, true);
  son.setUint16(8, dosyalar.length, true);
  son.setUint16(10, dosyalar.length, true);
  son.setUint32(12, merkezBoy, true);
  son.setUint32(16, ofset, true);
  const hepsi = [...parcalar, ...merkez, new Uint8Array(son.buffer)];
  const cikti = new Uint8Array(hepsi.reduce((t, p) => t + p.length, 0));
  let k = 0;
  for (const p of hepsi) { cikti.set(p, k); k += p.length; }
  return cikti;
}

function xml(s) {
  return String(s ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sutunHarfi(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Tarihi Excel seri numarasına çevirir (1900 tarih sistemi). */
function excelTarih(t) {
  return Date.UTC(t.y, t.a - 1, t.g) / 86400000 + 25569;
}

/** Kuruşu kayan nokta hatası olmadan ondalık metne çevirir: -65075 → "-650.75". */
function kurusMetin(k) {
  const mutlak = Math.abs(k);
  return `${k < 0 ? '-' : ''}${Math.floor(mutlak / 100)}.${String(mutlak % 100).padStart(2, '0')}`;
}

const STIL = { genel: 0, tarih: 1, tutar: 2, baslik: 3, metin: 4 };

/**
 * Tek sayfalık XLSX üretir.
 * sutunlar: [{ baslik, tur: 'tarih' | 'tutar' | 'metin', genislik }]
 * satirlar: her satır, sütun sırasıyla değerler (tarih: {g,a,y}, tutar: kuruş, metin: string)
 */
export function xlsxOlustur({ sayfaAdi = 'Sayfa1', sutunlar, satirlar }) {
  const hucre = (r, c, deger, tur) => {
    const ref = `${sutunHarfi(c)}${r}`;
    if (deger == null || deger === '') return '';
    if (tur === 'tarih') return `<c r="${ref}" s="${STIL.tarih}"><v>${excelTarih(deger)}</v></c>`;
    if (tur === 'tutar') return `<c r="${ref}" s="${STIL.tutar}"><v>${kurusMetin(deger)}</v></c>`;
    const stil = tur === 'baslik' ? STIL.baslik : STIL.metin;
    return `<c r="${ref}" t="inlineStr" s="${stil}"><is><t xml:space="preserve">${xml(deger)}</t></is></c>`;
  };
  const satirXml = [];
  satirXml.push(`<row r="1">${sutunlar.map((s, c) => hucre(1, c, s.baslik, 'baslik')).join('')}</row>`);
  satirlar.forEach((satir, i) => {
    const r = i + 2;
    satirXml.push(`<row r="${r}">${sutunlar.map((s, c) => hucre(r, c, satir[c], s.tur)).join('')}</row>`);
  });
  const sonRef = `${sutunHarfi(sutunlar.length - 1)}${satirlar.length + 1}`;
  const sayfa = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<dimension ref="A1:${sonRef}"/>
<sheetViews><sheetView workbookViewId="0" tabSelected="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${sutunlar.map((s, c) => `<col min="${c + 1}" max="${c + 1}" width="${s.genislik || 14}" customWidth="1"/>`).join('')}</cols>
<sheetData>${satirXml.join('')}</sheetData>
</worksheet>`;
  const stiller = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="dd\\.mm\\.yyyy"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
  const kitap = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${xml(sayfaAdi).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
  const kitapIliski = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
  const kokIliski = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
  const turler = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;
  return zipPaketle([
    { ad: '[Content_Types].xml', veri: kodla(turler) },
    { ad: '_rels/.rels', veri: kodla(kokIliski) },
    { ad: 'xl/workbook.xml', veri: kodla(kitap) },
    { ad: 'xl/_rels/workbook.xml.rels', veri: kodla(kitapIliski) },
    { ad: 'xl/styles.xml', veri: kodla(stiller) },
    { ad: 'xl/worksheets/sheet1.xml', veri: kodla(sayfa) },
  ]);
}
