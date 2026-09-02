// ============================================================
// YUMURCAK WEB PANEL — BulkOnboardingPage.jsx
// Giriş yapan yöneticinin kreşi için sınıf + öğretmen + veli +
// öğrenci yapısını tek metin bloğundan, tek seferde oluşturur.
//
// FORMAT:
// SINIF: Kelebekler | 3-4 Yaş | ogretmen: Ayşe Yılmaz, ayseyilmaz
// Ali Veli | 2022-03-01 | veli: Fatma Veli, fatmaveli
// Zeynep Kaya | 2021-11-15 | veli: Mehmet Kaya, mehmetkaya
//
// SINIF: Arılar | 4-5 Yaş | ogretmen: Elif Demir, elifdemir
// Can Demir | 2022-07-20 | veli: Ayşe Demir, ayseldemir
//
// Kural: "SINIF:" ile başlayan satır yeni sınıf açar. Sonraki her
// satır (yeni SINIF: gelene kadar) o sınıfın öğrencisidir. Aynı
// kullanıcı adına sahip öğretmen/veli tekrar geçerse (kardeş
// öğrenci, aynı öğretmen 2 sınıfta) yeniden hesap açılmaz, mevcut
// hesap bulunup bağlanır — sayfayı 2 kez çalıştırmak güvenlidir.
//
// Mobildeki SuperAdminKresBulkOnboardingScreen.js ile aynı mantık;
// tek fark kresId burada zaten giriş yapmış yöneticiden geliyor
// (kres kendisi mobil superadmin akışıyla önceden oluşturulmuş
// olmalı), ve abonelik öğrenci limiti burada kontrol ediliyor
// (mobildeki ChildrenPage.jsx / ChildFormScreen.js'teki aynı kural).
// ============================================================
import React, { useEffect, useState } from 'react';
import { Typography, Card, Input, Button, message, Alert, Space, Tag, Divider } from 'antd';
import { RocketOutlined, EyeOutlined } from '@ant-design/icons';
import { get, onValue, push, ref, update } from 'firebase/database';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { database } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme';
import { generateId } from '../utils/crudHelpers';
import { normalizeUsername, usernameToEmail } from '../utils/authHelpers';
import { getSecondaryAuth, releaseSecondaryAuth } from '../utils/secondaryAuth';
import { addUserIndexUpdates, addChildIndexUpdates, addClassIndexUpdates } from '../utils/firebaseIndexHelpers';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const ORNEK_METIN =
  'SINIF: Kelebekler | 3-4 Yaş | ogretmen: Ayşe Yılmaz, ayseyilmaz\n' +
  'Ali Veli | 2022-03-01 | veli: Fatma Veli, fatmaveli\n' +
  'Zeynep Kaya | 2021-11-15 | veli: Mehmet Kaya, mehmetkaya\n\n' +
  'SINIF: Arılar | 4-5 Yaş | ogretmen: Elif Demir, elifdemir\n' +
  'Can Demir | 2022-07-20 | veli: Ayşe Demir, ayseldemir';

// ------------------------------------------------------------
// PARSE (mobil ekranla birebir aynı)
// ------------------------------------------------------------
function parseKisi(parca) {
  if (!parca) return null;
  const [, veri] = parca.split(':');
  if (!veri) return null;
  const [ad, kullaniciAdi] = veri.split(',').map((x) => (x || '').trim());
  if (!ad || !kullaniciAdi) return null;
  return { ad, kullaniciAdi };
}

export function parseYapi(metin) {
  const satirlar = String(metin || '').split('\n');
  const siniflar = [];
  let mevcutSinif = null;
  const hatalar = [];

  satirlar.forEach((ham, index) => {
    const satir = ham.trim();
    if (!satir) return;

    if (satir.toUpperCase().startsWith('SINIF:')) {
      const govde = satir.slice(satir.indexOf(':') + 1).trim();
      const parcalar = govde.split('|').map((p) => p.trim());
      const ad = parcalar[0] || '';
      const yasGrubu = parcalar[1] && !/^ogretmen:|^öğretmen:/i.test(parcalar[1]) ? parcalar[1] : '';
      const ogretmenParca = parcalar.find((p) => /^ogretmen:|^öğretmen:/i.test(p));
      const ogretmen = parseKisi(ogretmenParca);

      if (!ad) {
        hatalar.push(`Satır ${index + 1}: sınıf adı boş.`);
        return;
      }

      mevcutSinif = { ad, yasGrubu: yasGrubu || 'Karışık', ogretmen, ogrenciler: [] };
      siniflar.push(mevcutSinif);
      return;
    }

    if (!mevcutSinif) {
      hatalar.push(`Satır ${index + 1}: önce "SINIF:" satırı gelmeli, bu satır atlandı.`);
      return;
    }

    const parcalar = satir.split('|').map((p) => p.trim());
    const ad = parcalar[0] || '';
    const dogumTarihi = parcalar[1] && !/^veli:/i.test(parcalar[1]) ? parcalar[1] : '';
    const veliParca = parcalar.find((p) => /^veli:/i.test(p));
    const veli = parseKisi(veliParca);

    if (!ad) {
      hatalar.push(`Satır ${index + 1}: öğrenci adı boş.`);
      return;
    }
    if (!veli) {
      hatalar.push(`Satır ${index + 1}: "${ad}" için veli bilgisi eksik/hatalı (Ad, kullanici_adi bekleniyor).`);
      return;
    }

    mevcutSinif.ogrenciler.push({ ad, dogumTarihi, veli });
  });

  return { siniflar, hatalar };
}

