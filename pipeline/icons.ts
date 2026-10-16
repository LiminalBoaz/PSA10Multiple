// Generates the home-screen icons: a graded slab outline with a red label band.
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const svg = (size: number) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#15181d"/>
  <rect x="146" y="78" width="220" height="356" rx="22" fill="none" stroke="#eceef1" stroke-width="18"/>
  <rect x="146" y="78" width="220" height="84" rx="22" fill="#b4232a"/>
  <rect x="146" y="140" width="220" height="22" fill="#b4232a"/>
  <rect x="180" y="190" width="152" height="212" rx="10" fill="#7ea2ff"/>
  <text x="256" y="134" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="46" fill="#ffffff">10</text>
</svg>`;

await mkdir('public/icons', { recursive: true });
for (const size of [192, 512]) {
  await sharp(Buffer.from(svg(size))).resize(size, size).png().toFile(`public/icons/icon-${size}.png`);
}
console.log('icons written');
