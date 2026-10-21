const sharp = require('sharp');
const QRCode = require('qrcode');

/**
 * Generate Authentic Bakong KHQR Card Buffer matching the official NBC design
 * Supports both USD ($) and KHR (៛) currencies with automatic formatting and dynamic layout.
 */
async function createKhqrCard({
  merchantName = 'PAY8BET168',
  amount = '1.00',
  currency = 'USD',
  altAmount = null,
  qrString
}) {
  const width = 500;
  const height = 750;

  const isKHR = String(currency).toUpperCase() === 'KHR';
  const currencyCode = isKHR ? 'KHR' : 'USD';

  // Format amount cleanly
  let displayAmount = amount;
  if (isKHR) {
    const num = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/,/g, ''));
    displayAmount = isNaN(num) ? amount : Math.round(num).toLocaleString('en-US');
  } else {
    const num = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/,/g, ''));
    displayAmount = isNaN(num) ? amount : num.toFixed(2);
  }

  // Auto-scale font size if amount is long (e.g. 100,000 KHR)
  let amountFontSize = 36;
  if (displayAmount.length > 9) {
    amountFontSize = 26;
  } else if (displayAmount.length > 6) {
    amountFontSize = 30;
  }

  // 1. Generate clean QR code buffer
  const qrBuffer = await QRCode.toBuffer(qrString, {
    width: 320,
    margin: 1,
    color: {
      dark: '#081B37',
      light: '#ffffff'
    }
  });

  // Alternative currency info line if provided (e.g. "≈ $1.00 USD" or "≈ 4,100 ៛ KHR")
  const altTextSvg = altAmount
    ? `<text x="0" y="74" font-family="'SF Pro Display', Arial, sans-serif" font-size="13" font-weight="600" fill="#94a3b8">≈ ${altAmount}</text>`
    : '';

  // 2. SVG Template matching user's exact Bakong KHQR Card
  const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="cardGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="100%" stop-color="#fdfdfd"/>
      </linearGradient>
      <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000000" flood-opacity="0.10"/>
      </filter>
    </defs>

    <!-- Outer Card Background with Rounded Corners -->
    <rect x="25" y="25" width="450" height="700" rx="36" fill="url(#cardGrad)" filter="url(#shadow)"/>
    <rect x="25" y="25" width="450" height="700" rx="36" fill="none" stroke="#e2e8f0" stroke-width="1.5"/>

    <!-- Red Header (Bakong Red: rgb(226, 26, 26)) -->
    <path d="M 25 61 A 36 36 0 0 1 61 25 L 439 25 A 36 36 0 0 1 475 61 L 475 102 L 25 102 Z" fill="#E21A1A"/>

    <!-- Official BAKONG KHQR text & emblem -->
    <text x="250" y="73" font-family="'SF Pro Display', Arial, Helvetica, sans-serif" font-weight="900" font-size="22" fill="#ffffff" text-anchor="middle" letter-spacing="5">BAKONG KHQR</text>

    <!-- Red Triangle Cutout on Right Corner -->
    <polygon points="475,102 442,102 475,135" fill="#E21A1A"/>

    <!-- Store & Amount Details -->
    <g transform="translate(60, 130)">
      <text x="0" y="16" font-family="'SF Pro Display', Arial, sans-serif" font-size="14" font-weight="700" fill="#64748b" letter-spacing="1">${merchantName}</text>
      <text x="0" y="52" font-family="'Nunito Sans', Arial, sans-serif" font-size="${amountFontSize}" font-weight="800" fill="#081B37">
        ${displayAmount} <tspan font-size="18" font-weight="600" fill="#64748b">${currencyCode}</tspan>
      </text>
      ${altTextSvg}
    </g>

    <!-- Dashed Line Divider -->
    <line x1="60" y1="210" x2="440" y2="210" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="8 6"/>

    <!-- QR Code Container Box -->
    <rect x="75" y="235" width="350" height="350" rx="22" fill="#ffffff" stroke="#f1f5f9" stroke-width="1"/>

    <!-- Footer Instructions -->
    <text x="250" y="632" font-family="'SF Pro Display', Arial, sans-serif" font-size="14" font-weight="700" fill="#081B37" text-anchor="middle">Scan to Pay with Banking App</text>
    <text x="250" y="656" font-family="'SF Pro Display', Arial, sans-serif" font-size="12" fill="#94a3b8" text-anchor="middle">Bakong, ABA Mobile, or other App supporting KHQR</text>
  </svg>
  `;

  // 3. Composite QR code onto card
  const cardBuffer = await sharp(Buffer.from(svg))
    .composite([
      {
        input: qrBuffer,
        top: 250,
        left: 90
      }
    ])
    .png()
    .toBuffer();

  return cardBuffer;
}

module.exports = { createKhqrCard };
