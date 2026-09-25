import React, { useEffect, useMemo, useState } from 'react';
import { Alert, AutoComplete, Button, Card, Collapse, Divider, Empty, Input, Select, Space, Tag, Typography, message } from 'antd';
import { DeleteOutlined, PlusOutlined, RocketOutlined, UserAddOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { get, onValue, push, ref, update } from 'firebase/database';
import { useSearchParams } from 'react-router-dom';
import { database } from '../src/config/firebase';
import { getPlatformSnapshot } from './superadminService';
import { formatInstitutionLocation } from './locationData';
import { getSecondaryAuth, releaseSecondaryAuth } from '../src/utils/secondaryAuth';
import { normalizeUsername, usernameToEmail } from '../src/utils/authHelpers';
import { generateId } from '../src/utils/crudHelpers';
import { normalizeChildBirthDate } from '../src/utils/childDates';
import { addUserIndexUpdates, addChildIndexUpdates, addClassIndexUpdates } from '../src/utils/firebaseIndexHelpers';
import { YAS_GRUPLARI } from '../src/constants';

const { Title, Text, Paragraph } = Typography;
let localKeyCounter = 0;
const localKey = () => `k${Date.now()}${++localKeyCounter}`;
const bosOgrenci = () => ({ key: localKey(), ad: '', dogumTarihi: '', veliAd: '', veliKullaniciAdi: '' });
const bosSinif = () => ({ key: localKey(), ad: '', yasGrubu: undefined, ogretmenAd: '', ogretmenKullaniciAdi: '', ogrenciler: [bosOgrenci()] });

async function bulOrOlusturKullanici({ ad, kullaniciAdi, rol, kresId, sifre, updates, index }) {
  const clean = normalizeUsername(kullaniciAdi);
  const existing = await get(ref(database, `kullaniciAdiIndex/${clean}`));
  if (existing.exists()) return { id: existing.val(), yeniMi: false };
  if (index[clean]) return { id: index[clean], yeniMi: false };

  const secondaryAuth = getSecondaryAuth('yumurcak-superadmin-bulk-onboarding');
  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, usernameToEmail(clean), sifre);
    const authUid = credential.user.uid;
    await signOut(secondaryAuth).catch(() => {});
    const userRef = push(ref(database, 'kullanicilar'));
    const id = userRef.key;
    const now = Date.now();
    const userRecord = { uid: id, id, authUid, email: usernameToEmail(clean), authProvider: 'firebase', authCreatedAt: now, authUpdatedAt: now, kresId, ad, kullaniciAdi: clean, sifre, rol, aktif: true, createdAt: now, updatedAt: now };
    updates[`kullanicilar/${id}`] = userRecord;
    updates[`authKullaniciIndex/${authUid}`] = id;
    addUserIndexUpdates(updates, id, userRecord);
    index[clean] = id;
    return { id, yeniMi: true };
  } finally {
    await releaseSecondaryAuth('yumurcak-superadmin-bulk-onboarding');
  }
}

