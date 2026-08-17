const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const brainDir = '/Users/jogainc./.gemini/antigravity-ide/brain/38c8ffe1-5f37-4e96-ab74-1ea6b2302b7d';
const bannerDir = '/Users/jogainc./Desktop/yahoo-auction-proxy/public/images/banners';

const baseImages = {
  jdm: path.join(brainDir, 'base_jdm_parts_1786927632599.jpg'),
  fishing: path.join(brainDir, 'base_fishing_gear_1786927673137.jpg'),
  instruments: path.join(brainDir, 'base_musical_instruments_1786927704244.jpg'),
  figure: path.join(brainDir, 'base_anime_figures_1786927740115.jpg'),
  shipping: path.join(brainDir, 'base_safe_shipping_1786927775224.jpg')
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

  return `
  <svg width="1376" height="768" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- 明るくクリアなホワイトグラデーション -->
      <linearGradient id="whiteGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="1.0" />
        <stop offset="42%" stop-color="#ffffff" stop-opacity="0.96" />
        <stop offset="58%" stop-color="#ffffff" stop-opacity="0.75" />
        <stop offset="72%" stop-color="#ffffff" stop-opacity="0.25" />
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0.0" />
      </linearGradient>
    </defs>

    <!-- 左側の明るいホワイトグラデーション背景 -->
    <rect x="0" y="0" width="1376" height="768" fill="url(#whiteGrad)" />

    <!-- 上部バッジ -->
    <g transform="translate(75, 120)">
      <rect x="0" y="0" width="${safeBadge.length * 11 + 36}" height="38" rx="19" fill="${badgeBg}" />
      <text x="18" y="24" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="bold" fill="#ffffff" letter-spacing="1">
        ${safeBadge}
      </text>
    </g>

    <!-- メインタイトル 1行目 -->
    <text x="75" y="240" font-family="Arial, Helvetica, sans-serif" font-size="52" font-weight="bold" fill="#0f172a" letter-spacing="-0.5">
      ${safeTitle1}
    </text>

    <!-- メインタイトル 2行目 (ハイライトカラー) -->
    <text x="75" y="310" font-family="Arial, Helvetica, sans-serif" font-size="52" font-weight="bold" fill="${title2Color}" letter-spacing="-0.5">
      ${safeTitle2}
    </text>

    <!-- サブテキスト -->
    <text x="75" y="395" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="bold" fill="#334155">
      ${safeSub1}
    </text>
    <text x="75" y="435" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="bold" fill="#334155">
      ${safeSub2}
    </text>

    <!-- アクションボタンまたは信頼バッジ -->
    ${isInfoOnly ? `
    <g transform="translate(75, 495)">
      <rect x="0" y="0" width="310" height="52" rx="14" fill="#059669" />
      <text x="24" y="33" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="bold" fill="#ffffff">
        ${safeButtonText}
      </text>
    </g>
    ` : `
    <g transform="translate(75, 495)">
      <rect x="0" y="0" width="230" height="52" rx="14" fill="${buttonBg}" />
      <text x="28" y="33" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="bold" fill="#ffffff">
        ${safeButtonText}
      </text>
    </g>
    `}
  </svg>
  `;
}

async function buildBanner(baseImagePath, svgOverlay, outputPath) {
  const resizedBase = await sharp(baseImagePath)
    .resize(1376, 768, { fit: 'cover', position: 'right top' })
    .toBuffer();

  const svgBuffer = Buffer.from(svgOverlay);

  await sharp(resizedBase)
    .composite([{ input: svgBuffer, top: 0, left: 0 }])
    .jpeg({ quality: 94, mozjpeg: true })
    .toFile(outputPath);

  console.log(`Saved banner: ${path.basename(outputPath)}`);
}

