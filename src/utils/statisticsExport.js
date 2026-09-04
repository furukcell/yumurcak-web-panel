// İstatistik sayfası için Excel dışa aktarma — müdürün bu raporu
// yönetim kuruluna/ortağa gönderebilmesi ya da arşivleyebilmesi için.
// Ekstra bir backend/Cloud Function gerekmiyor, tamamen tarayıcıda
// (SheetJS/xlsx) çalışıyor. PDF çıktısı için ayrı bir kütüphane
// eklemek yerine window.print() + StatisticsPage.jsx'teki yazdırma
// düzeni (bkz. index.css @media print) kullanılıyor — "Yazdır" >
// "PDF olarak kaydet" tarayıcıda zaten var.
// xlsx dinamik import ediliyor: ~300KB'lık kütüphane sadece "Excel'e
// Aktar" tıklanınca indiriliyor, ana bundle'ı büyütmüyor.
export async function exportStatisticsToExcel(stats, kresAdi = 'Kurum') {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  const genelRows = [
    { Metrik: 'Toplam çocuk (aktif)', Değer: stats.totalChildren },
    { Metrik: 'Bu ay net değişim', Değer: stats.totalChildrenChange },
    { Metrik: 'Ayrılan çocuk (tüm zamanlar)', Değer: stats.ayrilanChildrenCount },
    { Metrik: 'Öğretmen', Değer: stats.totalTeachers },
    { Metrik: 'Veli', Değer: stats.totalParents },
    { Metrik: 'Sınıf', Değer: stats.totalClasses },
    { Metrik: 'Bugünkü devam oranı (%)', Değer: stats.todayAttendanceRate },
    { Metrik: 'Aylık devam oranı (%)', Değer: stats.monthlyAttendanceRate },
    { Metrik: 'Aylık devam oranı değişim (puan)', Değer: stats.monthlyAttendanceRateChange },
    { Metrik: 'Tahsilat oranı (%)', Değer: stats.paymentCollectionRate },
    { Metrik: 'Tahsilat oranı değişim (puan)', Değer: stats.paymentCollectionRateChange },
    { Metrik: 'Ödenen tutar (TL)', Değer: Math.round(stats.paidAmount) },
    { Metrik: 'Bekleyen/geciken tutar (TL)', Değer: Math.round(stats.pendingAmount) },
    { Metrik: 'Bekleyen ödeme kaydı', Değer: stats.pendingPaymentCount },
    { Metrik: 'Aktif anket', Değer: stats.activePollCount },
    { Metrik: 'Anket cevabı', Değer: stats.pollAnswerCount },
    { Metrik: 'Bu ay kurum zili bildirimi', Değer: stats.bellCount },
    { Metrik: 'Bekleyen kurum zili', Değer: stats.pendingBellCount },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(genelRows), 'Genel');

  const doluluk = stats.classOccupancy.map((c) => ({
    Sınıf: c.name,
    'Çocuk Sayısı': c.childCount,
    Kapasite: c.kapasite || '-',
    'Doluluk (%)': c.rate === null ? 'Kapasite girilmemiş' : c.rate,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(doluluk), 'Sınıf Doluluk');

  const kayitHareketleri = stats.enrollmentTrend.map((m) => ({
    Ay: m.ay,
    'Yeni Kayıt': m.yeni,
    Ayrılan: m.ayrilan,
    Net: m.net,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kayitHareketleri), 'Kayıt Hareketleri');

  const ogretmenler = stats.teacherStats.map((t) => ({
    Öğretmen: t.name,
    Sınıflar: t.classNames || '-',
    'Çocuk Sayısı': t.childCount,
    'Bu Ay Rapor': t.reportCount,
    'Yoklama Düzeni (%)': t.attendanceRate,
    'Etkinlik Kaydı': t.eventCount,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ogretmenler), 'Öğretmenler');

  const cocuklar = stats.childStats.map((c) => ({
    Çocuk: c.name,
    Sınıf: c.className || '-',
    'Devam (%)': c.attendanceRate,
    'Yemek İyi (%)': c.mealGoodRate,
    'Etkinlik Katılımı (%)': c.eventJoinRate,
    Riskler: c.risks.length ? c.risks.join(', ') : 'Yok',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cocuklar), 'Çocuklar');

  const tarih = new Date().toLocaleDateString('tr-TR').replace(/\./g, '-');
  XLSX.writeFile(wb, `${kresAdi}-istatistik-${tarih}.xlsx`);
}
