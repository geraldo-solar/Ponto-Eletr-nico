import fs from 'fs';

const iconSvg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="100" fill="#22c55e" />
  <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="250" font-weight="bold" fill="white">PE</text>
</svg>`;

if (!fs.existsSync('public')) {
  fs.mkdirSync('public');
}

fs.writeFileSync('public/icon-192x192.svg', iconSvg);
fs.writeFileSync('public/icon-512x512.svg', iconSvg);
console.log('Icons created in public directory.');
