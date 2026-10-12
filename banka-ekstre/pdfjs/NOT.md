# pdf.js

Mozilla pdf.js 6.2.108, eski tarayıcıları da destekleyen "legacy" derlemesi (Apache 2.0, bkz. LICENSE).

`pdf.worker.min.mjs` içindeki dize sabitlerinde bulunan ham kontrol karakterleri, aynı değeri veren
`\uXXXX` kaçışlarına çevrilmiştir (davranış değişmez). Bazı barındırma ortamları ham kontrol
karakteri içeren metin dosyalarını kabul etmediği için yapıldı.
