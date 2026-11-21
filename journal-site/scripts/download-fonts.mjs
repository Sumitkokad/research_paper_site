import fs from 'node:fs/promises';
import path from 'node:path';

const target = path.resolve('public/fonts');
await fs.mkdir(target, { recursive: true });
const fonts = [
  ['NotoSerif-Regular.ttf', 'https://raw.githubusercontent.com/google/fonts/413898858ade64383198fa773fec7fcf166de552/ofl/notoserif/NotoSerif-Regular.ttf'],
  ['NotoSerif-Bold.ttf', 'https://raw.githubusercontent.com/google/fonts/413898858ade64383198fa773fec7fcf166de552/ofl/notoserif/NotoSerif-Bold.ttf']
];
for (const [filename, url] of fonts) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to download ${filename} (${response.status}). Check your internet access and retry.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 10000 || bytes.toString('ascii', 0, 4) !== '\u0000\u0001\u0000\u0000') {
    throw new Error(`Downloaded ${filename} does not look like a TrueType font.`);
  }
  await fs.writeFile(path.join(target, filename), bytes);
  console.log(`Installed ${filename} (${Math.round(bytes.length / 1024)} KB)`);
}
console.log('Noto Serif fonts are ready. Commit public/fonts/*.ttf so Netlify Functions can embed them in certificates.');
