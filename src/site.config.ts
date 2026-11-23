// Cấu hình chung của site. Sửa ở đây (hoặc qua /admin → "Cấu hình site").
import settings from './data/settings.json';

export const SITE = {
  name: settings.name,
  tagline: settings.tagline,
  description: settings.description,
  // URL thật khi deploy. Dùng cho canonical, sitemap, OG.
  url: import.meta.env.PUBLIC_SITE_URL || settings.url,
  locale: settings.locale,
  lang: settings.lang,
  twitter: settings.twitter,
  // Analytics & quảng cáo: để trống = tắt.
  gaId: settings.gaId,
  adsenseClient: settings.adsenseClient,
  adSlots: settings.adSlots as Record<'top' | 'inContent' | 'bottom' | 'sidebar', string>,
  // Số đoạn văn trước quảng cáo trong bài
  inContentAdAfterParagraph: settings.inContentAdAfterParagraph,
  web3formsKey: settings.web3formsKey,
  storiesPerPage: 12,
};

export const NAV = [
  { href: '/', label: 'Stories' },
  { href: '/news/', label: 'News' },
  { href: '/contact/', label: 'Contact Us' },
  { href: '/terms/', label: 'Terms and Conditions' },
];

export const FOOTER_NAV = [
  { href: '/news/', label: 'News' },
  { href: '/about/', label: 'About' },
  { href: '/contact/', label: 'Contact' },
  { href: '/privacy/', label: 'Privacy Policy' },
  { href: '/terms/', label: 'Terms' },
  { href: '/dmca/', label: 'DMCA' },
  { href: '/rss.xml', label: 'RSS' },
];
