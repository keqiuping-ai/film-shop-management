import fs from 'node:fs';

const source = '/Users/keqiuping/Desktop/设计客户端用的视频和图片/review/ocr.tsv';
const output = new URL('../public/assets/wrap-colors/catalog.json', import.meta.url);
const rows = fs.readFileSync(source, 'utf8').trim().split('\n').map(line => {
  const [file, recognized = ''] = line.split('\t');
  const parts = recognized.split('|').map(value => value.trim()).filter(Boolean);
  const code = (parts[0] || file.replace(/\.jpeg$/i, '')).replaceAll(' ', '');
  const name = parts[1] || 'Color name pending review';
  const normalized = `${code} ${name}`.toLowerCase();
  const finish = normalized.includes('matte') ? 'matte' : normalized.includes('satin') ? 'satin' : 'gloss';
  return {
    code,
    name,
    finish,
    image: `/assets/wrap-colors-cropped/${file.replace(/\.jpeg$/i, '.jpg')}`,
    sourceFile: file
  };
});

fs.writeFileSync(output, `${JSON.stringify(rows, null, 2)}\n`);
console.log(`Generated ${rows.length} wrap colors.`);