// Kullanıcı adı zaten varsa mevcut id'yi döner (yeni hesap açmaz).
// Yoksa web'e özel secondary-app deseniyle Auth + kullanicilar kaydı açar.
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

  const [metin, setMetin] = useState('');
  const [sifre, setSifre] = useState('123456');
  const [saving, setSaving] = useState(false);
  const [onizleme, setOnizleme] = useState(null);
  const [sonuc, setSonuc] = useState(null);
  const [mevcutOgrenciSayisi, setMevcutOgrenciSayisi] = useState(0);
  const [ogrenciLimiti, setOgrenciLimiti] = useState(null);

  // Abonelik öğrenci limiti + mevcut öğrenci sayısı — ChildrenPage.jsx ile aynı kontrol
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

  const onizle = () => {
    const { siniflar, hatalar } = parseYapi(metin);
    const toplamOgrenci = siniflar.reduce((t, s) => t + s.ogrenciler.length, 0);
    setOnizleme({ siniflar, hatalar, toplamOgrenci });
    setSonuc(null);
  };

  const olustur = async () => {
    if (!kresId) {
      message.error('Kreş bilgisi bulunamadı, lütfen tekrar giriş yapın.');
      return;
    }
    const { siniflar, hatalar } = parseYapi(metin);
    if (siniflar.length === 0) {
      message.error('En az bir SINIF bloğu girin.');
      return;
    }
    if (sifre.trim().length < 6) {
      message.error('Ortak şifre en az 6 karakter olmalı.');
      return;
    }

    const toplamOgrenci = siniflar.reduce((t, s) => t + s.ogrenciler.length, 0);
    if (ogrenciLimiti != null && mevcutOgrenciSayisi + toplamOgrenci > ogrenciLimiti) {
      message.error(
        `Öğrenci limitiniz yetersiz: mevcut ${mevcutOgrenciSayisi} + eklenecek ${toplamOgrenci} = ${mevcutOgrenciSayisi + toplamOgrenci}, limit ${ogrenciLimiti}. Abonelik / paket yükseltmeniz gerekiyor.`
      );
      return;
    }

    setSaving(true);
    const kullaniciIndex = {};
    const ozet = { siniflar: 0, ogretmenler: [], veliler: [], ogrenciler: 0, hatalar: [...hatalar] };
    const now = Date.now();
    const sifreTemiz = sifre.trim();

    try {
      for (const sinifData of siniflar) {
        try {
          const updates = {};

          // 1) Sınıf
          const sinifRef = push(ref(database, 'siniflar'));
          const sinifId = sinifRef.key;
          const sinifRecord = {
            id: sinifId,
            ad: sinifData.ad,
            yasGrubu: sinifData.yasGrubu,
            ogretmenIds: [],
            kresId,
            createdAt: now,
            updatedAt: now,
          };

          // 2) Öğretmen (varsa)
          if (sinifData.ogretmen) {
            const { id: ogretmenId, yeniMi } = await bulOrOlusturKullanici({
              ad: sinifData.ogretmen.ad,
              kullaniciAdi: sinifData.ogretmen.kullaniciAdi,
              rol: 'ogretmen',
              kresId,
              sifre: sifreTemiz,
              updates,
              index: kullaniciIndex,
            });
            sinifRecord.ogretmenIds = [ogretmenId];
            ozet.ogretmenler.push({
              ad: sinifData.ogretmen.ad,
              kullaniciAdi: normalizeUsername(sinifData.ogretmen.kullaniciAdi),
              yeniMi,
            });
          }

          updates[`siniflar/${sinifId}`] = sinifRecord;
          addClassIndexUpdates(updates, sinifId, sinifRecord);

          // 3) Her öğrenci: veli + çocuk
          for (const ogrenci of sinifData.ogrenciler) {
            const { id: veliId, yeniMi } = await bulOrOlusturKullanici({
              ad: ogrenci.veli.ad,
              kullaniciAdi: ogrenci.veli.kullaniciAdi,
              rol: 'veli',
              kresId,
              sifre: sifreTemiz,
              updates,
              index: kullaniciIndex,
            });
            ozet.veliler.push({
              ad: ogrenci.veli.ad,
              kullaniciAdi: normalizeUsername(ogrenci.veli.kullaniciAdi),
              yeniMi,
            });

            const cocukId = generateId();
            const cocukRecord = {
              id: cocukId,
              ad: ogrenci.ad,
              dogumTarihi: ogrenci.dogumTarihi || '',
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

      setSonuc(ozet);
      message.success(`${ozet.siniflar} sınıf, ${ozet.ogrenciler} öğrenci oluşturuldu.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Toplu Kurulum</Title>
        <Text type="secondary">Sınıf, öğretmen, veli ve öğrencileri tek metinden oluşturun.</Text>
      </div>

      {ogrenciLimiti != null && (
        <Alert
          style={{ marginBottom: 16 }}
          type={mevcutOgrenciSayisi >= ogrenciLimiti ? 'error' : 'info'}
          showIcon
          message={`Öğrenci limiti: ${mevcutOgrenciSayisi} / ${ogrenciLimiti}`}
        />
      )}

      <Card style={{ marginBottom: 16 }}>
        <Text strong>Ortak Şifre</Text>
        <Input
          style={{ marginTop: 8, maxWidth: 280 }}
          value={sifre}
          onChange={(e) => setSifre(e.target.value)}
          placeholder="en az 6 karakter"
        />
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Text strong>Sınıf / Öğretmen / Öğrenci / Veli Yapısı</Text>
        <Paragraph type="secondary" style={{ marginTop: 4, fontSize: 13 }}>
          Her sınıf <Text code>SINIF:</Text> ile başlar, altındaki satırlar o sınıfın öğrencileridir.
        </Paragraph>
        <TextArea
          value={metin}
          onChange={(e) => setMetin(e.target.value)}
          placeholder={ORNEK_METIN}
          autoSize={{ minRows: 10, maxRows: 20 }}
          style={{ fontFamily: 'monospace', fontSize: 13 }}
        />
        <Button style={{ marginTop: 10 }} icon={<EyeOutlined />} onClick={onizle}>
          Önizle
        </Button>
      </Card>

      {onizleme && (
        <Card style={{ marginBottom: 16 }} title={`Önizleme — ${onizleme.siniflar.length} sınıf, ${onizleme.toplamOgrenci} öğrenci`}>
          {onizleme.siniflar.map((s, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <Text strong>
                {s.ad} ({s.yasGrubu}) {s.ogretmen ? `— Öğretmen: ${s.ogretmen.ad}` : '— öğretmen yok'}
              </Text>
              <div style={{ marginLeft: 12 }}>
                {s.ogrenciler.map((o, j) => (
                  <div key={j}>
                    <Text type="secondary">· {o.ad} — Veli: {o.veli.ad}</Text>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {onizleme.hatalar.length > 0 && (
            <Alert
              type="warning"
              showIcon
              message={`${onizleme.hatalar.length} satır atlanacak`}
              description={<Space direction="vertical">{onizleme.hatalar.map((h, i) => <Text key={i}>{h}</Text>)}</Space>}
            />
          )}
        </Card>
      )}

      <Button type="primary" size="large" icon={<RocketOutlined />} loading={saving} onClick={olustur}>
        Kur
      </Button>

      {sonuc && (
        <Card style={{ marginTop: 16 }} title="Sonuç">
          <Paragraph>
            ✅ {sonuc.siniflar} sınıf, {sonuc.ogrenciler} öğrenci oluşturuldu.
          </Paragraph>

          <Divider orientation="left" plain>Öğretmenler</Divider>
          <Space direction="vertical">
            {sonuc.ogretmenler.map((o, i) => (
              <Text key={i}>
                <Tag color={o.yeniMi ? THEME.green : 'default'}>{o.yeniMi ? 'Yeni' : 'Mevcut'}</Tag>
                {o.kullaniciAdi} / {sifre}
              </Text>
            ))}
          </Space>

          <Divider orientation="left" plain>Veliler</Divider>
          <Space direction="vertical">
            {sonuc.veliler.map((v, i) => (
              <Text key={i}>
                <Tag color={v.yeniMi ? THEME.green : 'default'}>{v.yeniMi ? 'Yeni' : 'Mevcut'}</Tag>
                {v.kullaniciAdi} / {sifre}
              </Text>
            ))}
          </Space>

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
    </div>
  );
}
