import React from 'react';
import { Button, message } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { get, ref } from 'firebase/database';
import { useSearchParams } from 'react-router-dom';
import { database } from '../src/config/firebase';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function collectDomCredentials() {
  const lines = document.body.innerText.split(/\n+/).map((x) => x.trim()).filter(Boolean);
  const rows = [];
  let role = '';
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i] === 'Öğretmenler') role = 'Öğretmen';
    if (lines[i] === 'Veliler') role = 'Veli';
    if ((lines[i] === 'Yeni' || lines[i] === 'Mevcut') && lines[i + 1]?.includes(' / ')) {
      const [kullaniciAdi, sifre] = lines[i + 1].split(' / ').map((x) => x.trim());
      if (kullaniciAdi && sifre && role) rows.push({ role, kullaniciAdi, sifre });
    }
  }
  return rows;
}

export default function SuperAdminCredentialsPdf() {
  const [searchParams] = useSearchParams();

  const pdfAktar = async () => {
    const kresId = searchParams.get('kresId') || '';
    let rows = [];
    let kurum = document.querySelector('.ant-select-selection-item')?.textContent?.trim() || 'Yumurcak Kurumu';

    if (kresId) {
      try {
        const snap = await get(ref(database, 'kullanicilar'));
        const users = snap.exists() ? Object.values(snap.val()) : [];
        rows = users
          .filter((u) => u && u.kresId === kresId && (u.rol === 'ogretmen' || u.rol === 'veli'))
          .map((u) => ({
            role: u.rol === 'ogretmen' ? 'Öğretmen' : 'Veli',
            ad: u.ad || '',
            kullaniciAdi: u.kullaniciAdi || '',
            sifre: u.sifre || '',
          }))
          .filter((x) => x.kullaniciAdi);
      } catch (e) {
        message.error(e?.message || 'Kurum kullanıcıları alınamadı.');
        return;
      }
    }

    // URL'de kurum yoksa, son kuruluma ait ekrandaki bilgileri yine kullan.
    if (!rows.length) {
      rows = collectDomCredentials();
    }

    if (!rows.length) {
      message.info('Bu kurum için öğretmen/veli hesabı bulunamadı.');
      return;
    }

    const ogretmenler = rows.filter((x) => x.role === 'Öğretmen');
    const veliler = rows.filter((x) => x.role === 'Veli');
    const tarih = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long' }).format(new Date());
    const popup = window.open('', '_blank', 'width=1000,height=800');
    if (!popup) {
      message.error('PDF penceresi açılamadı. Tarayıcı açılır pencere iznini kontrol et.');
      return;
    }

    const tablo = (baslik, liste) => liste.length ? `
      <section class="section">
        <h2>${baslik}</h2>
        <table>
          <thead><tr><th>Ad Soyad</th><th>Kullanıcı Adı</th><th>Şifre</th></tr></thead>
          <tbody>${liste.map((x) => `<tr><td>${escapeHtml(x.ad || '—')}</td><td class="mono">${escapeHtml(x.kullaniciAdi)}</td><td class="mono">${escapeHtml(x.sifre || 'Kayıtlı değil')}</td></tr>`).join('')}</tbody>
        </table>
      </section>` : '';

    popup.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8" /><title>Yumurcak - Kullanıcı Bilgileri</title>
      <style>
        @page { size: A4; margin: 16mm; }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #172033; background: #fff; }
        .header { border-bottom: 3px solid #6c3deb; padding-bottom: 14px; margin-bottom: 22px; }
        .brand { font-size: 26px; font-weight: 800; color: #6c3deb; }
        .title { margin-top: 6px; font-size: 22px; font-weight: 700; }
        .meta { margin-top: 10px; color: #667085; font-size: 13px; }
        .section { margin-top: 24px; page-break-inside: avoid; }
        h2 { font-size: 16px; margin: 0 0 10px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { background: #f2f5fa; text-align: left; }
        th, td { border: 1px solid #d9dee8; padding: 9px; }
        tr { page-break-inside: avoid; }
        .mono { font-family: "Courier New", monospace; }
        .note { margin-top: 28px; padding: 12px 14px; border: 1px solid #d9dee8; border-radius: 8px; background: #f8fafc; color: #475467; font-size: 11px; line-height: 1.5; }
        .footer { margin-top: 24px; font-size: 10px; color: #98a2b3; text-align: center; }
      </style></head><body>
        <div class="header"><div class="brand">YUMURCAK</div><div class="title">Kurum Kullanıcı Bilgileri</div><div class="meta"><strong>Kurum:</strong> ${escapeHtml(kurum)} &nbsp; • &nbsp; <strong>Tarih:</strong> ${escapeHtml(tarih)}</div></div>
        ${tablo('Öğretmen Hesapları', ogretmenler)}
        ${tablo('Veli Hesapları', veliler)}
        <div class="note"><strong>Güvenlik notu:</strong> Bu belge giriş bilgilerini içerir. Güvenli şekilde saklayın ve ilk girişten sonra şifrenin değiştirilmesini önerin.</div>
        <div class="footer">Yumurcak Kreş Yönetim Sistemi</div>
      </body></html>`);
    popup.document.close();
    popup.focus();
    setTimeout(() => popup.print(), 250);
  };

  return <Button icon={<PrinterOutlined />} onClick={pdfAktar}>Kurum Kullanıcılarını PDF'e Aktar</Button>;
}
