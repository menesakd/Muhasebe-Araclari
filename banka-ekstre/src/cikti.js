// Zirve Nova aktarımı için Excel çıktısı: Tarih | Açıklama | Tutar | Evrak No
// Tutar tek sütunda: hesaba giren para artı, çıkan para eksi.

import { xlsxOlustur } from './xlsx.js';

export const AKTARIM_SUTUNLARI = [
  { baslik: 'Tarih', tur: 'tarih', genislik: 12 },
  { baslik: 'Açıklama', tur: 'metin', genislik: 80 },
  { baslik: 'Tutar', tur: 'tutar', genislik: 16 },
  { baslik: 'Evrak No', tur: 'metin', genislik: 26 },
];

/**
 * Excel'e yazılacak satırlar.
 * icVirmanDahil: bakiyeyi değiştirmeyen iç virmanlar (ör. KMH borcu tahsilatı) da yazılsın mı
 * siraNo: evrak numarası olmayan satırlara sıra numarası verilsin mi
 */
export function aktarilacakSatirlar(sonuc, { icVirmanDahil = false, siraNo = false } = {}) {
  return sonuc.hareketler
    .filter((r) => icVirmanDahil || !r.icVirman)
    .map((r, i) => ({ ...r, kaynak: r, evrak: r.evrak || (siraNo ? String(i + 1) : '') }));
}

export function excelOlustur(sonuc, secenek = {}) {
  const satirlar = aktarilacakSatirlar(sonuc, secenek).map((r) => [r.tarih, r.aciklama, r.tutar, r.evrak]);
  return xlsxOlustur({ sayfaAdi: 'Hareketler', sutunlar: AKTARIM_SUTUNLARI, satirlar });
}

export function excelAdi(pdfAdi) {
  return `${String(pdfAdi).replace(/\.pdf$/i, '').trim() || 'ekstre'}.xlsx`;
}
