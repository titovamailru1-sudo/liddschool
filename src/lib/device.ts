/** Подсказка для сервера: похоже ли устройство на телефон. */
export function isMobileUserAgent(ua: string | null) {
  return !!ua && /Mobi|iPhone|Android.+Mobile/i.test(ua);
}
