// ============================================================
// YUMURCAK WEB PANEL — BulkOnboardingPage.jsx
// Giriş yapan yöneticinin kreşi için sınıf + öğretmen + veli +
// öğrenci yapısını kutucuklu, "+ ekle" ile büyüyen bir formdan
// tek seferde oluşturur (serbest metin yok).
//
// Yapı: her sınıf bir Collapse paneli. Panel içinde sınıf bilgisi
// (ad, yaş grubu, öğretmen) + öğrenci kartları listesi var. Her
// öğrenci kartında veli bilgisi de var. Veli kullanıcı adı alanı
// AutoComplete — formda daha önce girilen velileri önerir, böylece
// kardeş öğrenci eklerken aynı veliyi seçmen yeterli.
//
// "Kur"a basınca: aynı kullanıcı adına sahip öğretmen/veli DB'de
// zaten varsa yeniden hesap açmaz, mevcut hesabı bulup bağlar —
// sayfayı 2 kez çalıştırmak güvenlidir.
// ============================================================
import React, { useEffect, useMemo, useState } from 'react';
import {
  Typography,
  Card,
  Input,
  Select,
  AutoComplete,
  Button,
  message,
  Alert,
  Space,
  Tag,
  Divider,
  Collapse,
  Empty,
} from 'antd';
import { PlusOutlined, DeleteOutlined, RocketOutlined, UserAddOutlined } from '@ant-design/icons';
import { get, onValue, push, ref, update } from 'firebase/database';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { database } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme';
import { YAS_GRUPLARI } from '../constants';
import { generateId } from '../utils/crudHelpers';
import { normalizeUsername, usernameToEmail } from '../utils/authHelpers';
import { getSecondaryAuth, releaseSecondaryAuth } from '../utils/secondaryAuth';
import { normalizeChildBirthDate } from '../utils/childDates';
import { addUserIndexUpdates, addChildIndexUpdates, addClassIndexUpdates } from '../utils/firebaseIndexHelpers';

const { Title, Text, Paragraph } = Typography;

let localKeyCounter = 0;
function localKey() {
  localKeyCounter += 1;
  return `k${Date.now()}${localKeyCounter}`;
}

function bosOgrenci() {
  return { key: localKey(), ad: '', dogumTarihi: '', veliAd: '', veliKullaniciAdi: '' };
}

function bosSinif() {
  return {
    key: localKey(),
    ad: '',
    yasGrubu: undefined,
    ogretmenAd: '',
    ogretmenKullaniciAdi: '',
    ogrenciler: [bosOgrenci()],
  };
}

// Kullanıcı adı zaten varsa mevcut id'yi döner (yeni hesap açmaz).
async function bulOrOlusturKullanici({ ad, kullaniciAdi, rol, kresId, sifre, updates, index }) {
  const clean = normalizeUsername(kullaniciAdi);

  const mevcutSnap = await get(ref(database, `kullaniciAdiIndex/${clean}`));
  if (mevcutSnap.exists()) {
    return { id: mevcutSnap.val(), yeniMi: false };
  }
  if (index[clean]) {
    return { id: index[clean], yeniMi: false };
  }

  const email = usernameToEmail(clean);
  const secondaryAuth = getSecondaryAuth('yumurcak-bulk-onboarding');
  const credential = await createUserWithEmailAndPassword(secondaryAuth, email, sifre);
  const authUid = credential.user.uid;
  await signOut(secondaryAuth).catch(() => {});
  await releaseSecondaryAuth('yumurcak-bulk-onboarding');

  const userRef = push(ref(database, 'kullanicilar'));
  const id = userRef.key;
  const now = Date.now();

  const userRecord = {
    uid: id,
    id,
    authUid,
    email,
    authProvider: 'firebase',
    authCreatedAt: now,
    authUpdatedAt: now,
    kresId,
    ad,
    kullaniciAdi: clean,
    sifre,
    rol,
    aktif: true,
    createdAt: now,
    updatedAt: now,
  };

  updates[`kullanicilar/${id}`] = userRecord;
  updates[`authKullaniciIndex/${authUid}`] = id;
  addUserIndexUpdates(updates, id, userRecord);

  index[clean] = id;
  return { id, yeniMi: true };
}

