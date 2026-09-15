import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { ref, get, onValue } from 'firebase/database';
import { auth, database } from '../config/firebase';
import { findUserIdByAuthUid } from '../utils/authHelpers';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [baseKullanici, setBaseKullanici] = useState(null);
  const [kres, setKres] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [erisimHatasi, setErisimHatasi] = useState('');
  const [superAdminKresId, setSuperAdminKresId] = useState(() => localStorage.getItem('yumurcak_superadmin_kres_id') || '');
  const isSigningOutRef = useRef(false);

  async function girisYap(email, password) {
    setErisimHatasi('');
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function cikisYap() {
    isSigningOutRef.current = true;
    await signOut(auth);
    setBaseKullanici(null);
    setKres(null);
    setSuperAdminKresId('');
    localStorage.removeItem('yumurcak_superadmin_kres_id');
    isSigningOutRef.current = false;
  }

  function setSuperAdminKres(id) {
    const nextId = id || '';
    setSuperAdminKresId(nextId);
    if (nextId) localStorage.setItem('yumurcak_superadmin_kres_id', nextId);
    else localStorage.removeItem('yumurcak_superadmin_kres_id');
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (isSigningOutRef.current) { setYukleniyor(false); return; }
        if (!firebaseUser) {
          setBaseKullanici(null);
          setKres(null);
          setYukleniyor(false);
          return;
        }

        const legacyUserId = await findUserIdByAuthUid(firebaseUser.uid);
        if (!legacyUserId) {
          setErisimHatasi('Bu hesap sistemde bulunamadı.');
          await signOut(auth);
          setYukleniyor(false);
          return;
        }

        const userSnap = await get(ref(database, `kullanicilar/${legacyUserId}`));
        if (!userSnap.exists()) {
          setErisimHatasi('Kullanıcı kaydı bulunamadı.');
          await signOut(auth);
          setYukleniyor(false);
          return;
        }

        const userData = {
          uid: legacyUserId,
          id: legacyUserId,
          authUid: firebaseUser.uid,
          email: firebaseUser.email,
          ...userSnap.val(),
        };

        if (userData.rol !== 'yonetici' && userData.rol !== 'superadmin') {
          setErisimHatasi('Bu panel için yetkiniz bulunmuyor.');
          await signOut(auth);
          setYukleniyor(false);
          return;
        }

        setBaseKullanici(userData);
        setYukleniyor(false);
      } catch (error) {
        console.warn('Auth kontrol hatası:', error);
        setErisimHatasi('Giriş kontrolü sırasında bir hata oluştu.');
        setYukleniyor(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const kullanici = baseKullanici?.rol === 'superadmin' && superAdminKresId
    ? { ...baseKullanici, kresId: superAdminKresId }
    : baseKullanici;

  useEffect(() => {
    const kresId = kullanici?.rol === 'yonetici'
      ? kullanici?.kresId
      : kullanici?.rol === 'superadmin'
        ? superAdminKresId
        : null;
    if (!kresId) { setKres(null); return undefined; }
    const unsub = onValue(
      ref(database, `kresler/${kresId}`),
      (snap) => setKres(snap.exists() ? { id: kresId, ...snap.val() } : null),
      () => setKres(null)
    );
    return () => unsub();
  }, [baseKullanici?.kresId, baseKullanici?.rol, superAdminKresId]);

  return (
    <AuthContext.Provider value={{ kullanici, kres, yukleniyor, erisimHatasi, girisYap, cikisYap, setSuperAdminKres }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
