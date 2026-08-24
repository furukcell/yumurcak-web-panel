import { getApps, initializeApp, deleteApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { firebaseConfig } from '../config/firebase';

// Mobildeki TeacherFormScreen.js / VeliFormScreen.js'deki getSecondaryAuth
// desenin web karşılığı: yeni kullanıcı (öğretmen/veli) Firebase Auth
// hesabı oluştururken adminin kendi oturumunun düşmemesi için ikincil bir
// Firebase App instance'ı kullanılır.
export function getSecondaryAuth(name) {
  const existing = getApps().find((app) => app.name === name);
  const app = existing || initializeApp(firebaseConfig, name);
  return getAuth(app);
}

// Kullanım bittikten (signOut sonrası) çağrılır — ikincil App instance'ını
// ve onunla ilişkili auth state'ini (IndexedDB/localStorage persistence)
// tamamen kapatır. Bir sonraki çağrıda getSecondaryAuth aynı isimle
// sıfırdan yeni bir instance oluşturur.
export async function releaseSecondaryAuth(name) {
  const existing = getApps().find((app) => app.name === name);
  if (!existing) return;
  await deleteApp(existing).catch(() => {});
}
