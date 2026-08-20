import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';

// Mobil uygulamayla (yumurcak-app) AYNI Firebase projesi. Değerler
// zaten public/client-side (mobil app bundle'ında da açık duruyor),
// güvenlik Firebase rules ve Auth ile sağlanıyor, bu config'in
// kendisi gizli değil.
export const firebaseConfig = {
  apiKey: 'AIzaSyCH_lb0nGSyL0SMx2OmjipRw2VT0AdoPq0',
  authDomain: 'yumurcak-app.firebaseapp.com',
  databaseURL: 'https://yumurcak-app-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'yumurcak-app',
  storageBucket: 'yumurcak-app.firebasestorage.app',
  messagingSenderId: '857802425510',
  appId: '1:857802425510:web:f023a72805bb40d750e067',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const database = getDatabase(app);
export const storage = getStorage(app);
