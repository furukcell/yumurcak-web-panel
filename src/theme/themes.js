// Mobildeki src/theme/themes.js'in web karşılığı — sadece renk verileri
// taşındı, backgroundImage (RN require ile yüklenen görseller) web'de
// gerekmiyor çünkü tema kartları düz renk önizlemesiyle gösteriliyor.
export const DEFAULT_THEME_ID = 'yumurcakMor';

export const THEMES = {
  yumurcakMor: { id: 'yumurcakMor', name: 'Yumurcak Mor', subtitle: 'Mevcut görünüme en yakın', primary: '#6C3DEB', primaryDark: '#4B22B8', primarySoft: '#EFE8FF', secondary: '#8D57F0', text: '#191A23', muted: '#707386', bg: '#F8F6FF', card: '#FFFFFF', border: '#EEEAF8' },
  ormanDostlari: { id: 'ormanDostlari', name: 'Orman Dostları', subtitle: 'Mint + Lavender', primary: '#7C3AED', primaryDark: '#4B22B8', primarySoft: '#EAD5FF', secondary: '#B57BEE', text: '#2E2143', muted: '#6D6380', bg: '#EEF9F3', card: '#FFFFFF', border: '#E7DDF8' },
  mercanResif: { id: 'mercanResif', name: 'Mercan Resif', subtitle: 'Peach + Coral', primary: '#EA5A1C', primaryDark: '#A83A10', primarySoft: '#FFD9C0', secondary: '#F97849', text: '#2B211C', muted: '#7C665D', bg: '#FFF2E5', card: '#FFFFFF', border: '#F8DED1' },
  ciftlikBahcesi: { id: 'ciftlikBahcesi', name: 'Çiftlik Bahçesi', subtitle: 'Lime + Grass', primary: '#5A9900', primaryDark: '#3F7000', primarySoft: '#D8FFA0', secondary: '#79C800', text: '#1F2A16', muted: '#647052', bg: '#EDFFD0', card: '#FFFFFF', border: '#DDF3CA' },
  gokyuzu: { id: 'gokyuzu', name: 'Gökyüzü Maceraları', subtitle: 'Sky + Blue', primary: '#0093CF', primaryDark: '#0369A1', primarySoft: '#B8E8FF', secondary: '#20B8F5', text: '#172033', muted: '#56677C', bg: '#DCF5FF', card: '#FFFFFF', border: '#D2EAF8' },
  balArisi: { id: 'balArisi', name: 'Bal Arısı', subtitle: 'Amber + Sunflower', primary: '#D08000', primaryDark: '#8B5A00', primarySoft: '#FFE88A', secondary: '#F5B200', text: '#2E2109', muted: '#765F32', bg: '#FFF7C0', card: '#FFFFFF', border: '#F4E7BC' },
  dinozorVadisi: { id: 'dinozorVadisi', name: 'Dinozor Vadisi', subtitle: 'Teal + Jade', primary: '#008A79', primaryDark: '#006257', primarySoft: '#A8FFF3', secondary: '#00C9B0', text: '#0F2F2B', muted: '#4C6F68', bg: '#C8FFF7', card: '#FFFFFF', border: '#CBEFE9' },
  denizalti: { id: 'denizalti', name: 'Denizaltı Dünyası', subtitle: 'Aqua + Cyan', primary: '#0092B0', primaryDark: '#155E75', primarySoft: '#A8F5FF', secondary: '#00C9E8', text: '#102A35', muted: '#4B6B76', bg: '#C8F8FF', card: '#FFFFFF', border: '#CBEAF0' },
  pamukSeker: { id: 'pamukSeker', name: 'Pamuk Şeker', subtitle: 'Rose + Candy', primary: '#C0008A', primaryDark: '#8A0063', primarySoft: '#FFC8EC', secondary: '#F050B0', text: '#321324', muted: '#7E5870', bg: '#FFE8F8', card: '#FFFFFF', border: '#F5D6EA' },
  uzayKasifleri: { id: 'uzayKasifleri', name: 'Uzay Kaşifleri', subtitle: 'Indigo + Violet', primary: '#4030D0', primaryDark: '#2B238C', primarySoft: '#C8C0FF', secondary: '#7060F8', text: '#1D1940', muted: '#605B83', bg: '#E8E0FF', card: '#FFFFFF', border: '#DED8F5' },
};

export const THEME_LIST = Object.values(THEMES);

export function getThemeById(themeId) {
  return THEMES[themeId] || THEMES[DEFAULT_THEME_ID];
}
