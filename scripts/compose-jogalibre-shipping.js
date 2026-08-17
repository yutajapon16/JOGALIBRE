const sharp = require('sharp');
const path = require('path');

const brainDir = '/Users/jogainc./.gemini/antigravity-ide/brain/38c8ffe1-5f37-4e96-ab74-1ea6b2302b7d';
const baseShippingOriginal = path.join(brainDir, 'base_safe_shipping_1786927775224.jpg');
const outputShippingJoga = path.join(brainDir, 'base_safe_shipping_jogalibre.jpg');

async function composeJogaShippingBanner() {
  // 1. 白いコンテナ用のJOGALIBREロゴを作成
  // ロゴマーク + JOGALIBRE テキスト + GLOBAL LOGISTICS
  const logoMark = await sharp('public/icons/new-logo-mark.png')
    .resize(95, 95, { fit: 'contain' })
    .toBuffer();

  const logoTextSvg = `
  <svg width="240" height="95" xmlns="http://www.w3.org/2000/svg">
    <text x="0" y="38" font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="34" font-weight="900" fill="#0f172a" letter-spacing="1.5">
      JOGALIBRE
    </text>
    <text x="2" y="66" font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="14" font-weight="800" fill="#0284c7" letter-spacing="2">
      GLOBAL LOGISTICS
    </text>
    <text x="2" y="85" font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="12" font-weight="bold" fill="#64748b" letter-spacing="1">
      DIRECT FROM JAPAN
    </text>
  </svg>
  `;
  const logoTextBuf = Buffer.from(logoTextSvg);

  // 白いコンテナの元文字を覆うクリーンなパッチ (X: 1040〜1345, Y: 135〜285)
  const whitePatchSvg = `
  <svg width="310" height="145" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="310" height="145" fill="#eceff1" rx="4" />
  </svg>
  `;
  const whitePatchBuf = Buffer.from(whitePatchSvg);

  // 青いコンテナ用のJOGALIBREホワイトロゴマーク (X: 1220, Y: 335)
  const bluePatchSvg = `
  <svg width="150" height="135" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="150" height="135" fill="#0284c7" rx="4" />
  </svg>
  `;
  const bluePatchBuf = Buffer.from(bluePatchSvg);

  const whiteLogoMark = await sharp('public/icons/jogalibre-logo-full-white.png')
    .resize(135, 100, { fit: 'contain' })
    .toBuffer();

  // 合成
  await sharp(baseShippingOriginal)
    .composite([
      // 白いコンテナのパッチ
      { input: whitePatchBuf, left: 1045, top: 140 },
      // JOGALIBREロゴマーク（白いコンテナ）
      { input: logoMark, left: 1055, top: 165 },
      // JOGALIBREテキスト（白いコンテナ）
      { input: logoTextBuf, left: 1160, top: 165 },

      // 青いコンテナのパッチ
      { input: bluePatchBuf, left: 1215, top: 335 },
      // JOGALIBREホワイトロゴ（青いコンテナ）
      { input: whiteLogoMark, left: 1222, top: 352 }
    ])
    .jpeg({ quality: 95 })
    .toFile(outputShippingJoga);

  console.log('Successfully generated JOGALIBRE branded shipping base image!');
}

composeJogaShippingBanner().catch(console.error);
