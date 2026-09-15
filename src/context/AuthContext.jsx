import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { ref, get, onValue } from 'firebase/database';
import { auth, database } from '../config/firebase';
import { findUserIdByAuthUid } from '../utils/authHelpers';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [kullanici, setKullanici] = useState(null);
  const [kres, setKres] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [erisimHatasi, setErisimHatasi] = useState('');
  const isSigningOutRef = useRef(false);

  async function girisYap(email, password) {
    setErisimHatasi('');
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function cikisYap() {
    isSigningOutRef.current = true;
    await signOut(auth);
    setKullanici(null);
    setKres(null);
    isSigningOutRef.current = false;
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (isSigningOutRef.current) { setYukleniyor(false); return; }
        if (!firebaseUser) {
          setKullanici(null);
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

        // Web paneli yöneticilere ve platform SuperAdmin hesabına açıktır.
        if (userData.rol !== 'yonetici' && userData.rol !== 'superadmin') {
          setErisimHatasi('Bu panel için yetkiniz bulunmuyor.');
          await signOut(auth);
          setYukleniyor(false);
          return;
        }

        setKullanici(userData);
        setYukleniyor(false);
      } catch (error) {
        console.warn('Auth kontrol hatası:', error);
        setErisimHatasi('Giriş kontrolü sırasında bir hata oluştu.');
        setYukleniyor(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const kresId = kullanici?.rol === 'yonetici' ? kullanici?.kresId : null;
    if (!kresId) { setKres(null); return undefined; }
    const unsub = onValue(
      ref(database, `kresler/${kresId}`),
      (snap) => setKres(snap.exists() ? { id: kresId, ...snap.val() } : null),
      () => setKres(null)
    );
    return () => unsub();
  }, [kullanici?.kresId, kullanici?.rol]);

  return (
    <AuthContext.Provider value={{ kullanici, kres, yukleniyor, erisimHatasi, girisYap, cikisYap }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
