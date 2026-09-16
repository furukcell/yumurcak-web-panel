import React, { useEffect, useState } from 'react';
import { Alert, Card, Empty, Spin, Table, Tag, Typography } from 'antd';
import { equalTo, get, orderByChild, query, ref } from 'firebase/database';
import { database } from '../src/config/firebase';
import { getPlatformSnapshot } from './superadminService';

const { Text } = Typography;

export default function SuperAdminInstitutionCredentials() {
  const [institution, setInstitution] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    let timer = null;

    const resolveInstitution = async () => {
      const label = document.querySelector('.ant-select-selection-item')?.textContent?.trim() || '';
      if (!label) {
        if (alive) setInstitution(null);
        return;
      }
      try {
        const platform = await getPlatformSnapshot();
        const selected = (platform?.institutions || []).find((x) => (x.ad || x.kresAdi || x.isim || x.id) === label);
        if (alive) setInstitution(selected || null);
      } catch (e) {
        if (alive) setError(e?.message || 'Kurum bilgisi alınamadı.');
      }
    };

    resolveInstitution();
    timer = window.setInterval(resolveInstitution, 800);
    return () => { alive = false; if (timer) window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let alive = true;
    if (!institution?.id) {
      setUsers([]);
      return undefined;
    }
    setLoading(true);
    setError('');
    const load = async () => {
      try {
        const q = query(ref(database, 'kullanicilar'), orderByChild('kresId'), equalTo(institution.id));
        const snap = await get(q);
        const rows = snap.exists() ? Object.values(snap.val()) : [];
        const filtered = rows
          .filter((u) => u && (u.rol === 'ogretmen' || u.rol === 'veli') && u.kullaniciAdi)
          .map((u) => ({
            key: u.id || u.uid || u.kullaniciAdi,
            ad: u.ad || '—',
            rol: u.rol,
            kullaniciAdi: u.kullaniciAdi,
            sifre: u.sifre || 'Kayıtlı değil',
            aktif: u.aktif !== false,
          }))
          .sort((a, b) => a.rol.localeCompare(b.rol, 'tr') || a.ad.localeCompare(b.ad, 'tr'));
        if (alive) setUsers(filtered);
      } catch (e) {
        if (alive) setError(e?.message || 'Kurum kullanıcıları alınamadı.');
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => { alive = false; };
  }, [institution?.id]);

  if (!institution) return null;

  return <Card
    style={{ marginBottom: 16 }}
    title={<span>{institution.ad || institution.kresAdi || institution.isim || 'Kurum'} — Mevcut Kullanıcılar</span>}
  >
    <Text type="secondary">Bu kurumda daha önce oluşturulmuş öğretmen ve veli hesapları burada görünür. Yeni kurulum yapmana gerek yok.</Text>
    {error && <Alert style={{ marginTop: 12 }} type="error" showIcon message={error} />}
    {loading ? <div style={{ padding: 24, textAlign: 'center' }}><Spin /></div> : users.length ? <Table
      style={{ marginTop: 14 }}
      size="small"
      pagination={{ pageSize: 20 }}
      rowKey="key"
      dataSource={users}
      columns={[
        { title: 'Rol', dataIndex: 'rol', width: 120, render: (rol) => <Tag color={rol === 'ogretmen' ? 'blue' : 'green'}>{rol === 'ogretmen' ? 'Öğretmen' : 'Veli'}</Tag> },
        { title: 'Ad Soyad', dataIndex: 'ad' },
        { title: 'Kullanıcı Adı', dataIndex: 'kullaniciAdi', render: (v) => <Text code>{v}</Text> },
        { title: 'Şifre', dataIndex: 'sifre', render: (v) => <Text code>{v}</Text> },
        { title: 'Durum', dataIndex: 'aktif', width: 100, render: (aktif) => <Tag color={aktif ? 'green' : 'red'}>{aktif ? 'Aktif' : 'Pasif'}</Tag> },
      ]}
    /> : <Empty style={{ marginTop: 20 }} description="Bu kurumda henüz öğretmen/veli hesabı bulunmuyor" />}
  </Card>;
}
