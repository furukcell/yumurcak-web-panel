// ============================================================
// YUMURCAK — featureFlags.js
// Kurum yöneticisinin uygulama içinden kendi aboneliğini
// alabilmesi (fiyatlar, paketler, Google Play / RevenueCat,
// promosyon kodu, demo başlat). Şimdilik KAPALI: ödemeler IBAN ile
// superadmin tarafından manuel tanımlanıyor.
// Tekrar açmak için true yapmak yeterli.
// ============================================================
export const SELF_SERVICE_PAYMENT_ENABLED = false;

// Yönetici "iletişime geç" butonuna basınca açılacak WhatsApp numarası
// (ülke kodlu, + ve boşluksuz, örn. '905xxxxxxxxx'). Boşsa buton görünmez.
export const SUPPORT_WHATSAPP = '905421523805';
// İstersen e-posta da ekleyebilirsin. Boşsa buton görünmez.
export const SUPPORT_EMAIL = 'destek.fkdigital@gmail.com';
