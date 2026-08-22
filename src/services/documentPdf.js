// Mobildeki src/services/documentPdf.js'in web karşılığı.
// HTML üretim mantığı (buildMonthlyDocumentHtml, buildServiceListHtml,
// buildBirthdayCalendarHtml, buildIlacTakipHtml) BİREBİR aynı — sadece
// "yazdırma" mekanizması farklı: mobilde expo-print kullanılıyordu,
// web'de tarayıcının kendi yazdırma diyaloğu kullanılıyor (bu diyalog
// zaten "PDF olarak kaydet" seçeneği içerdiği için mobildeki ayrı
// Yazdır/Paylaş-İndir butonları web'de TEK "Yazdır / PDF" butonuna
// birleştirildi).
import { ref, get } from 'firebase/database';
import { database } from '../config/firebase';

function getMealText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  return value.text || value.aciklama || '';
}

export async function fetchInstitutionInfo(kresId) {
  if (!kresId) return null;
  try {
    const snap = await get(ref(database, `kresler/${kresId}`));
    return snap.val() || null;
  } catch (error) {
    console.warn('Kurum bilgileri okunamadı:', error?.code || error?.message || error);
    return null;
  }
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const WEEKDAY_LABELS_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

function formatDateTr(dateKey) {
  const parts = String(dateKey || '').split('-');
  if (parts.length !== 3) return dateKey || '';
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}
function weekdayLabel(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return WEEKDAY_LABELS_TR[date.getDay()] || '';
}

export function buildMonthlyDocumentHtml({ docType, kres, monthLabel, sinifAd, records }) {
  const kurumAd = escapeHtml(kres?.ad || 'Kreş');
  const adres = escapeHtml(kres?.adres || '');
  const telefon = escapeHtml(kres?.telefon || '');
  const yonetici = escapeHtml(kres?.yoneticiAd || '');
  const logoUrl = kres?.logoUrl || '';

  if (docType === 'gorev') {
    return buildBulletinHtml({ kurumAd, adres, telefon, yonetici, logoUrl, monthLabel, record: (records || [])[0] });
  }

  const TITLES = { yemek: 'Aylık Yemek Listesi', ders: 'Aylık Ders Programı', nobet: 'Aylık Nöbet Çizelgesi' };
  const isMeal = docType === 'yemek';
  const isDuty = docType === 'nobet';
  const title = TITLES[docType] || 'Aylık Belge';

  const sorted = [...(records || [])].sort((a, b) => String(a.tarih || '').localeCompare(String(b.tarih || '')));
  const isDers = !isMeal && !isDuty;

  let saatSlots = [];
  let hasSaatsizDers = false;
  if (isDers) {
    const slotSet = new Set();
    sorted.forEach((item) => {
      const etkinlikler = Array.isArray(item.etkinlikler) ? item.etkinlikler : [];
      etkinlikler.forEach((it) => {
        if (!it?.etkinlik) return;
        if (it.baslangicSaati) slotSet.add(`${it.baslangicSaati}|${it.bitisSaati || ''}`);
        else hasSaatsizDers = true;
      });
    });
    saatSlots = Array.from(slotSet).sort().map((key) => {
      const [bas, bit] = key.split('|');
      return { key, label: bit ? `${bas}-${bit}` : bas };
    });
  }
  const useSaatGrid = isDers && saatSlots.length > 0;

  const rows = sorted.map((item) => {
    const dateLabel = formatDateTr(item.tarih);
    const day = weekdayLabel(item.tarih);

    if (isMeal) {
      const ogunler = item.ogunler || {};
      return `<tr><td>${escapeHtml(dateLabel)}<br/><span class="weekday">${escapeHtml(day)}</span></td><td>${escapeHtml(getMealText(ogunler.kahvalti))}</td><td>${escapeHtml(getMealText(ogunler.ogle))}</td><td>${escapeHtml(getMealText(ogunler.araOgun))}</td></tr>`;
    }
    if (isDuty) {
      return `<tr><td>${escapeHtml(dateLabel)}<br/><span class="weekday">${escapeHtml(day)}</span></td><td>${escapeHtml(item.personel || '')}</td><td>${escapeHtml(item.not || '')}</td></tr>`;
    }

    const etkinlikler = Array.isArray(item.etkinlikler) ? item.etkinlikler : [];
    if (useSaatGrid) {
      const bySlot = {};
      const saatsizList = [];
      etkinlikler.forEach((it) => {
        if (!it?.etkinlik) return;
        if (it.baslangicSaati) {
          const key = `${it.baslangicSaati}|${it.bitisSaati || ''}`;
          (bySlot[key] = bySlot[key] || []).push(it);
        } else {
          saatsizList.push(it);
        }
      });
      const cellHtml = (it) => `${escapeHtml(it.etkinlik)}${it.aciklama ? `<br/><span class="ders-aciklama">${escapeHtml(it.aciklama)}</span>` : ''}`;
      const slotCells = saatSlots.map(({ key }) => `<td>${(bySlot[key] || []).map(cellHtml).join('<br/>')}</td>`).join('');
      const saatsizCell = hasSaatsizDers ? `<td>${saatsizList.map(cellHtml).join('<br/>')}</td>` : '';
      return `<tr><td>${escapeHtml(dateLabel)}<br/><span class="weekday">${escapeHtml(day)}</span></td>${slotCells}${saatsizCell}</tr>`;
    }

    const etkinlikText = etkinlikler.map((it) => it?.etkinlik || '').filter(Boolean).join(', ');
    const aciklamaText = etkinlikler.map((it) => it?.aciklama || '').filter(Boolean).join(' · ');
    return `<tr><td>${escapeHtml(dateLabel)}<br/><span class="weekday">${escapeHtml(day)}</span></td><td>${escapeHtml(etkinlikText)}</td><td>${escapeHtml(aciklamaText)}</td></tr>`;
  }).join('');

  const headerCols = isMeal
    ? '<th>Tarih</th><th>Kahvaltı</th><th>Öğle Yemeği</th><th>Ara Öğün</th>'
    : isDuty
    ? '<th>Tarih</th><th>Nöbetçi Personel</th><th>Not</th>'
    : useSaatGrid
    ? `<th>Tarih</th>${saatSlots.map((s) => `<th>${escapeHtml(s.label)}</th>`).join('')}${hasSaatsizDers ? '<th>Diğer</th>' : ''}`
    : '<th>Tarih</th><th>Etkinlik</th><th>Açıklama</th>';

  const colSpan = isMeal ? 4 : useSaatGrid ? 1 + saatSlots.length + (hasSaatsizDers ? 1 : 0) : 3;

  return `<html><head><meta charset="utf-8" /><style>
    * { box-sizing: border-box; } body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #191A23; padding: 24px; }
    .header { display: flex; align-items: center; gap: 14px; border-bottom: 3px solid #6C3DEB; padding-bottom: 14px; margin-bottom: 18px; }
    .header img { width: 56px; height: 56px; border-radius: 12px; object-fit: cover; }
    .kurum-ad { font-size: 20px; font-weight: 900; color: #6C3DEB; margin: 0; }
    .kurum-meta { font-size: 11px; color: #707386; margin: 2px 0 0; }
    h1 { font-size: 16px; margin: 0 0 4px; } .subtitle { font-size: 12px; color: #707386; margin: 0 0 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background: #EFE8FF; color: #4B22B8; text-align: left; padding: 8px; border: 1px solid #EEEAF8; }
    td { padding: 8px; border: 1px solid #EEEAF8; vertical-align: top; }
    .weekday { font-size: 9px; color: #707386; } .ders-aciklama { font-size: 9px; color: #707386; }
    .footer { margin-top: 24px; font-size: 10px; color: #707386; display: flex; justify-content: space-between; }
    .signature { margin-top: 40px; font-size: 11px; text-align: right; } .empty { text-align: center; color: #707386; padding: 18px; }
    @media print { body { padding: 0; } }
  </style></head><body>
    <div class="header">${logoUrl ? `<img src="${escapeHtml(logoUrl)}" />` : ''}<div><p class="kurum-ad">${kurumAd}</p><p class="kurum-meta">${[adres, telefon].filter(Boolean).join(' · ')}</p></div></div>
    <h1>${title}${sinifAd ? ` — ${escapeHtml(sinifAd)}` : ''}</h1>
    <p class="subtitle">${escapeHtml(monthLabel)}</p>
    <table><thead><tr>${headerCols}</tr></thead><tbody>${rows || `<tr><td colspan="${colSpan}" class="empty">Bu ay için yayınlanmış kayıt yok.</td></tr>`}</tbody></table>
    ${yonetici ? `<div class="signature">Onaylayan: ${yonetici}</div>` : ''}
    <div class="footer"><span>Yumurcak</span><span>${escapeHtml(new Date().toLocaleDateString('tr-TR'))} tarihinde oluşturuldu</span></div>
  </body></html>`;
}

function buildBulletinHtml({ kurumAd, adres, telefon, yonetici, logoUrl, monthLabel, record }) {
  const baslik = escapeHtml(record?.baslik || 'Aylık Belge');
  const bolumler = Array.isArray(record?.bolumler) ? record.bolumler : [];
  const sectionsHtml = bolumler
    .filter((section) => String(section?.icerik || '').trim())
    .map((section) => `<div class="section">${section?.baslik ? `<h2>${escapeHtml(section.baslik)}</h2>` : ''}<p>${escapeHtml(section.icerik).replace(/\n/g, '<br/>')}</p></div>`)
    .join('');

  return `<html><head><meta charset="utf-8" /><style>
    * { box-sizing: border-box; } body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #191A23; padding: 24px; }
    .header { display: flex; align-items: center; gap: 14px; border-bottom: 3px solid #6C3DEB; padding-bottom: 14px; margin-bottom: 18px; }
    .header img { width: 56px; height: 56px; border-radius: 12px; object-fit: cover; }
    .kurum-ad { font-size: 20px; font-weight: 900; color: #6C3DEB; margin: 0; } .kurum-meta { font-size: 11px; color: #707386; margin: 2px 0 0; }
    h1 { font-size: 18px; margin: 0 0 4px; } .subtitle { font-size: 12px; color: #707386; margin: 0 0 20px; }
    .section { margin-bottom: 18px; } h2 { font-size: 13px; color: #4B22B8; margin: 0 0 6px; } p { font-size: 12px; line-height: 1.6; margin: 0; }
    .empty { text-align: center; color: #707386; padding: 18px; } .signature { margin-top: 40px; font-size: 11px; text-align: right; }
    .footer { margin-top: 24px; font-size: 10px; color: #707386; display: flex; justify-content: space-between; }
    @media print { body { padding: 0; } }
  </style></head><body>
    <div class="header">${logoUrl ? `<img src="${escapeHtml(logoUrl)}" />` : ''}<div><p class="kurum-ad">${kurumAd}</p><p class="kurum-meta">${[adres, telefon].filter(Boolean).join(' · ')}</p></div></div>
    <h1>${baslik}</h1><p class="subtitle">${escapeHtml(monthLabel)}</p>
    ${sectionsHtml || '<p class="empty">Bu ay için yayınlanmış içerik yok.</p>'}
    ${yonetici ? `<div class="signature">Onaylayan: ${yonetici}</div>` : ''}
    <div class="footer"><span>Yumurcak</span><span>${escapeHtml(new Date().toLocaleDateString('tr-TR'))} tarihinde oluşturuldu</span></div>
  </body></html>`;
}

function wrapDocumentPage({ kurumAd, adres, telefon, yonetici, logoUrl, title, subtitle, bodyHtml, extraStyles = '' }) {
  return `<html><head><meta charset="utf-8" /><style>
    * { box-sizing: border-box; } body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #191A23; padding: 24px; }
    .header { display: flex; align-items: center; gap: 14px; border-bottom: 3px solid #6C3DEB; padding-bottom: 14px; margin-bottom: 18px; }
    .header img { width: 56px; height: 56px; border-radius: 12px; object-fit: cover; }
    .kurum-ad { font-size: 20px; font-weight: 900; color: #6C3DEB; margin: 0; } .kurum-meta { font-size: 11px; color: #707386; margin: 2px 0 0; }
    h1 { font-size: 18px; margin: 0 0 4px; } .subtitle { font-size: 12px; color: #707386; margin: 0 0 18px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 14px; }
    th { background: #EFE8FF; color: #4B22B8; text-align: left; padding: 8px; border: 1px solid #EEEAF8; }
    td { padding: 8px; border: 1px solid #EEEAF8; vertical-align: top; }
    .info-table td:first-child { font-weight: 700; color: #4B22B8; width: 32%; background: #FAFAFF; }
    .empty { text-align: center; color: #707386; padding: 18px; }
    .signature-row { display: flex; justify-content: space-between; margin-top: 44px; }
    .signature-box { width: 45%; border-top: 1px solid #191A23; padding-top: 6px; font-size: 11px; text-align: center; }
    .footer { margin-top: 24px; font-size: 10px; color: #707386; display: flex; justify-content: space-between; }
    @media print { body { padding: 0; } }
    ${extraStyles}
  </style></head><body>
    <div class="header">${logoUrl ? `<img src="${escapeHtml(logoUrl)}" />` : ''}<div><p class="kurum-ad">${kurumAd}</p><p class="kurum-meta">${[adres, telefon].filter(Boolean).join(' · ')}</p></div></div>
    <h1>${title}</h1>${subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : ''}
    ${bodyHtml}
    ${yonetici ? `<div class="signature-row"><div class="signature-box">Onaylayan: ${yonetici}</div><div class="signature-box">Veli İmza</div></div>` : ''}
    <div class="footer"><span>Yumurcak</span><span>${escapeHtml(new Date().toLocaleDateString('tr-TR'))} tarihinde oluşturuldu</span></div>
  </body></html>`;
}

export function buildServiceListHtml({ kres, records }) {
  const kurumAd = escapeHtml(kres?.ad || 'Kreş');
  const adres = escapeHtml(kres?.adres || '');
  const telefon = escapeHtml(kres?.telefon || '');
  const yonetici = escapeHtml(kres?.yoneticiAd || '');
  const logoUrl = kres?.logoUrl || '';

  const sorted = [...(records || [])].sort((a, b) => String(a.alisSaati || '').localeCompare(String(b.alisSaati || '')));
  const rows = sorted.map((item) => `<tr><td>${escapeHtml(item.ad || '')}</td><td>${escapeHtml(item.sinifAd || '')}</td><td>${escapeHtml(item.servisAd || '')}</td><td>${escapeHtml(item.alisSaati || '')}</td><td>${escapeHtml(item.birakisSaati || '')}</td><td>${escapeHtml(item.servisNotu || '')}</td></tr>`).join('');

  const bodyHtml = `<table><thead><tr><th>Çocuk</th><th>Sınıf</th><th>Servis Aracı</th><th>Alış Saati</th><th>Bırakış Saati</th><th>Not</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="empty">Servis kullanan çocuk kaydı yok.</td></tr>'}</tbody></table>`;

  return wrapDocumentPage({ kurumAd, adres, telefon, yonetici, logoUrl, title: 'Servis Listesi', subtitle: `${(records || []).length} çocuk`, bodyHtml });
}

export function buildBirthdayCalendarHtml({ kres, monthLabel, records }) {
  const kurumAd = escapeHtml(kres?.ad || 'Kreş');
  const adres = escapeHtml(kres?.adres || '');
  const telefon = escapeHtml(kres?.telefon || '');
  const yonetici = escapeHtml(kres?.yoneticiAd || '');
  const logoUrl = kres?.logoUrl || '';

  const sorted = [...(records || [])].sort((a, b) => (a.gun || 0) - (b.gun || 0));
  const rows = sorted.map((item) => `<tr><td>${escapeHtml(item.gun)}</td><td>${escapeHtml(item.ad || '')}</td><td>${escapeHtml(item.sinifAd || '')}</td><td>${item.yasOlacak != null ? `${escapeHtml(item.yasOlacak)} yaşında` : ''}</td></tr>`).join('');

  const bodyHtml = `<table><thead><tr><th>Gün</th><th>Çocuk</th><th>Sınıf</th><th>Kaç Yaşına Giriyor</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="empty">Bu ay doğum günü olan çocuk yok.</td></tr>'}</tbody></table>`;

  return wrapDocumentPage({ kurumAd, adres, telefon, yonetici, logoUrl, title: 'Doğum Günü Takvimi', subtitle: monthLabel, bodyHtml });
}

// Web karşılığı: tarayıcının kendi yazdırma diyaloğunu açar. Bu diyalog
// "PDF olarak kaydet" seçeneğini zaten içerdiği için mobildeki ayrı
// "Paylaş/İndir" adımına web'de gerek yok.
export function printHtmlDocument(html) {
  const printWindow = window.open('', '_blank', 'width=900,height=1200');
  if (!printWindow) {
    throw new Error('Yazdırma penceresi açılamadı. Tarayıcının pop-up engelleyicisini kontrol et.');
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  // İçerik (özellikle logo görseli) tam yüklensin diye kısa bir bekleme.
  setTimeout(() => {
    printWindow.print();
  }, 350);
}