export default function SuperAdminBulkOnboarding() {
  const [searchParams] = useSearchParams();
  const presetKresId = searchParams.get('kresId') || '';
  const [snapshot, setSnapshot] = useState(null);
  const [kresId, setKresId] = useState(presetKresId);
  const [siniflar, setSiniflar] = useState([bosSinif()]);
  const [aktifPanel, setAktifPanel] = useState([]);
  const [sifre, setSifre] = useState('123456');
  const [saving, setSaving] = useState(false);
  const [sonuc, setSonuc] = useState(null);
  const [mevcutOgrenciSayisi, setMevcutOgrenciSayisi] = useState(0);
  const [ogrenciLimiti, setOgrenciLimiti] = useState(null);

  useEffect(() => {
    getPlatformSnapshot().then(setSnapshot).catch((e) => message.error(e?.message || 'Kreşler alınamadı.'));
  }, []);

  useEffect(() => {
    if (!presetKresId) return;
    setKresId(presetKresId);
  }, [presetKresId]);

  useEffect(() => {
    if (!kresId) { setMevcutOgrenciSayisi(0); setOgrenciLimiti(null); return undefined; }
    const unsubLimit = onValue(ref(database, `abonelikler/${kresId}`), (snap) => {
      const a = snap.val();
      setOgrenciLimiti(a?.ogrenciLimiti ? Number(a.ogrenciLimiti) : null);
    });
    const unsubChildren = onValue(ref(database, `kresCocuklari/${kresId}`), (snap) => setMevcutOgrenciSayisi(snap.exists() ? Object.keys(snap.val()).length : 0));
    return () => { unsubLimit(); unsubChildren(); };
  }, [kresId]);

  const institutions = snapshot?.institutions || [];
  const selectedInstitution = institutions.find((x) => x.id === kresId);
  const veliOnerileri = useMemo(() => {
    const map = new Map();
    siniflar.forEach((s) => s.ogrenciler.forEach((o) => {
      const username = (o.veliKullaniciAdi || '').trim();
      if (username && o.veliAd) map.set(username, o.veliAd);
    }));
    return [...map.entries()].map(([value, ad]) => ({ value, label: `${ad} (${value})` }));
  }, [siniflar]);
  const toplamOgrenci = useMemo(() => siniflar.reduce((t, s) => t + s.ogrenciler.filter((o) => o.ad.trim()).length, 0), [siniflar]);

  const sinifEkle = () => { const s = bosSinif(); setSiniflar((p) => [...p, s]); setAktifPanel((p) => [...p, s.key]); };
  const sinifSil = (key) => setSiniflar((p) => p.filter((s) => s.key !== key));
  const sinifAlanGuncelle = (key, alan, value) => setSiniflar((p) => p.map((s) => s.key === key ? { ...s, [alan]: value } : s));
  const ogrenciEkle = (key) => setSiniflar((p) => p.map((s) => s.key === key ? { ...s, ogrenciler: [...s.ogrenciler, bosOgrenci()] } : s));
  const ogrenciSil = (skey, okey) => setSiniflar((p) => p.map((s) => s.key === skey ? { ...s, ogrenciler: s.ogrenciler.filter((o) => o.key !== okey) } : s));
  const ogrenciAlanGuncelle = (skey, okey, alan, value) => setSiniflar((p) => p.map((s) => s.key === skey ? { ...s, ogrenciler: s.ogrenciler.map((o) => o.key === okey ? { ...o, [alan]: value } : o) } : s));
  const veliSecildi = (skey, okey, value) => {
    const found = veliOnerileri.find((x) => x.value === value);
    ogrenciAlanGuncelle(skey, okey, 'veliKullaniciAdi', value);
    if (found) ogrenciAlanGuncelle(skey, okey, 'veliAd', found.label.replace(` (${value})`, ''));
  };

  const dogrula = () => {
    const errors = [];
    if (!kresId) errors.push('Önce bir kreş seçin.');
    siniflar.forEach((s, i) => {
      if (!s.ad.trim()) errors.push(`${i + 1}. sınıf: sınıf adı boş.`);
      if (!s.yasGrubu) errors.push(`${s.ad || i + 1}. sınıf: yaş grubu seçilmedi.`);
      if ((s.ogretmenAd.trim() && !s.ogretmenKullaniciAdi.trim()) || (!s.ogretmenAd.trim() && s.ogretmenKullaniciAdi.trim())) errors.push(`${s.ad || i + 1}. sınıf: öğretmen adı/kullanıcı adı birlikte doldurulmalı.`);
      const filled = s.ogrenciler.filter((o) => o.ad.trim() || o.veliAd.trim() || o.veliKullaniciAdi.trim());
      if (!filled.length) errors.push(`${s.ad || i + 1}. sınıf: en az bir öğrenci girilmeli.`);
      filled.forEach((o) => {
        if (!o.ad.trim()) errors.push(`${s.ad}: bir öğrencinin adı boş.`);
        if (!o.veliAd.trim() || !o.veliKullaniciAdi.trim()) errors.push(`${s.ad} — ${o.ad || 'isimsiz öğrenci'}: veli adı/kullanıcı adı eksik.`);
      });
    });
    return errors;
  };

  const kurulumuTamamla = async () => {
    if (!kresId) { message.error('Önce bir kreş seçin.'); return; }
    if (sifre.trim().length < 6) { message.error('Ortak şifre en az 6 karakter olmalı.'); return; }
    setSaving(true);
    const index = {};
    const ozet = { siniflar: 0, ogretmenler: [], veliler: [], ogrenciler: 0, hatalar: [] };
    const now = Date.now();
    try {
      for (const sinifData of siniflar) {
        const className = sinifData.ad.trim();
        if (!className || !sinifData.yasGrubu) {
          if (className || sinifData.yasGrubu) ozet.hatalar.push(`${className || 'İsimsiz sınıf'}: sınıf adı ve yaş grubu birlikte gerekli; bu sınıf atlandı.`);
          continue;
        }
        const completeStudents = sinifData.ogrenciler.filter((o) => o.ad.trim() && o.veliAd.trim() && o.veliKullaniciAdi.trim());
        const incompleteStudents = sinifData.ogrenciler.filter((o) => o.ad.trim() || o.veliAd.trim() || o.veliKullaniciAdi.trim()).filter((o) => !(o.ad.trim() && o.veliAd.trim() && o.veliKullaniciAdi.trim()));
        incompleteStudents.forEach((o) => ozet.hatalar.push(`${className} — ${o.ad || 'isimsiz öğrenci'}: öğrenci + veli bilgileri eksik, atlandı.`));
        try {
          const updates = {};
          const sinifId = push(ref(database, 'siniflar')).key;
          const sinifRecord = { id: sinifId, ad: className, yasGrubu: sinifData.yasGrubu, ogretmenIds: [], kresId, createdAt: now, updatedAt: now };
          const teacherName = sinifData.ogretmenAd.trim();
          const teacherUsername = sinifData.ogretmenKullaniciAdi.trim();
          if (teacherName && teacherUsername) {
            const t = await bulOrOlusturKullanici({ ad: teacherName, kullaniciAdi: teacherUsername, rol: 'ogretmen', kresId, sifre: sifre.trim(), updates, index });
            sinifRecord.ogretmenIds = [t.id];
            ozet.ogretmenler.push({ ad: teacherName, kullaniciAdi: normalizeUsername(teacherUsername), yeniMi: t.yeniMi });
          } else if (teacherName || teacherUsername) {
            ozet.hatalar.push(`${className}: öğretmen adı ve kullanıcı adı birlikte gerekli; öğretmen atlandı.`);
          }
          updates[`siniflar/${sinifId}`] = sinifRecord;
          addClassIndexUpdates(updates, sinifId, sinifRecord);
          for (const student of completeStudents) {
            const parent = await bulOrOlusturKullanici({ ad: student.veliAd.trim(), kullaniciAdi: student.veliKullaniciAdi.trim(), rol: 'veli', kresId, sifre: sifre.trim(), updates, index });
            ozet.veliler.push({ ad: student.veliAd.trim(), kullaniciAdi: normalizeUsername(student.veliKullaniciAdi), yeniMi: parent.yeniMi });
            const childId = generateId();
            const child = { id: childId, ad: student.ad.trim(), dogumTarihi: student.dogumTarihi ? normalizeChildBirthDate(student.dogumTarihi) : '', sinifId, kresId, veliIds: [parent.id], yeniBaslayan: true, uyumTakibiAktif: true, uyumBaslangicTarihi: new Date().toISOString().slice(0, 10), uyumSureGun: 30, uyumDurumu: 'aktif', createdAt: now, updatedAt: now };
            updates[`cocuklar/${childId}`] = child;
            addChildIndexUpdates(updates, childId, child);
            ozet.ogrenciler += 1;
          }
          await update(ref(database), updates);
          ozet.siniflar += 1;
        } catch (e) { ozet.hatalar.push(`${className}: ${e?.code || e?.message || 'Bilinmeyen hata'}`); }
      }
      ozet.ogretmenler = [...new Map(ozet.ogretmenler.map((x) => [x.kullaniciAdi, x])).values()];
      ozet.veliler = [...new Map(ozet.veliler.map((x) => [x.kullaniciAdi, x])).values()];
      setSonuc(ozet);
      if (ozet.siniflar || ozet.ogretmenler.length || ozet.veliler.length) message.success('Kurulumdaki doldurulmuş bilgiler işlendi. Eksik alanlar atlandı; PDF alabilirsin.');
      else message.info('Tamamlanabilir bir kayıt bulunamadı. En az bir sınıf adı + yaş grubu girin.');
    } finally { setSaving(false); }
  };

  const olustur = async () => {
    const errors = dogrula();
    if (errors.length) { message.error(errors[0]); return; }
    if (sifre.trim().length < 6) { message.error('Ortak şifre en az 6 karakter olmalı.'); return; }
    if (ogrenciLimiti != null && mevcutOgrenciSayisi + toplamOgrenci > ogrenciLimiti) { message.error(`Öğrenci limiti yetersiz: ${mevcutOgrenciSayisi} + ${toplamOgrenci} > ${ogrenciLimiti}.`); return; }

    setSaving(true);
    const index = {};
    const ozet = { siniflar: 0, ogretmenler: [], veliler: [], ogrenciler: 0, hatalar: [] };
    const now = Date.now();
    try {
      for (const sinifData of siniflar) {
        const students = sinifData.ogrenciler.filter((o) => o.ad.trim());
        if (!students.length) continue;
        try {
          const updates = {};
          const sinifId = push(ref(database, 'siniflar')).key;
          const sinifRecord = { id: sinifId, ad: sinifData.ad.trim(), yasGrubu: sinifData.yasGrubu, ogretmenIds: [], kresId, createdAt: now, updatedAt: now };
          if (sinifData.ogretmenAd.trim() && sinifData.ogretmenKullaniciAdi.trim()) {
            const t = await bulOrOlusturKullanici({ ad: sinifData.ogretmenAd.trim(), kullaniciAdi: sinifData.ogretmenKullaniciAdi.trim(), rol: 'ogretmen', kresId, sifre: sifre.trim(), updates, index });
            sinifRecord.ogretmenIds = [t.id];
            ozet.ogretmenler.push({ ad: sinifData.ogretmenAd.trim(), kullaniciAdi: normalizeUsername(sinifData.ogretmenKullaniciAdi), yeniMi: t.yeniMi });
          }
          updates[`siniflar/${sinifId}`] = sinifRecord;
          addClassIndexUpdates(updates, sinifId, sinifRecord);
          for (const student of students) {
            const parent = await bulOrOlusturKullanici({ ad: student.veliAd.trim(), kullaniciAdi: student.veliKullaniciAdi.trim(), rol: 'veli', kresId, sifre: sifre.trim(), updates, index });
            ozet.veliler.push({ ad: student.veliAd.trim(), kullaniciAdi: normalizeUsername(student.veliKullaniciAdi), yeniMi: parent.yeniMi });
            const childId = generateId();
            const child = { id: childId, ad: student.ad.trim(), dogumTarihi: student.dogumTarihi ? normalizeChildBirthDate(student.dogumTarihi) : '', sinifId, kresId, veliIds: [parent.id], yeniBaslayan: true, uyumTakibiAktif: true, uyumBaslangicTarihi: new Date().toISOString().slice(0, 10), uyumSureGun: 30, uyumDurumu: 'aktif', createdAt: now, updatedAt: now };
            updates[`cocuklar/${childId}`] = child;
            addChildIndexUpdates(updates, childId, child);
            ozet.ogrenciler += 1;
          }
          await update(ref(database), updates);
          ozet.siniflar += 1;
        } catch (e) { ozet.hatalar.push(`${sinifData.ad}: ${e?.code || e?.message || 'Bilinmeyen hata'}`); }
      }
      ozet.ogretmenler = [...new Map(ozet.ogretmenler.map((x) => [x.kullaniciAdi, x])).values()];
      ozet.veliler = [...new Map(ozet.veliler.map((x) => [x.kullaniciAdi, x])).values()];
      setSonuc(ozet);
      message.success(`${ozet.siniflar} sınıf, ${ozet.ogrenciler} öğrenci oluşturuldu.`);
      setSiniflar([bosSinif()]);
    } finally { setSaving(false); }
  };

  return <div style={{ maxWidth: 1400, margin: '0 auto' }}>
    <div style={{ marginBottom: 18 }}><Title level={2} style={{ margin: 0 }}>Toplu Kurulum</Title><Text type="secondary">SuperAdmin olarak seçtiğin kreş için sınıf, öğretmen, öğrenci ve veli hesaplarını tek seferde oluştur.</Text></div>
    <Card style={{ marginBottom: 16 }} title="Kurum Seçimi">
      <Select showSearch optionFilterProp="label" value={kresId || undefined} onChange={setKresId} placeholder="Kreş seçin" style={{ width: '100%', maxWidth: 520 }} options={institutions.map((x) => ({ value: x.id, label: x.ad || x.kresAdi || x.isim || x.id }))} />
      {selectedInstitution && <div style={{ marginTop: 10 }}><Tag color="blue">{formatInstitutionLocation(selectedInstitution)}</Tag><Text type="secondary"> {selectedInstitution.telefon || ''}</Text></div>}
    </Card>
    {!kresId ? <Empty description="Kurulum yapılacak kreşi seçin" /> : <>
      {ogrenciLimiti != null && <Alert style={{ marginBottom: 16 }} type={mevcutOgrenciSayisi >= ogrenciLimiti ? 'error' : 'info'} showIcon message={`Öğrenci limiti: ${mevcutOgrenciSayisi} / ${ogrenciLimiti} (eklenecek: ${toplamOgrenci})`} />}
      <Card style={{ marginBottom: 16 }}><Text strong>Ortak Şifre</Text><Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>Oluşturulacak yeni öğretmen ve veli hesaplarının şifresi.</Paragraph><Input style={{ maxWidth: 280 }} value={sifre} onChange={(e) => setSifre(e.target.value)} /></Card>
      <Collapse activeKey={aktifPanel} onChange={setAktifPanel} style={{ marginBottom: 16 }} items={siniflar.map((s) => ({
        key: s.key,
        label: s.ad ? `${s.ad} — ${s.ogrenciler.filter((o) => o.ad.trim()).length} öğrenci` : 'Yeni Sınıf',
        extra: <Button danger type="text" size="small" icon={<DeleteOutlined />} onClick={(e) => { e.stopPropagation(); sinifSil(s.key); }} disabled={siniflar.length === 1} />,
        children: <div>
          <Space wrap size="middle" style={{ marginBottom: 16 }}>
            <Input placeholder="Sınıf Adı" style={{ width: 220 }} value={s.ad} onChange={(e) => sinifAlanGuncelle(s.key, 'ad', e.target.value)} />
            <Select placeholder="Yaş Grubu" style={{ width: 200 }} value={s.yasGrubu} onChange={(v) => sinifAlanGuncelle(s.key, 'yasGrubu', v)} options={YAS_GRUPLARI.map((g) => ({ value: g.label, label: g.label }))} />
            <Input placeholder="Öğretmen Adı (opsiyonel)" style={{ width: 210 }} value={s.ogretmenAd} onChange={(e) => sinifAlanGuncelle(s.key, 'ogretmenAd', e.target.value)} />
            <Input placeholder="Öğretmen Kullanıcı Adı" style={{ width: 210 }} value={s.ogretmenKullaniciAdi} onChange={(e) => sinifAlanGuncelle(s.key, 'ogretmenKullaniciAdi', e.target.value)} />
          </Space>
          <Divider orientation="left" plain>Öğrenciler</Divider>
          <Space direction="vertical" style={{ width: '100%' }} size="small">{s.ogrenciler.map((o) => <Card key={o.key} size="small" style={{ background: '#FAFAFA' }}><Space wrap size="middle" align="start">
            <Input placeholder="Öğrenci Adı" style={{ width: 180 }} value={o.ad} onChange={(e) => ogrenciAlanGuncelle(s.key, o.key, 'ad', e.target.value)} />
            <Input placeholder="Doğum Tarihi (15.05.2022)" style={{ width: 180 }} value={o.dogumTarihi} onChange={(e) => ogrenciAlanGuncelle(s.key, o.key, 'dogumTarihi', e.target.value)} />
            <Input placeholder="Veli Adı" style={{ width: 180 }} value={o.veliAd} onChange={(e) => ogrenciAlanGuncelle(s.key, o.key, 'veliAd', e.target.value)} />
            <AutoComplete placeholder="Veli Kullanıcı Adı" style={{ width: 200 }} value={o.veliKullaniciAdi} options={veliOnerileri} onChange={(v) => ogrenciAlanGuncelle(s.key, o.key, 'veliKullaniciAdi', v)} onSelect={(v) => veliSecildi(s.key, o.key, v)} filterOption={(input, option) => (option?.label || '').toLowerCase().includes(input.toLowerCase())} />
            <Button danger type="text" icon={<DeleteOutlined />} onClick={() => ogrenciSil(s.key, o.key)} disabled={s.ogrenciler.length === 1} />
          </Space></Card>)}</Space>
          <Button style={{ marginTop: 12 }} icon={<UserAddOutlined />} onClick={() => ogrenciEkle(s.key)}>+ Öğrenci Ekle</Button>
        </div>,
      }))} />
      <Button icon={<PlusOutlined />} onClick={sinifEkle} style={{ marginBottom: 24 }}>+ Yeni Sınıf</Button><br />
      <Space wrap>
        <Button type="primary" size="large" icon={<RocketOutlined />} loading={saving} onClick={olustur}>Kur ({toplamOgrenci} öğrenci)</Button>
        <Button size="large" icon={<CheckCircleOutlined />} loading={saving} onClick={kurulumuTamamla}>Kurulumu Tamamla</Button>
      </Space>
      {sonuc && <Card style={{ marginTop: 16 }} title="Sonuç"><Paragraph>✅ {sonuc.siniflar} sınıf, {sonuc.ogrenciler} öğrenci oluşturuldu.</Paragraph>
        {sonuc.ogretmenler.length > 0 && <><Divider orientation="left" plain>Öğretmenler</Divider><Space direction="vertical">{sonuc.ogretmenler.map((x, i) => <Text key={i}><Tag color={x.yeniMi ? 'green' : 'default'}>{x.yeniMi ? 'Yeni' : 'Mevcut'}</Tag>{x.kullaniciAdi} / {sifre}</Text>)}</Space></>}
        {sonuc.veliler.length > 0 && <><Divider orientation="left" plain>Veliler</Divider><Space direction="vertical">{sonuc.veliler.map((x, i) => <Text key={i}><Tag color={x.yeniMi ? 'green' : 'default'}>{x.yeniMi ? 'Yeni' : 'Mevcut'}</Tag>{x.kullaniciAdi} / {sifre}</Text>)}</Space></>}
        {sonuc.hatalar.length > 0 && <><Divider orientation="left" plain>Hatalar</Divider><Space direction="vertical">{sonuc.hatalar.map((x, i) => <Text key={i} type="danger">❌ {x}</Text>)}</Space></>}
      </Card>}
    </>}
  </div>;
}
