# Ekstre Dönüştürücü

Banka PDF ekstresini, Zirve Nova’nın Excel aktarımına hazır bir dosyaya çevirir:

| Tarih | Açıklama | Tutar | Evrak No | Bakiye |
|---|---|---|---|---|
| 02.09.2026 | GELEN FAST - … - Ağustos faturası | 12.500,00 | 2026090200123 | 13.840,50 |
| 03.09.2026 | GİDEN HAVALE - … - Eylül kirası | -4.500,00 | 2026090300456 | 9.340,50 |

Hesaba giren para artı, çıkan para eksi yazılır. Tarih gerçek tarih hücresidir (gg.aa.yyyy), tutar ve bakiye sayıdır, evrak no metindir (uzun numaralar bozulmasın diye). Bakiye, ekstrede o satırda yazan bakiyedir; ek hesap (KMH) kullanılan satırlarda net bakiye (Bakiye + Ek Hesap Bakiyesi) yazılır.

## Kullanım

1. [Sürümler](https://github.com/menesakd/Muhasebe-Araclari/releases/latest) sayfasından `ekstre-donusturucu.html` dosyasını indirin.
2. Dosyaya çift tıklayın; Chrome ya da Edge’de açılır. İnternet gerekmez.
3. Bankanın internet şubesinden indirdiğiniz PDF ekstreleri sayfaya sürükleyin.
4. Kartta **Bakiye tutarlı** yazıyorsa **Excel indir**’e basın. Birden çok ekstre varsa **Tümünü indir (.zip)** hepsini tek pakette verir.

PDF’ler tarayıcının içinde okunur; dosyalar hiçbir sunucuya gönderilmez.

## Bakiye kontrolü

Her satırda `önceki bakiye + tutar = satırdaki bakiye` hesaplanır. Bu tutuyorsa satırın tarihi, tutarı ve işareti (giriş/çıkış) ekstreyle aynıdır; eksik ya da fazla satır da kalmamıştır. Tutmayan satır tabloda kırmızı işaretlenir.

Kartın ortasındaki satır ekstrenin mutabakatıdır: **açılış bakiyesi + giren − çıkan = son bakiye**.

## Tanınan bankalar

| Banka | Evrak No kaynağı | Not |
|---|---|---|
| Akbank | Fiş No | Tutar işaretsiz; B/A sütunundan işaretlenir |
| Halkbank (yeni biçim, “Hesap Özeti”) | Dekont No | Uzun açıklamalar bankada kısaltılmış (…) gelir |
| Halkbank (eski biçim, “+/-” sütunlu) | yok | |
| İş Bankası | yok | Ek hesap (KMH) kullanılan dönemde bakiye = Bakiye + Ek Hesap Bakiyesi |
| Kuveyt Türk | yok | Ekstrede banka adı geçmiyor; sayfa düzeninden tanınır |
| QNB | yok | |
| TEB | Dekont No | Açıklama + İşlem Özel Açıklaması birleştirilir |
| Vakıfbank | İşlem No | İşlem Adı + açıklama detayı birleştirilir |
| Yapı Kredi | Dekont No | Açılış, gün sonu ve kapanış bakiyesi satırları hareket sayılmaz |
| Ziraat Bankası | Referans | |
| Ziraat Katılım | yok | Açıklama hareket satırının üstüne ve altına dağılmış; sayfa başına taşan açıklama önceki harekete eklenir. “DEVİR” satırı açılış bakiyesidir |

Listede olmayan bankaların ekstreleri **genel okuyucuyla** denenir: tablo başlığındaki yaygın sütun adlarını (Tarih, Açıklama, Tutar, Borç, Alacak, Bakiye, Dekont No…) arar, tutarlar işaretsizse işareti bakiye farkından çıkarır, çok satırlı açıklamaları satırlar arasındaki boşluğa bakarak hareketlere dağıtır. Bakiye kontrolü tutarlıysa tarih ve tutarlar doğrudur; açıklamaları gözden geçirin.

## Özel durumlar

- **İç virman:** Bakiyeyi değiştirmeyen satırlar (ör. İş Bankası “KMH-ANAPARA BORCU TAHSİLATI”) hesabın kendi içindeki aktarımdır ve varsayılan olarak Excel’e yazılmaz. Sayfadaki seçenekle eklenebilir.
- **Sıfır tutarlı satırlar** (yetersiz bakiye denemesi, hesap açılışı gibi) yazılmaz.
- **Evrak no olmayan bankalar:** sütun boş kalır; sayfadaki seçenekle sıra numarası verilebilir.
- **Şifreli PDF:** kartta şifre sorulur.
- **Taranmış (resim) PDF:** metin olmadığı için okunamaz; bankanın internet şubesinden indirilen PDF kullanılmalı.

## Sürümler

| Sürüm | Değişiklik |
|---|---|
| 1.2.0 | Ziraat Katılım biçimi; genel okuyucuda açıklama eşleştirmesi iyileştirildi |
| 1.1.0 | Excel’e Bakiye sütunu |
| 1.0.0 | İlk sürüm: 10 banka biçimi, bakiye kontrolü, Zirve Nova Excel’i |

Sayfanın altında kullandığınız sürüm yazar. Yeni sürüm çıktığında [Sürümler](https://github.com/menesakd/Muhasebe-Araclari/releases) sayfasından indirip eski dosyanın yerine koyun.

## Geliştirme

```
src/ortak.js      tutar ve tarih okuma, metin sadeleştirme
src/bankalar.js   banka biçimleri (sütun başlıkları, tarih deseni, açıklama yerleşimi)
src/motor.js      PDF metnini satır ve sütunlara ayırır, hareketleri çıkarır, bakiye zincirini doğrular
src/xlsx.js       bağımlılıksız XLSX/ZIP yazıcı
src/cikti.js      Zirve Nova sütunları
src/uygulama.js   sayfa davranışı
src/sayfa.html    sayfa düzeni ve görünüm
pdfjs/            Mozilla pdf.js (Apache 2.0)
araclar/derle.mjs index.html ve tek-dosya sürümünü üretir
araclar/test.mjs  örnek PDF’lerde bakiye kontrolünü çalıştırır
```

Değişiklikten sonra:

```
node araclar/derle.mjs                 # index.html ve tek-dosya/ekstre-donusturucu.html
npm install                            # test için pdf.js paketi
node araclar/test.mjs ornekler         # ornekler/ klasöründeki PDF'leri dener
```

`ornekler/` klasörü depoya yüklenmez (`.gitignore`). Yeni bir banka eklemek için `src/bankalar.js` içindeki bir biçimi örnek alın: sütun başlıklarını, hareket satırının tarih desenini ve uzun açıklamanın satırın altına mı (`alt`), üstüne mi (`ust`), iki yanına mı (`yakin`, `blok`) taştığını (`yerlesim`) tanımlamak çoğu zaman yeterlidir. Sürüm numarası `package.json` içindedir; derleme sayfaya yazar.