async function main() {
  if (!fs.existsSync(bannerDir)) {
    fs.mkdirSync(bannerDir, { recursive: true });
  }

  // 1. ① JDMパーツ
  // PT
  await buildBanner(
    baseImages.jdm,
    createBannerSvg({
      badge: 'JDM & PERFORMANCE',
      badgeBg: '#dc2626',
      title1: 'Pecas JDM Exclusivas',
      title2: 'Direto do Japao',
      title2Color: '#b91c1c',
      sub1: 'Rodas forjadas RAYS / BBS, freios Brembo,',
      sub2: 'escapamentos e motores RB26 / 2JZ originais.',
      buttonText: 'Ver Catalogo ->',
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
      title2: 'Directo de Japon',
      title2Color: '#b91c1c',
      sub1: 'Ruedas forjadas RAYS / BBS, frenos Brembo,',
      sub2: 'escapes y motores RB26 / 2JZ originales.',
      buttonText: 'Ver Catalogo ->',
      buttonBg: '#dc2626'
    }),
    path.join(bannerDir, 'banner_jdm_es.jpg')
  );

  // 2. ② 釣り用品
  // PT
  await buildBanner(
    baseImages.fishing,
    createBannerSvg({
      badge: 'PESCA PROFISSIONAL',
      badgeBg: '#0284c7',
      title1: 'Equipamentos de Pesca',
      title2: 'Alta Precisao do Japao',
      title2Color: '#0369a1',
      sub1: 'Molinetes e carretilhas Shimano Stella,',
      sub2: 'Daiwa Exist, varas de carbono e iscas.',
      buttonText: 'Explorar Pesca ->',
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
      title2: 'Alta Precision de Japon',
      title2Color: '#0369a1',
      sub1: 'Carretes Shimano Stella, Daiwa Exist,',
      sub2: 'canas de carbono y senuelos japoneses.',
      buttonText: 'Explorar Pesca ->',
      buttonBg: '#0284c7'
    }),
    path.join(bannerDir, 'banner_fishing_es.jpg')
  );

  // 3. ③ 楽器
  // PT
  await buildBanner(
    baseImages.instruments,
    createBannerSvg({
      badge: 'INSTRUMENTOS MUSICAIS',
      badgeBg: '#d97706',
      title1: 'Instrumentos Japoneses',
      title2: 'Qualidade Sonora Pura',
      title2Color: '#b45309',
      sub1: 'Saxofones e trompetes Yamaha Custom,',
      sub2: 'guitarras japonesas e audio profissional.',
      buttonText: 'Ver Instrumentos ->',
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
      sub1: 'Saxofones y trompetas Yamaha Custom,',
      sub2: 'guitarras japonesas y audio profesional.',
      buttonText: 'Ver Instrumentos ->',
      buttonBg: '#d97706'
    }),
    path.join(bannerDir, 'banner_instruments_es.jpg')
  );

  // 4. ④ フィギュア
  // PT
  await buildBanner(
    baseImages.figure,
    createBannerSvg({
      badge: 'FIGURES & ANIME',
      badgeBg: '#7c3aed',
      title1: 'Figures & Colecionaveis',
      title2: '100% Originais do Japao',
      title2Color: '#6d28d9',
      sub1: 'Dragon Ball, One Piece, Gundam e estatuas',
      sub2: 'exclusivas de edicao limitada japonesa.',
      buttonText: 'Ver Colecao ->',
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
      title2: '100% Originales de Japon',
      title2Color: '#6d28d9',
      sub1: 'Dragon Ball, One Piece, Gundam y estatuas',
      sub2: 'exclusivas de edicion limitada japonesa.',
      buttonText: 'Ver Coleccion ->',
      buttonBg: '#7c3aed'
    }),
    path.join(bannerDir, 'banner_figure_es.jpg')
  );

  // 5. ⑤ 安心配送 (タップ先なし・情報バナー)
  // PT
  await buildBanner(
    baseImages.shipping,
    createBannerSvg({
      badge: 'LOGISTICA INTERNACIONAL',
      badgeBg: '#059669',
      title1: 'Envio Internacional',
      title2: 'Seguro e Garantido',
      title2Color: '#047857',
      sub1: 'Embalagem reforcada de alta protecao, frete aereo',
      sub2: 'e maritimo consolidado com rastreamento total.',
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
      badge: 'LOGISTICA INTERNACIONAL',
      badgeBg: '#059669',
      title1: 'Envio Internacional',
      title2: 'Seguro y Garantizado',
      title2Color: '#047857',
      sub1: 'Embalaje reforzado de alta proteccion, flete aereo',
      sub2: 'y maritimo consolidado con rastreo total.',
      buttonText: '100% Protegido y Seguro',
      buttonBg: '#059669',
      isInfoOnly: true
    }),
    path.join(bannerDir, 'banner_shipping_es.jpg')
  );

  console.log('All 10 bright banners generated successfully!');
}

main().catch(console.error);
