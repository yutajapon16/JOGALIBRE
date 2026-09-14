import type { MetadataRoute } from 'next';

// サイトURLの定義（本番環境の正規ドメイン）
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.jogalibre.com';

/**
 * 検索エンジン向け sitemap.xml 設定
 * - Googleに対してサイトの正規URLと更新頻度を明示的に通知
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${siteUrl}/`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
  ];
}