export default function BulkOnboardingPage() {
  const { kullanici, kres } = useAuth();
  const kresId = kres?.id || kullanici?.kresId;

  const [siniflar, setSiniflar] = useState([bosSinif()]);
  const [aktifPanel, setAktifPanel] = useState([siniflar[0].key]);
  const [sifre, setSifre] = useState('123456');
  const [saving, setSaving] = useState(false);
  const [sonuc, setSonuc] = useState(null);
  const [mevcutOgrenciSayisi, setMevcutOgrenciSayisi] = useState(0);
  const [ogrenciLimiti, setOgrenciLimiti] = useState(null);

  useEffect(() => {
    if (!kresId) return;
    const abonelikUnsub = onValue(ref(database, `abonelikler/${kresId}`), (snap) => {
      const abonelik = snap.val();
      setOgrenciLimiti(abonelik?.ogrenciLimiti ? Number(abonelik.ogrenciLimiti) : null);
    });
    const cocukUnsub = onValue(ref(database, `kresCocuklari/${kresId}`), (snap) => {
      setMevcutOgrenciSayisi(snap.exists() ? Object.keys(snap.val()).length : 0);
    });
    return () => {
      abonelikUnsub();
      cocukUnsub();
    };
  }, [kresId]);

  // Formda şu ana kadar girilmiş tüm veliler (kardeş öğrenci için AutoComplete önerisi)
  const veliOnerileri = useMemo(() => {
    const map = new Map();
    siniflar.forEach((s) => {
      s.ogrenciler.forEach((o) => {
        const clean = (o.veliKullaniciAdi || '').trim();
        if (clean && o.veliAd) map.set(clean, o.veliAd);
      });
    });
    return Array.from(map.entries()).map(([kullaniciAdi, ad]) => ({ value: kullaniciAdi, label: `${ad} (${kullaniciAdi})` }));
  }, [siniflar]);

  const toplamOgrenci = useMemo(
    () => siniflar.reduce((t, s) => t + s.ogrenciler.filter((o) => o.ad.trim()).length, 0),
    [siniflar]
  );

  // --- sınıf/öğrenci state güncelleme yardımcıları ---
  const sinifEkle = () => {
    const yeni = bosSinif();
    setSiniflar((prev) => [...prev, yeni]);
    setAktifPanel((prev) => [...prev, yeni.key]);
  };

  const sinifSil = (sinifKey) => {
    setSiniflar((prev) => prev.filter((s) => s.key !== sinifKey));
  };

  const sinifAlanGuncelle = (sinifKey, alan, deger) => {
    setSiniflar((prev) => prev.map((s) => (s.key === sinifKey ? { ...s, [alan]: deger } : s)));
  };

  const ogrenciEkle = (sinifKey) => {
    setSiniflar((prev) =>
      prev.map((s) => (s.key === sinifKey ? { ...s, ogrenciler: [...s.ogrenciler, bosOgrenci()] } : s))
    );
  };

  const ogrenciSil = (sinifKey, ogrenciKey) => {
    setSiniflar((prev) =>
      prev.map((s) =>
        s.key === sinifKey ? { ...s, ogrenciler: s.ogrenciler.filter((o) => o.key !== ogrenciKey) } : s
      )
    );
  };

  const ogrenciAlanGuncelle = (sinifKey, ogrenciKey, alan, deger) => {
    setSiniflar((prev) =>
      prev.map((s) =>
        s.key === sinifKey
          ? {
              ...s,
              ogrenciler: s.ogrenciler.map((o) => (o.key === ogrenciKey ? { ...o, [alan]: deger } : o)),
            }
          : s
      )
    );
  };

  // Veli AutoComplete'ten seçilince adı otomatik doldur
  const veliSecildi = (sinifKey, ogrenciKey, kullaniciAdi) => {
    const oneri = veliOnerileri.find((v) => v.value === kullaniciAdi);
    ogrenciAlanGuncelle(sinifKey, ogrenciKey, 'veliKullaniciAdi', kullaniciAdi);
    if (oneri) {
      const ad = oneri.label.replace(` (${kullaniciAdi})`, '');
      ogrenciAlanGuncelle(sinifKey, ogrenciKey, 'veliAd', ad);
    }
  };

  const dogrula = () => {
    const hatalar = [];
    siniflar.forEach((s, si) => {
      if (!s.ad.trim()) hatalar.push(`${si + 1}. sınıf: sınıf adı boş.`);
      if (!s.yasGrubu) hatalar.push(`${s.ad || si + 1}. sınıf: yaş grubu seçilmedi.`);
      if ((s.ogretmenAd.trim() && !s.ogretmenKullaniciAdi.trim()) || (!s.ogretmenAd.trim() && s.ogretmenKullaniciAdi.trim())) {
        hatalar.push(`${s.ad || si + 1}. sınıf: öğretmen adı/kullanıcı adı birlikte doldurulmalı.`);
      }
      const dolular = s.ogrenciler.filter((o) => o.ad.trim() || o.veliAd.trim() || o.veliKullaniciAdi.trim());
      if (dolular.length === 0) hatalar.push(`${s.ad || si + 1}. sınıf: en az bir öğrenci girilmeli.`);
      dolular.forEach((o) => {
        if (!o.ad.trim()) hatalar.push(`${s.ad}: bir öğrencinin adı boş.`);
        if (!o.veliAd.trim() || !o.veliKullaniciAdi.trim()) {
          hatalar.push(`${s.ad} — ${o.ad || 'isimsiz öğrenci'}: veli adı/kullanıcı adı eksik.`);
        }
      });
    });
    return hatalar;
  };

  const olustur = async () => {
    if (!kresId) {
      message.error('Kreş bilgisi bulunamadı, lütfen tekrar giriş yapın.');
      return;
    }
    if (sifre.trim().length < 6) {
      message.error('Ortak şifre en az 6 karakter olmalı.');
      return;
    }
    const hatalar = dogrula();
    if (hatalar.length > 0) {
      message.error(hatalar[0]);
      return;
    }
    if (ogrenciLimiti != null && mevcutOgrenciSayisi + toplamOgrenci > ogrenciLimiti) {
      message.error(
        `Öğrenci limitiniz yetersiz: mevcut ${mevcutOgrenciSayisi} + eklenecek ${toplamOgrenci} = ${mevcutOgrenciSayisi + toplamOgrenci}, limit ${ogrenciLimiti}.`
      );
      return;
    }

    setSaving(true);
    const kullaniciIndex = {};
    const ozet = { siniflar: 0, ogretmenler: [], veliler: [], ogrenciler: 0, hatalar: [] };
    const now = Date.now();
    const sifreTemiz = sifre.trim();

    try {
      for (const sinifData of siniflar) {
        const gecerliOgrenciler = sinifData.ogrenciler.filter((o) => o.ad.trim());
        if (gecerliOgrenciler.length === 0) continue;

        try {
          const updates = {};

          const sinifRef = push(ref(database, 'siniflar'));
          const sinifId = sinifRef.key;
          const sinifRecord = {
            id: sinifId,
            ad: sinifData.ad.trim(),
            yasGrubu: sinifData.yasGrubu,
            ogretmenIds: [],
            kresId,
            createdAt: now,
            updatedAt: now,
          };

          if (sinifData.ogretmenAd.trim() && sinifData.ogretmenKullaniciAdi.trim()) {
            const { id: ogretmenId, yeniMi } = await bulOrOlusturKullanici({
              ad: sinifData.ogretmenAd.trim(),
              kullaniciAdi: sinifData.ogretmenKullaniciAdi.trim(),
              rol: 'ogretmen',
              kresId,
              sifre: sifreTemiz,
              updates,
              index: kullaniciIndex,
            });
            sinifRecord.ogretmenIds = [ogretmenId];
            ozet.ogretmenler.push({
              ad: sinifData.ogretmenAd.trim(),
              kullaniciAdi: normalizeUsername(sinifData.ogretmenKullaniciAdi),
              yeniMi,
            });
          }

          updates[`siniflar/${sinifId}`] = sinifRecord;
          addClassIndexUpdates(updates, sinifId, sinifRecord);

          for (const ogrenci of gecerliOgrenciler) {
            const { id: veliId, yeniMi } = await bulOrOlusturKullanici({
              ad: ogrenci.veliAd.trim(),
              kullaniciAdi: ogrenci.veliKullaniciAdi.trim(),
              rol: 'veli',
              kresId,
              sifre: sifreTemiz,
              updates,
              index: kullaniciIndex,
            });
            ozet.veliler.push({
              ad: ogrenci.veliAd.trim(),
              kullaniciAdi: normalizeUsername(ogrenci.veliKullaniciAdi),
              yeniMi,
            });

            const cocukId = generateId();
            const cocukRecord = {
              id: cocukId,
              ad: ogrenci.ad.trim(),
              dogumTarihi: ogrenci.dogumTarihi ? normalizeChildBirthDate(ogrenci.dogumTarihi) : '',
              sinifId,
              kresId,
              veliIds: [veliId],
              yeniBaslayan: true,
              uyumTakibiAktif: true,
              uyumBaslangicTarihi: new Date().toISOString().slice(0, 10),
              uyumSureGun: 30,
              uyumDurumu: 'aktif',
              createdAt: now,
              updatedAt: now,
            };

            updates[`cocuklar/${cocukId}`] = cocukRecord;
            addChildIndexUpdates(updates, cocukId, cocukRecord);
            ozet.ogrenciler += 1;
          }

          await update(ref(database), updates);
          ozet.siniflar += 1;
        } catch (err) {
          ozet.hatalar.push(`${sinifData.ad}: ${err?.code || err?.message || 'Bilinmeyen hata'}`);
        }
      }

      // Dedupe göstergesi için özet listelerini kullanıcı adına göre benzersizleştir
      ozet.ogretmenler = Array.from(new Map(ozet.ogretmenler.map((o) => [o.kullaniciAdi, o])).values());
      ozet.veliler = Array.from(new Map(ozet.veliler.map((v) => [v.kullaniciAdi, v])).values());
      setSonuc(ozet);
      message.success(`${ozet.siniflar} sınıf, ${ozet.ogrenciler} öğrenci oluşturuldu.`);
      setSiniflar([bosSinif()]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Toplu Kurulum</Title>
        <Text type="secondary">Sınıf ekle, içine öğretmen ve öğrenci/veli kartlarını doldur.</Text>
      </div>

      {ogrenciLimiti != null && (
        <Alert
          style={{ marginBottom: 16 }}
          type={mevcutOgrenciSayisi >= ogrenciLimiti ? 'error' : 'info'}
          showIcon
          message={`Öğrenci limiti: ${mevcutOgrenciSayisi} / ${ogrenciLimiti} (bu formla eklenecek: ${toplamOgrenci})`}
        />
      )}

      <Card style={{ marginBottom: 16 }}>
        <Text strong>Ortak Şifre</Text>
        <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
          Oluşturulacak tüm öğretmen ve veli hesapları bu şifreyle açılır.
        </Paragraph>
        <Input style={{ maxWidth: 280 }} value={sifre} onChange={(e) => setSifre(e.target.value)} placeholder="en az 6 karakter" />
      </Card>

      <Collapse
        activeKey={aktifPanel}
        onChange={setAktifPanel}
        style={{ marginBottom: 16 }}
        items={siniflar.map((sinifData) => ({
          key: sinifData.key,
          label: sinifData.ad ? `${sinifData.ad} — ${sinifData.ogrenciler.filter((o) => o.ad.trim()).length} öğrenci` : 'Yeni Sınıf',
          extra: (
            <Button
              danger
              type="text"
              size="small"
              icon={<DeleteOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                sinifSil(sinifData.key);
              }}
              disabled={siniflar.length === 1}
            />
          ),
          children: (
            <div>
              <Space wrap size="middle" style={{ marginBottom: 16 }}>
                <Input
                  placeholder="Sınıf Adı (örn: Kelebekler)"
                  style={{ width: 220 }}
                  value={sinifData.ad}
                  onChange={(e) => sinifAlanGuncelle(sinifData.key, 'ad', e.target.value)}
                />
                <Select
                  placeholder="Yaş Grubu"
                  style={{ width: 200 }}
                  value={sinifData.yasGrubu}
                  onChange={(v) => sinifAlanGuncelle(sinifData.key, 'yasGrubu', v)}
                  options={YAS_GRUPLARI.map((g) => ({ value: g.label, label: g.label }))}
                />
                <Input
                  placeholder="Öğretmen Adı (opsiyonel)"
                  style={{ width: 200 }}
                  value={sinifData.ogretmenAd}
                  onChange={(e) => sinifAlanGuncelle(sinifData.key, 'ogretmenAd', e.target.value)}
                />
                <Input
                  placeholder="Öğretmen Kullanıcı Adı"
                  style={{ width: 200 }}
                  value={sinifData.ogretmenKullaniciAdi}
                  onChange={(e) => sinifAlanGuncelle(sinifData.key, 'ogretmenKullaniciAdi', e.target.value)}
                />
              </Space>

              <Divider orientation="left" plain style={{ margin: '8px 0 12px' }}>Öğrenciler</Divider>

              <Space direction="vertical" style={{ width: '100%' }} size="small">
                {sinifData.ogrenciler.map((ogrenci) => (
                  <Card key={ogrenci.key} size="small" style={{ background: '#FAFAFA' }}>
                    <Space wrap size="middle" align="start">
                      <Input
                        placeholder="Öğrenci Adı"
                        style={{ width: 180 }}
                        value={ogrenci.ad}
                        onChange={(e) => ogrenciAlanGuncelle(sinifData.key, ogrenci.key, 'ad', e.target.value)}
                      />
                      <Input
                        placeholder="Doğum Tarihi (15.05.2022)"
                        style={{ width: 170 }}
                        value={ogrenci.dogumTarihi}
                        onChange={(e) => ogrenciAlanGuncelle(sinifData.key, ogrenci.key, 'dogumTarihi', e.target.value)}
                      />
                      <Input
                        placeholder="Veli Adı"
                        style={{ width: 170 }}
                        value={ogrenci.veliAd}
                        onChange={(e) => ogrenciAlanGuncelle(sinifData.key, ogrenci.key, 'veliAd', e.target.value)}
                      />
                      <AutoComplete
                        placeholder="Veli Kullanıcı Adı"
                        style={{ width: 190 }}
                        value={ogrenci.veliKullaniciAdi}
                        options={veliOnerileri}
                        onChange={(v) => ogrenciAlanGuncelle(sinifData.key, ogrenci.key, 'veliKullaniciAdi', v)}
                        onSelect={(v) => veliSecildi(sinifData.key, ogrenci.key, v)}
                        filterOption={(input, option) => (option?.label || '').toLowerCase().includes(input.toLowerCase())}
                      />
                      <Button
                        danger
                        type="text"
                        icon={<DeleteOutlined />}
                        onClick={() => ogrenciSil(sinifData.key, ogrenci.key)}
                        disabled={sinifData.ogrenciler.length === 1}
                      />
                    </Space>
                  </Card>
                ))}
              </Space>

              <Button
                style={{ marginTop: 12 }}
                icon={<UserAddOutlined />}
                onClick={() => ogrenciEkle(sinifData.key)}
              >
                + Öğrenci Ekle
              </Button>
            </div>
          ),
        }))}
      />

      <Button icon={<PlusOutlined />} onClick={sinifEkle} style={{ marginBottom: 24 }}>
        + Yeni Sınıf
      </Button>

      <br />

      <Button type="primary" size="large" icon={<RocketOutlined />} loading={saving} onClick={olustur}>
        Kur ({toplamOgrenci} öğrenci)
      </Button>

      {sonuc && (
        <Card style={{ marginTop: 16 }} title="Sonuç">
          <Paragraph>✅ {sonuc.siniflar} sınıf, {sonuc.ogrenciler} öğrenci oluşturuldu.</Paragraph>

          {sonuc.ogretmenler.length > 0 && (
            <>
              <Divider orientation="left" plain>Öğretmenler</Divider>
              <Space direction="vertical">
                {sonuc.ogretmenler.map((o, i) => (
                  <Text key={i}>
                    <Tag color={o.yeniMi ? THEME.green : 'default'}>{o.yeniMi ? 'Yeni' : 'Mevcut'}</Tag>
                    {o.kullaniciAdi} / {sifre}
                  </Text>
                ))}
              </Space>
            </>
          )}

          {sonuc.veliler.length > 0 && (
            <>
              <Divider orientation="left" plain>Veliler</Divider>
              <Space direction="vertical">
                {sonuc.veliler.map((v, i) => (
                  <Text key={i}>
                    <Tag color={v.yeniMi ? THEME.green : 'default'}>{v.yeniMi ? 'Yeni' : 'Mevcut'}</Tag>
                    {v.kullaniciAdi} / {sifre}
                  </Text>
                ))}
              </Space>
            </>
          )}

          {sonuc.hatalar.length > 0 && (
            <>
              <Divider orientation="left" plain>Hatalar</Divider>
              <Space direction="vertical">
                {sonuc.hatalar.map((h, i) => (
                  <Text key={i} type="danger">❌ {h}</Text>
                ))}
              </Space>
            </>
          )}

          <Paragraph type="secondary" style={{ marginTop: 12, fontSize: 12 }}>
            "Yeni" = az önce açılan hesap. "Mevcut" = zaten var olan hesaba bağlandı (ör. kardeş öğrenci, aynı öğretmen).
          </Paragraph>
        </Card>
      )}

      {siniflar.length === 0 && <Empty description="Henüz sınıf eklenmedi" />}
    </div>
  );
}
