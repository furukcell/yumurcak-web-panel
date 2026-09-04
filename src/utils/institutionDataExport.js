import { ref, get, query, orderByChild, equalTo } from 'firebase/database';
import { database } from '../config/firebase';
import { asArray } from './crudHelpers';
import { formatChildBirthDate } from './childDates';

// {index yolu}/{id}: true şeklindeki index kayıtlarından gerçek kaydı
// (dataPathPrefix/{id}) çeker — ChildrenPage/TeachersPage/ParentsPage'te
// zaten kullanılan aynı desen, burada tek bir yerde tekrar kullanılıyor.
async function fetchIndexedRecords(indexPath, dataPathPrefix) {
  const indexSnap = await get(ref(database, indexPath));
  const idsData = indexSnap.val();
  if (!idsData) return [];
  const ids = Object.keys(idsData);
  const results = await Promise.all(
    ids.map((id) => get(ref(database, `${dataPathPrefix}/${id}`)).then((s) => (s.exists() ? { id, ...s.val() } : null)))
  );
  return results.filter(Boolean);
}

const DURUM_LABEL = { odendi: 'Ödendi', bekliyor: 'Bekliyor', gecikti: 'Gecikti' };

// Kurum Ayarları > "Tüm Kurum Verilerini Dışa Aktar" butonundan çağrılır.
// Kurumun tüm operasyonel verisini (kurum bilgisi, sınıflar, çocuklar,
// veliler, öğretmenler, yöneticiler, ödemeler) tek bir çok sayfalı Excel
// dosyasına indirir — kurum ayrılırken, denetimde ya da düzenli yedek
// almak isteyen bir yönetici için. xlsx dinamik import ediliyor
// (statisticsExport.js'teki aynı yaklaşım): ~300KB'lık kütüphane sadece
// bu butona tıklanınca indirilir, ana bundle'ı büyütmez.
export async function kurumVerisiniDisaAktar(kresId, kresAdi = 'Kurum') {
  if (!kresId) throw new Error('Kurum bulunamadı.');

  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  const [kresSnap, siniflar, cocuklar, veliler, ogretmenler, yoneticiler, odemelerSnap] = await Promise.all([
    get(ref(database, `kresler/${kresId}`)),
    fetchIndexedRecords(`kresSiniflari/${kresId}`, 'siniflar'),
    fetchIndexedRecords(`kresCocuklari/${kresId}`, 'cocuklar'),
    fetchIndexedRecords(`kresKullanicilari/${kresId}/veliler`, 'kullanicilar'),
    fetchIndexedRecords(`kresKullanicilari/${kresId}/ogretmenler`, 'kullanicilar'),
    fetchIndexedRecords(`kresKullanicilari/${kresId}/yoneticiler`, 'kullanicilar'),
    get(query(ref(database, 'odemeler'), orderByChild('kresId'), equalTo(kresId))),
  ]);

  const kres = kresSnap.val() || {};
  const odemeler = odemelerSnap.val()
    ? Object.entries(odemelerSnap.val()).map(([id, o]) => ({ id, ...o }))
    : [];

  const sinifMap = Object.fromEntries(siniflar.map((s) => [s.id, s]));
  const cocukMap = Object.fromEntries(cocuklar.map((c) => [c.id, c]));
  const veliMap = Object.fromEntries(veliler.map((v) => [v.id, v]));

  // ── Kurum Bilgisi ──────────────────────────────────────────────
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      { Alan: 'Kurum Adı', Değer: kres.ad || '' },
      { Alan: 'Adres', Değer: kres.adres || '' },
      { Alan: 'Telefon', Değer: kres.telefon || '' },
      { Alan: 'E-posta', Değer: kres.email || '' },
      { Alan: 'Yönetici', Değer: kres.yoneticiAd || '' },
      { Alan: 'Yönetici Telefonu', Değer: kres.yoneticiTelefon || '' },
      { Alan: 'WhatsApp', Değer: kres.whatsapp || '' },
      { Alan: 'Website', Değer: kres.website || '' },
      { Alan: 'Çalışma Saatleri', Değer: kres.calismaSaatleri || '' },
      { Alan: 'Dışa Aktarma Tarihi', Değer: new Date().toLocaleString('tr-TR') },
    ]),
    'Kurum Bilgisi'
  );

  // ── Sınıflar ───────────────────────────────────────────────────
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      siniflar.map((s) => ({
        'Sınıf Adı': s.ad || '',
        'Yaş Grubu': s.yasGrubu || '',
        Kapasite: s.kapasite ?? '-',
        'Öğretmen Sayısı': asArray(s.ogretmenIds).length,
      }))
    ),
    'Sınıflar'
  );

  // ── Çocuklar ───────────────────────────────────────────────────
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      cocuklar.map((c) => ({
        'Ad Soyad': c.ad || '',
        'Doğum Tarihi': formatChildBirthDate(c.dogumTarihi),
        Sınıf: sinifMap[c.sinifId]?.ad || '-',
        Durum: c.durum === 'ayrildi' ? 'Ayrıldı' : 'Aktif',
        'Ayrılma Tarihi': c.durum === 'ayrildi' ? (c.ayrilmaTarihi || '-') : '-',
        Veliler: asArray(c.veliIds).map((id) => veliMap[id]?.ad).filter(Boolean).join(', ') || '-',
        Adres: c.adres || '-',
        'Kayıt Tarihi': c.createdAt ? new Date(c.createdAt).toLocaleDateString('tr-TR') : '-',
      }))
    ),
    'Çocuklar'
  );

  // ── Veliler ────────────────────────────────────────────────────
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      veliler.map((v) => ({
        'Ad Soyad': v.ad || '',
        'Kullanıcı Adı': v.kullaniciAdi || '-',
        Telefon: v.telefon || v.tel || '-',
        'E-posta': v.email || '-',
        Çocuklar: cocuklar.filter((c) => asArray(c.veliIds).includes(v.id)).map((c) => c.ad).join(', ') || '-',
      }))
    ),
    'Veliler'
  );

  // ── Öğretmenler ────────────────────────────────────────────────
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      ogretmenler.map((o) => ({
        'Ad Soyad': o.ad || '',
        'Kullanıcı Adı': o.kullaniciAdi || '-',
        Telefon: o.telefon || o.tel || '-',
        'E-posta': o.email || '-',
        Sınıflar: siniflar
          .filter((s) => asArray(s.ogretmenIds).map(String).includes(String(o.id)))
          .map((s) => s.ad)
          .join(', ') || '-',
        Durum: o.aktif !== false ? 'Aktif' : 'Pasif',
      }))
    ),
    'Öğretmenler'
  );

  // ── Yöneticiler ────────────────────────────────────────────────
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      yoneticiler.map((y) => ({
        'Ad Soyad': `${y.ad || ''} ${y.soyad || ''}`.trim() || y.kullaniciAdi || '',
        'Kullanıcı Adı': y.kullaniciAdi || '-',
        Telefon: y.telefon || y.tel || '-',
        'E-posta': y.email || '-',
        Durum: y.aktif !== false ? 'Aktif' : 'Pasif',
      }))
    ),
    'Yöneticiler'
  );

  // ── Ödemeler ───────────────────────────────────────────────────
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      odemeler.map((o) => {
        const cocuk = cocukMap[o.cocukId] || {};
        return {
          Çocuk: cocuk.ad || o.cocukAd || '-',
          Dönem: o.donem || `${o.ay || ''}/${o.yil || ''}`,
          'Tutar (TL)': o.tutar || o.amount || 0,
          Durum: DURUM_LABEL[o.durum] || o.durum || '-',
          'Son Ödeme Tarihi': o.sonOdemeTarihi || '-',
          'Ödeme Tarihi': o.odemeTarihi || '-',
        };
      })
    ),
    'Ödemeler'
  );

  const tarih = new Date().toLocaleDateString('tr-TR').replace(/\./g, '-');
  const guvenliAd = (kresAdi || 'Kurum').replace(/[\\/:*?"<>|]/g, '-');
  XLSX.writeFile(wb, `${guvenliAd}-tam-veri-${tarih}.xlsx`);

  return {
    sinifSayisi: siniflar.length,
    cocukSayisi: cocuklar.length,
    veliSayisi: veliler.length,
    ogretmenSayisi: ogretmenler.length,
    yoneticiSayisi: yoneticiler.length,
    odemeSayisi: odemeler.length,
  };
}
