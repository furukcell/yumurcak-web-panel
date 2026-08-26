import React, { useEffect, useState } from 'react';
import { Typography, Table, Button, Drawer, Form, Input, Select, Tag, message, Empty, Space, Popconfirm } from 'antd';
import { PlusOutlined, EyeInvisibleOutlined, EyeTwoTone, DeleteOutlined } from '@ant-design/icons';
import { ref, onValue, get, update, query, orderByChild, equalTo } from 'firebase/database';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { database } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme';
import { generateId } from '../utils/crudHelpers';
import { usernameToEmail, normalizeUsername } from '../utils/authHelpers';
import { getSecondaryAuth, releaseSecondaryAuth } from '../utils/secondaryAuth';
import { deleteKullaniciHesabi } from '../utils/userDelete';

const { Title, Text } = Typography;

// Mobildeki TeacherListScreen.js + TeacherFormScreen.js'in web karşılığı.
export default function TeachersPage() {
  const { kullanici, kres } = useAuth();
  const kresId = kres?.id || kullanici?.kresId;

  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [siniflar, setSiniflar] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [form] = Form.useForm();

  // ── Öğretmen listesi (mobildeki TeacherListScreen.js mantığı) ─────
  useEffect(() => {
    if (!kresId) {
      setTeachers([]);
      setLoading(false);
      return;
    }

    const ogretmenIndexRef = ref(database, `kresKullanicilari/${kresId}/ogretmenler`);
    const sinifIndexRef = ref(database, `kresSiniflari/${kresId}`);

    let ogretmenIds = [];
    let sinifIds = [];
    let ogretmenLoaded = false;
    let sinifLoaded = false;

    async function buildList() {
      if (!ogretmenLoaded || !sinifLoaded) return;
      try {
        const sinifResults = await Promise.all(
          sinifIds.map((id) => get(ref(database, `siniflar/${id}`)).then((s) => (s.exists() ? { id, ...s.val() } : null)))
        );
        const sinifListesi = sinifResults.filter(Boolean);
        setSiniflar(sinifListesi);

        const ogretmenResults = await Promise.all(
          ogretmenIds.map((id) => get(ref(database, `kullanicilar/${id}`)).then((s) => (s.exists() ? [id, s.val()] : null)))
        );
        const kullanicilarMap = Object.fromEntries(ogretmenResults.filter(Boolean));

        const ogretmenler = ogretmenIds
          .filter((id) => kullanicilarMap[id])
          .map((id) => {
            const u = kullanicilarMap[id];
            const atanmisSiniflar = sinifListesi.filter((s) => Array.isArray(s.ogretmenIds) && s.ogretmenIds.includes(id));
            const adSoyad = `${u.ad || ''} ${u.soyad || ''}`.trim();
            const sinifAdlari = atanmisSiniflar.map((s) => s.ad).filter(Boolean);
            const sinifIdleri = atanmisSiniflar.map((s) => s.id);

            return {
              id,
              ad: adSoyad || u.kullaniciAdi || 'İsimsiz öğretmen',
              kullaniciAdi: u.kullaniciAdi || '-',
              telefon: u.telefon || u.tel || '-',
              email: u.email || '-',
              aktif: u.aktif !== false,
              sinifAdlari,
              sinifIdleri,
              sinifId: sinifIdleri[0] || '',
            };
          })
          .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));

        setTeachers(ogretmenler);
        setLoading(false);
      } catch (error) {
        console.warn('Öğretmen listesi çekme hatası:', error);
        setTeachers([]);
        setLoading(false);
      }
    }

    const ogretmenUnsub = onValue(ogretmenIndexRef, (snap) => {
      const data = snap.val();
      ogretmenIds = data ? Object.keys(data) : [];
      ogretmenLoaded = true;
      buildList();
    });

    const sinifUnsub = onValue(sinifIndexRef, (snap) => {
      const data = snap.val();
      sinifIds = data ? Object.keys(data) : [];
      sinifLoaded = true;
      buildList();
    });

    return () => {
      ogretmenUnsub();
      sinifUnsub();
    };
  }, [kresId]);

  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    setDrawerOpen(true);
  };

  const openEdit = (record) => {
    setEditingId(record.id);
    form.setFieldsValue({ kullaniciAdi: record.kullaniciAdi, ad: record.ad, sinifId: record.sinifId, sifre: '' });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    setSaving(true);
    try {
      const id = editingId || generateId();
      const now = Date.now();
      const nextSinifId = values.sinifId || '';
      const teacherSnap = editingId ? await get(ref(database, `kullanicilar/${id}`)) : null;
      const oldTeacher = teacherSnap?.exists() ? teacherSnap.val() || {} : {};

      // NOT: Mobil TeacherFormScreen.js'de bu kontrol eksikti (VeliFormScreen.js'de
      // vardı) — mevcut bir Firebase Auth hesabının şifresi bu ekrandan
      // değiştirilemez, çünkü sadece DB'deki 'sifre' alanı güncellenir, gerçek
      // Auth şifresi değişmez ve öğretmen giriş yapamaz hale gelir. Tutarlılık
      // için web tarafında bu güvenli davranış uygulandı.
      if (editingId && oldTeacher.authUid && (values.sifre || '').trim()) {
        message.error('Bu öğretmen Firebase Auth hesabına bağlı. Mevcut kullanıcının şifresi bu ekrandan değiştirilemez.');
        setSaving(false);
        return;
      }

      const kaydedilenSifre = (values.sifre || '').trim() || oldTeacher.sifre || '123456';

      if (kaydedilenSifre.length < 6) {
        message.error('Şifre en az 6 karakter olmalı');
        setSaving(false);
        return;
      }

      const email = oldTeacher.email || usernameToEmail(values.kullaniciAdi.trim());
      let authUid = oldTeacher.authUid || null;

      if (!authUid) {
        const secondaryAuth = getSecondaryAuth('yumurcak-teacher-create');
        const credential = await createUserWithEmailAndPassword(secondaryAuth, email, kaydedilenSifre);
        authUid = credential.user.uid;
        await signOut(secondaryAuth).catch(() => {});
        await releaseSecondaryAuth('yumurcak-teacher-create');
      }

      const nextKresId = oldTeacher.kresId || kresId || 'default-kres';

      const siniflarQ = query(ref(database, 'siniflar'), orderByChild('kresId'), equalTo(nextKresId));
      const siniflarSnap = await get(siniflarQ);
      const siniflarData = siniflarSnap.exists() ? siniflarSnap.val() || {} : {};

      const nextUsername = values.kullaniciAdi.trim();
      const cleanNewUsername = normalizeUsername(nextUsername);
      const cleanOldUsername = oldTeacher.kullaniciAdi ? normalizeUsername(oldTeacher.kullaniciAdi) : null;

      const updates = {};
      updates[`kullanicilar/${id}`] = {
        ...oldTeacher,
        kullaniciAdi: nextUsername,
        sifre: kaydedilenSifre,
        ad: values.ad.trim(),
        rol: 'ogretmen',
        sinifId: nextSinifId,
        kresId: nextKresId,
        authUid,
        email,
        authProvider: 'firebase',
        authCreatedAt: oldTeacher.authCreatedAt || now,
        authUpdatedAt: now,
        createdAt: oldTeacher.createdAt || now,
        updatedAt: now,
      };

      updates[`authKullaniciIndex/${authUid}`] = id;
      updates[`kresKullanicilari/${nextKresId}/ogretmenler/${id}`] = true;
      updates[`kullaniciKresleri/${id}/${nextKresId}`] = true;
      if (oldTeacher.kresId && oldTeacher.kresId !== nextKresId) updates[`kresKullanicilari/${oldTeacher.kresId}/ogretmenler/${id}`] = null;

      if (cleanNewUsername) updates[`kullaniciAdiIndex/${cleanNewUsername}`] = id;
      if (cleanOldUsername && cleanOldUsername !== cleanNewUsername)
