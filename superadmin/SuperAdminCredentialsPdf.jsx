import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Empty, Select, Space, Spin, Table, Tag, Typography, message } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { get, ref } from 'firebase/database';
import { useSearchParams } from 'react-router-dom';
import { database } from '../src/config/firebase';
import { getPlatformSnapshot } from './superadminService';

const { Text } = Typography;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
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
  const [institutions, setInstitutions] = useState([]);
  const [kresId, setKresId] = useState(searchParams.get('kresId') || '');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      getPlatformSnapshot(),
      get(ref(database, 'kullanicilar')),
    ]).then(([platform, userSnap]) => {
      if (!mounted) return;
      setInstitutions(platform?.institutions || []);
      const allUsers = userSnap.exists() ? Object.values(userSnap.val()) : [];
      setUsers(allUsers.filter((u) => u && (u.rol === 'ogretmen' || u.rol === 'veli')));
      const initial = searchParams.get('kresId') || '';
      if (initial) setKresId(initial);
    }).catch((e) => {
      if (mounted) message.error(e?.message || 'Kurum kullanıcıları alınamadı.');
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, [searchParams]);

  const selectedInstitution = institutions.find((x) => x.id === kresId);
  const selectedInstitutionName = selectedInstitution?.ad || selectedInstitution?.kresAdi || selectedInstitution?.isim || selectedInstitution?.id || 'Kurum';

  const rows = useMemo(() => users
    .filter((u) => u.kresId === kresId)
    .map((u) => ({
      key: u.id || u.uid || u.kullaniciAdi,
      role: u.rol === 'ogretmen' ? 'Öğretmen' : 'Veli',
      ad: u.ad || '—',
      kullaniciAdi: u.kullaniciAdi || '',
      sifre: u.sifre || 'Kayıtlı değil',
      aktif: u.aktif !== false,
    }))
    .filter((x) => x.kullaniciAdi)
    .sort((a, b) => a.role.localeCompare(b.role, 'tr') || a.ad.localeCompare(b.ad, 'tr')),
  [users, kresId]);

  const pdfAktar = async () => {
    let exportRows = rows;
    let kurum = selectedInstitutionName;

    if (!exportRows.length) exportRows = collectDomCredentials().map((x, i) => ({ ...x, key: i, ad: '' }));
    if (!exportRows.length) {
      message.info('Bu kurum için öğretmen/veli hesabı bulunamadı.');
      return;
    }

    const ogretmenler = exportRows.filter((x) => x.role === 'Öğretmen');
    const veliler = exportRows.filter((x) => x.role === 'Veli');
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

    popup.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8" /><title>Yumurcak - Kurum Kullanıcı Bilgileri</title>
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

  if (loading) return <Card><Spin /> <Text style={{ marginLeft: 8 }}>Kurum kullanıcıları yükleniyor...</Text></Card>;

  return (
    <Card
      title="Kurum Kullanıcıları"
      extra={<Button type="primary" icon={<PrinterOutlined />} onClick={pdfAktar} disabled={!kresId}>Kurum Kullanıcılarını PDF'e Aktar</Button>}
      style={{ marginBottom: 16 }}
    >
      <Space wrap style={{ width: '100%', marginBottom: 16 }}>
        <Text strong>Kurum:</Text>
        <Select
          showSearch
          optionFilterProp="label"
          value={kresId || undefined}
          onChange={setKresId}
          placeholder="PDF/kullanıcı bilgilerini görmek için kurum seçin"
          style={{ minWidth: 360 }}
          options={institutions.map((x) => ({ value: x.id, label: x.ad || x.kresAdi || x.isim || x.id }))}
        />
        {kresId && <Tag color="blue">{rows.length} kullanıcı</Tag>}
      </Space>

      {kresId && !rows.length && <Empty description="Bu kurumda öğretmen/veli hesabı bulunamadı." />}
      {kresId && rows.length > 0 && (
        <Table
          size="small"
          pagination={{ pageSize: 20, showSizeChanger: false }}
          dataSource={rows}
          columns={[
            { title: 'Rol', dataIndex: 'role', width: 110, render: (value) => <Tag color={value === 'Öğretmen' ? 'blue' : 'purple'}>{value}</Tag> },
            { title: 'Ad Soyad', dataIndex: 'ad' },
            { title: 'Kullanıcı Adı', dataIndex: 'kullaniciAdi' },
            { title: 'Şifre', dataIndex: 'sifre' },
            { title: 'Durum', dataIndex: 'aktif', width: 100, render: (value) => <Tag color={value ? 'green' : 'red'}>{value ? 'Aktif' : 'Pasif'}</Tag> },
          ]}
        />
      )}
    </Card>
  );
}
