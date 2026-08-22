import React, { useEffect, useState } from 'react';
import { Typography, Input, Button, Upload, message, Spin, Card } from 'antd';
import { CameraOutlined, DeleteOutlined } from '@ant-design/icons';
import { ref, get, update } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { database, storage } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme';
import { useNavigate } from 'react-router-dom';

const { Title, Text, Paragraph } = Typography;

function buildAdminName(user) {
  return `${user?.ad || ''} ${user?.soyad || ''}`.trim() || user?.kullaniciAdi || '';
}

// Mobildeki AdminInstitutionSettingsScreen.js'in web karşılığı.
export default function InstitutionSettingsPage() {
  const { kullanici } = useAuth();
  const kresId = kullanici?.kresId || 'kres001';
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');

  const [form, setForm] = useState({ ad: '', adres: '', telefon: '', email: '', yoneticiAd: '', yoneticiTelefon: '', whatsapp: '', website: '', calismaSaatleri: '', not: '' });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const snap = await get(ref(database, `kresler/${kresId}`));
        const data = snap.val() || {};
        if (!mounted) return;
        setLogoUrl(data.logoUrl || '');
        setForm({
          ad: data.ad || '', adres: data.adres || '', telefon: data.telefon || '', email: data.email || '',
          yoneticiAd: data.yoneticiAd || buildAdminName(kullanici), yoneticiTelefon: data.yoneticiTelefon || kullanici?.telefon || '',
          whatsapp: data.whatsapp || data.telefon || '', website: data.website || '', calismaSaatleri: data.calismaSaatleri || '', not: data.not || '',
        });
      } catch {
        message.error('Kurum bilgileri yüklenemedi.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [kresId]);

  const setValue = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    if (!form.ad.trim()) { message.error('Kurum adı zorunludur.'); return; }
    setSaving(true);
    try {
      await update(ref(database, `kresler/${kresId}`), {
        ...form,
        ad: form.ad.trim(), adres: form.adres.trim(), telefon: form.telefon.trim(), email: form.email.trim(),
        yoneticiAd: form.yoneticiAd.trim(), yoneticiTelefon: form.yoneticiTelefon.trim(), whatsapp: form.whatsapp.trim(),
        website: form.website.trim(), calismaSaatleri: form.calismaSaatleri.trim(), not: form.not.trim(),
        yoneticiId: kullanici?.uid || kullanici?.id || '', updatedAt: Date.now(),
      });
      message.success('Kurum bilgileri kaydedildi');
    } catch {
      message.error('Kurum bilgileri kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (file) => {
    setUploadingLogo(true);
    try {
      const fileRef = storageRef(storage, `kurumLogolari/${kresId}.jpg`);
      await uploadBytes(fileRef, file, { contentType: file.type || 'image/jpeg' });
      const downloadUrl = await getDownloadURL(fileRef);
      await update(ref(database, `kresler/${kresId}`), { logoUrl: downloadUrl, logoUpdatedAt: Date.now(), updatedAt: Date.now() });
      setLogoUrl(downloadUrl);
      message.success('Kurum fotoğrafı güncellendi');
    } catch {
      message.error('Kurum fotoğrafı yüklenemedi. Storage ayarlarını kontrol et.');
    } finally {
      setUploadingLogo(false);
    }
    return false; // antd Upload'un kendi yüklemesini engelle, biz manuel yapıyoruz
  };

  const removeLogo = async () => {
    try {
      await update(ref(database, `kresler/${kresId}`), { logoUrl: '', updatedAt: Date.now() });
      setLogoUrl('');
      message.success('Fotoğraf kaldırıldı');
    } catch {
      message.error('Fotoğraf kaldırılamadı.');
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>;

  return (
    <div>
      <div style={{ background: THEME.primary, borderRadius: 20, padding: '24px', textAlign: 'center', marginBottom: 20 }}>
        <div style={{ width: 84, height: 84, borderRadius: 42, background: 'rgba(255,255,255,0.16)', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {logoUrl ? <img src={logoUrl} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 36 }}>🏫</span>}
        </div>
        <Title level={3} style={{ color: '#fff', margin: 0 }}>Kurum Bilgileri</Title>
        <Text style={{ color: 'rgba(255,255,255,0.82)' }}>Bu bilgiler veli iletişim ekranına direkt düşer.</Text>
        <div style={{ marginTop: 10, display: 'flex', gap: 16, justifyContent: 'center' }}>
          <Upload showUploadList={false} beforeUpload={handleLogoUpload} accept="image/*">
            <Button type="link" loading={uploadingLogo} icon={<CameraOutlined />} style={{ color: '#fff', fontWeight: 700 }}>{logoUrl ? 'Fotoğrafı Değiştir' : 'Fotoğraf Ekle'}</Button>
          </Upload>
          {logoUrl && <Button type="link" icon={<DeleteOutlined />} onClick={removeLogo} style={{ color: '#FFD9DF', fontWeight: 700 }}>Kaldır</Button>}
        </div>
      </div>

      <Card style={{ marginBottom: 16, borderColor: THEME.border }}>
        <Text strong>⚖️ Yasal Bilgiler</Text>
        <Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 10 }}>Kullanım şartları, gizlilik politikası ve KVKK metinleri.</Paragraph>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Button block onClick={() => navigate('/yasal-belgeler?doc=terms')}>📄 Kullanım Şartları</Button>
          <Button block onClick={() => navigate('/yasal-belgeler?doc=privacy')}>🔐 Gizlilik Politikası</Button>
          <Button block onClick={() => navigate('/yasal-belgeler?doc=kvkk')}>🛡️ KVKK Metni</Button>
        </div>
      </Card>

      <FormField label="Kurum Adı" value={form.ad} onChange={(v) => setValue('ad', v)} placeholder="Yumurcak Kreş" />
      <FormField label="Adres" value={form.adres} onChange={(v) => setValue('adres', v)} placeholder="Mahalle, cadde, no..." multiline />
      <FormField label="Kurum Telefonu" value={form.telefon} onChange={(v) => setValue('telefon', v)} placeholder="05xx xxx xx xx" />
      <FormField label="E-posta" value={form.email} onChange={(v) => setValue('email', v)} placeholder="info@..." />
      <FormField label="Yönetici Adı" value={form.yoneticiAd} onChange={(v) => setValue('yoneticiAd', v)} placeholder="Yönetici adı soyadı" />
      <FormField label="Yönetici Telefonu" value={form.yoneticiTelefon} onChange={(v) => setValue('yoneticiTelefon', v)} placeholder="05xx xxx xx xx" />
      <FormField label="WhatsApp" value={form.whatsapp} onChange={(v) => setValue('whatsapp', v)} placeholder="05xx xxx xx xx" />
      <FormField label="Website" value={form.website} onChange={(v) => setValue('website', v)} placeholder="https://..." />
      <FormField label="Çalışma Saatleri" value={form.calismaSaatleri} onChange={(v) => setValue('calismaSaatleri', v)} placeholder="08:00 - 18:00" />
      <FormField label="Ek Not" value={form.not} onChange={(v) => setValue('not', v)} placeholder="Servis, kayıt, görüşme notu..." multiline />

      <Button type="primary" block loading={saving} onClick={save} style={{ height: 46, marginTop: 8 }}>Kurum Bilgilerini Kaydet</Button>
    </div>
  );
}

function FormField({ label, value, onChange, placeholder, multiline }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <Text strong style={{ display: 'block', marginBottom: 6 }}>{label}</Text>
      {multiline ? (
        <Input.TextArea rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </div>
  );
}
