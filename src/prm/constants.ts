export const PRM_TEXT = {
  liveBreadcrumb: ["Sipariş Yönetimi", "Canlı Sipariş"],
  loginButton: ["Giriş", "Oturum Aç"],
  saveButton: ["Kaydet", "Onayla"],
  securityChallenges: ["captcha", "doğrulama kodu", "sms kodu", "mfa", "tek kullanımlık şifre"],
} as const;

export const REQUIRED_ORDER_COLUMNS = ["orderNumber", "address", "deliveryPerson"] as const;

export const COLUMN_ALIASES = {
  orderNumber: ["sipariş numarası", "siparis numarasi", "sipariş no", "siparis no"],
  secondaryId: ["ikinci numara", "referans no"],
  channel: ["sipariş kanalı", "siparis kanali", "kanal"],
  customerName: ["müşteri adı", "musteri adi", "müşteri"],
  phone: ["telefon no", "telefon"],
  address: ["müşteri adresi", "musteri adresi", "adres"],
  details: ["sipariş detayı", "siparis detayi", "detay"],
  notes: ["notlar", "not"],
  status: ["sipariş durumu", "siparis durumu", "durum"],
  deliveryPerson: ["teslimatçı", "teslimatci", "kurye"],
  delay: ["gecikme bildirimi", "gecikme"],
  amount: ["sipariş tutarı", "siparis tutari", "tutar"],
  paymentType: ["ödeme tipi", "odeme tipi"],
  actions: ["işlemler", "islemler"],
  createdAt: ["oluşturma zamanı", "olusturma zamani", "oluşturma"],
  appointmentDelivery: ["randevulu teslimat", "randevu"],
  minutesPassed: ["geçen dakika", "gecen dakika"],
} as const;

export type OrderColumn = keyof typeof COLUMN_ALIASES;
