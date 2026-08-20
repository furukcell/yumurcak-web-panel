import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { ref, get } from 'firebase/database';
import { auth, database } from '../config/firebase';
import { findUserIdByAuthUid, getKresForUser } from '../utils/authHelpers';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [kullanici, setKullanici] = useState(null);
  const [kres, setKres] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  // Girişi olan ama admin OLMAYAN biri denerse: onAuthStateChanged içinde
  // bunu tespit edip mesaj gösterip hemen signOut yapıyoruz.
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
        if (isSigningOutRef.current) {
          setYukleniyor(false);
          return;
        }

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

        // Web paneli SADECE admin rolüne açık — bkz. docs/web-panel-plan.md
        if (userData.rol !== 'admin') {
          setErisimHatasi('Bu panel sadece kreş yöneticileri içindir.');
          await signOut(auth);
          setYukleniyor(false);
          return;
        }

        const kresObj = await getKresForUser(userData);
        setKullanici(userData);
        setKres(kresObj);
        setYukleniyor(false);
      } catch (error) {
        console.warn('Auth kontrol hatası:', error);
        setErisimHatasi('Giriş kontrolü sırasında bir hata oluştu.');
        setYukleniyor(false);
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ kullanici, kres, yukleniyor, erisimHatasi, girisYap, cikisYap }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
