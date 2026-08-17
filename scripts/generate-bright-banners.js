const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const brainDir = '/Users/jogainc./.gemini/antigravity-ide/brain/38c8ffe1-5f37-4e96-ab74-1ea6b2302b7d';
const bannerDir = '/Users/jogainc./Desktop/yahoo-auction-proxy/public/images/banners';
const logoPath = '/Users/jogainc./Desktop/yahoo-auction-proxy/public/icons/jogalibre-logo-full.png';

const baseImages = {
  jdm: path.join(brainDir, 'base_jdm_parts_1786927632599.jpg'),
  fishing: path.join(brainDir, 'base_fishing_clean_1786929528502.jpg'),
  instruments: path.join(brainDir, 'base_instruments_swapped_1786932057972.jpg'),
  figure: path.join(brainDir, 'base_anime_figures_1786927740115.jpg'),
  shipping: path.join(brainDir, 'base_shipping_clean_zero_1786932115358.jpg')
};

function escapeXml(unsafe) {
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// 1376x768 のキャンバスにレイアウトするSVGオーバーレイ生成関数
function createBannerSvg({
  badge,
  badgeBg,
  title1,
  title2,
  title2Color,
  sub1,
  sub2,
  buttonText,
  buttonBg,
  isInfoOnly = false
}) {
  const safeBadge = escapeXml(badge);
  const safeTitle1 = escapeXml(title1);
  const safeTitle2 = escapeXml(title2);
  const safeSub1 = escapeXml(sub1);
  const safeSub2 = escapeXml(sub2);
  const safeButtonText = escapeXml(buttonText);

  // バッジ幅の計算（中央揃え用）
  const badgeWidth = Math.max(160, safeBadge.length * 11 + 44);
  const badgeHeight = 42;

  // ボタン幅の計算（中央揃え用）
  const btnWidth = isInfoOnly ? 360 : 200;
  const btnHeight = 56;

  return `
  <svg width="1376" height="768" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- 明るくクリアなホワイトグラデーション (左側50%を白、右側を自然に透過) -->
      <linearGradient id="whiteGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="1.0" />
        <stop offset="38%" stop-color="#ffffff" stop-opacity="0.97" />
        <stop offset="54%" stop-color="#ffffff" stop-opacity="0.80" />
        <stop offset="68%" stop-color="#ffffff" stop-opacity="0.25" />
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0.0" />
      </linearGradient>
    </defs>

    <!-- 左側の明るいホワイトグラデーション背景 -->
    <rect x="0" y="0" width="1376" height="768" fill="url(#whiteGrad)" />

    <!-- 1. 左上 丸囲みタイトルボックス (完全中央揃え) -->
    <g transform="translate(70, 75)">
      <rect x="0" y="0" width="${badgeWidth}" height="${badgeHeight}" rx="${badgeHeight / 2}" fill="${badgeBg}" />
      <text x="${badgeWidth / 2}" y="26" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="bold" fill="#ffffff" letter-spacing="1.2">
        ${safeBadge}
      </text>
    </g>

    <!-- 2. メインタイトル 1行目 (大フォント 58px) -->
    <text x="70" y="195" font-family="Arial, Helvetica, sans-serif" font-size="58" font-weight="bold" fill="#0f172a" letter-spacing="-0.5">
      ${safeTitle1}
    </text>

    <!-- 3. メインタイトル 2行目 (大フォント 58px ハイライトカラー) -->
    <text x="70" y="268" font-family="Arial, Helvetica, sans-serif" font-size="58" font-weight="bold" fill="${title2Color}" letter-spacing="-0.5">
      ${safeTitle2}
    </text>

    <!-- 4. サブテキスト (大フォント 28px, 高コントラスト #1e293b, 太字) -->
    <text x="70" y="358" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="bold" fill="#1e293b">
      ${safeSub1}
    </text>
    <text x="70" y="402" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="bold" fill="#1e293b">
      ${safeSub2}
    </text>

    <!-- 5. 左下の角丸囲みボックス (完全中央揃え) -->
    <g transform="translate(70, 470)">
      <rect x="0" y="0" width="${btnWidth}" height="${btnHeight}" rx="16" fill="${isInfoOnly ? '#059669' : buttonBg}" />
      <text x="${btnWidth / 2}" y="36" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="bold" fill="#ffffff">
        ${safeButtonText}
      </text>
    </g>
  </svg>
  `;
}

async function buildBanner(baseImagePath, svgOverlay, outputPath) {
  const resizedBase = await sharp(baseImagePath)
    .resize(1376, 768, { fit: 'cover', position: 'right top' })
    .toBuffer();

  const svgBuffer = Buffer.from(svgOverlay);

  // JOGALIBRE フルロゴ（左下に配置）
  // 高さ 32px にリサイズ
  const logoBuffer = await sharp(logoPath)
    .resize({ height: 34 })
    .toBuffer();

  await sharp(resizedBase)
    .composite([
      { input: svgBuffer, top: 0, left: 0 },
      // 左下に JOGALIBRE ロゴを配置 (X: 70, Y: 680)
      { input: logoBuffer, top: 680, left: 70 }
    ])
    .jpeg({ quality: 95, mozjpeg: true })
    .toFile(outputPath);

  console.log(`Saved banner: ${path.basename(outputPath)}`);
}

async function main() {
  if (!fs.existsSync(bannerDir)) {
    fs.mkdirSync(bannerDir, { recursive: true });
  }

  // 1. ① JDMパーツ (ボタン: Ver lista)
  // PT
  await buildBanner(
    baseImages.jdm,
    createBannerSvg({
      badge: 'JDM & PERFORMANCE',
      badgeBg: '#dc2626',
      title1: 'Peças JDM Exclusivas',
      title2: 'Direto do Japão',
      title2Color: '#b91c1c',
      sub1: 'Rodas RAYS/BBS, freios Brembo,',
      sub2: 'escapamentos e motores RB26/2JZ.',
      buttonText: 'Ver lista',
      buttonBg: '#dc2626'
    }),
    path.join(bannerDir, 'banner_jdm_pt.jpg')
  );
  // ES
  await buildBanner(
    baseImages.jdm,
    createBannerSvg({
      badge: 'JDM & PERFORMANCE',
      badgeBg: '#dc2626',
      title1: 'Piezas JDM Exclusivas',
      title2: 'Directo de Japón',
      title2Color: '#b91c1c',
      sub1: 'Ruedas RAYS/BBS, frenos Brembo,',
      sub2: 'escapes y motores RB26/2JZ.',
      buttonText: 'Ver lista',
      buttonBg: '#dc2626'
    }),
    path.join(bannerDir, 'banner_jdm_es.jpg')
  );

  // 2. ② 釣り用品 (ボタン: Ver lista)
  // PT
  await buildBanner(
    baseImages.fishing,
    createBannerSvg({
      badge: 'PESCA PROFISSIONAL',
      badgeBg: '#0284c7',
      title1: 'Equipamentos de Pesca',
      title2: 'Alta Precisão do Japão',
      title2Color: '#0369a1',
      sub1: 'Molinetes Shimano Stella, Daiwa,',
      sub2: 'varas de carbono e iscas raras.',
      buttonText: 'Ver lista',
      buttonBg: '#0284c7'
    }),
    path.join(bannerDir, 'banner_fishing_pt.jpg')
  );
  // ES
  await buildBanner(
    baseImages.fishing,
    createBannerSvg({
      badge: 'PESCA PROFESIONAL',
      badgeBg: '#0284c7',
      title1: 'Equipos de Pesca',
      title2: 'Alta Precisión de Japón',
      title2Color: '#0369a1',
      sub1: 'Carretes Shimano Stella, Daiwa,',
      sub2: 'cañas de carbono y señuelos raros.',
      buttonText: 'Ver lista',
      buttonBg: '#0284c7'
    }),
    path.join(bannerDir, 'banner_fishing_es.jpg')
  );

  // 3. ③ 楽器 (ボタン: Ver lista)
  // PT
  await buildBanner(
    baseImages.instruments,
    createBannerSvg({
      badge: 'INSTRUMENTOS MUSICAIS',
      badgeBg: '#d97706',
      title1: 'Instrumentos Japoneses',
      title2: 'Qualidade Sonora Pura',
      title2Color: '#b45309',
      sub1: 'Saxofones Yamaha Custom, guitarras',
      sub2: 'japonesas e áudio profissional.',
      buttonText: 'Ver lista',
      buttonBg: '#d97706'
    }),
    path.join(bannerDir, 'banner_instruments_pt.jpg')
  );
  // ES
  await buildBanner(
    baseImages.instruments,
    createBannerSvg({
      badge: 'INSTRUMENTOS MUSICALES',
      badgeBg: '#d97706',
      title1: 'Instrumentos Japoneses',
      title2: 'Calidad Sonora Pura',
      title2Color: '#b45309',
      sub1: 'Saxofones Yamaha Custom, guitarras',
      sub2: 'japonesas y audio profesional.',
      buttonText: 'Ver lista',
      buttonBg: '#d97706'
    }),
    path.join(bannerDir, 'banner_instruments_es.jpg')
  );

  // 4. ④ フィギュア (ボタン: Ver lista)
  // PT
  await buildBanner(
    baseImages.figure,
    createBannerSvg({
      badge: 'FIGURES & ANIME',
      badgeBg: '#7c3aed',
      title1: 'Figures & Colecionáveis',
      title2: '100% Originais do Japão',
      title2Color: '#6d28d9',
      sub1: 'Dragon Ball, One Piece, Gundam e',
      sub2: 'estátuas exclusivas limitadas.',
      buttonText: 'Ver lista',
      buttonBg: '#7c3aed'
    }),
    path.join(bannerDir, 'banner_figure_pt.jpg')
  );
  // ES
  await buildBanner(
    baseImages.figure,
    createBannerSvg({
      badge: 'FIGURAS & ANIME',
      badgeBg: '#7c3aed',
      title1: 'Figuras de Anime',
      title2: '100% Originales de Japón',
      title2Color: '#6d28d9',
      sub1: 'Dragon Ball, One Piece, Gundam y',
      sub2: 'estatuas exclusivas limitadas.',
      buttonText: 'Ver lista',
      buttonBg: '#7c3aed'
    }),
    path.join(bannerDir, 'banner_figure_es.jpg')
  );

  // 5. ⑤ 安心配送 (ボタン: 100% Protegido e Seguro / 100% Protegido y Seguro, タップ先なし)
  // PT
  await buildBanner(
    baseImages.shipping,
    createBannerSvg({
      badge: 'LOGÍSTICA INTERNACIONAL',
      badgeBg: '#059669',
      title1: 'Envio Internacional',
      title2: 'Seguro e Garantido',
      title2Color: '#047857',
      sub1: 'Embalagem reforçada, frete aéreo',
      sub2: 'e marítimo com rastreamento total.',
      buttonText: '100% Protegido e Seguro',
      buttonBg: '#059669',
      isInfoOnly: true
    }),
    path.join(bannerDir, 'banner_shipping_pt.jpg')
  );
  // ES
  await buildBanner(
    baseImages.shipping,
    createBannerSvg({
      badge: 'LOGÍSTICA INTERNACIONAL',
      badgeBg: '#059669',
      title1: 'Envío Internacional',
      title2: 'Seguro y Garantizado',
      title2Color: '#047857',
      sub1: 'Embalaje reforzado, flete aéreo',
      sub2: 'y marítimo con rastreo total.',
      buttonText: '100% Protegido y Seguro',
      buttonBg: '#059669',
      isInfoOnly: true
    }),
    path.join(bannerDir, 'banner_shipping_es.jpg')
  );

  console.log('All 10 updated banners generated with JOGALIBRE logo and centered text boxes!');
}

main().catch(console.error);
