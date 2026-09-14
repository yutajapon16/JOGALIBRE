import type { MetadataRoute } from 'next';

// サイトURLの定義（本番環境の正規ドメイン）
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.jogalibre.com';

/**
 * クローラー向け robots.txt 設定
 * - 一般ページ（トップ等）のインデックスを許可
 * - 管理者画面・エージェント画面・API・認証リセットのインデックスを禁止
 * - サイトマップの場所を指定
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/agent/',
          '/api/',
          '/reset-password/',
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
