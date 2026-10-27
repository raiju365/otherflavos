import { readFile, writeFile } from 'node:fs/promises';
// Original local studies only. These are labeled placeholders, not project captures.
const root = new URL('../public/projects/', import.meta.url);
for (const [name, dark] of [['website', false], ['webapp', true], ['experiment', false]]) {
  const source = await readFile(new URL(`${name}.svg`, root), 'utf8');
  const body = source.slice(source.indexOf('<g '), source.lastIndexOf('</svg>'));
  const paper = dark ? '#15171a' : '#ecece8';
  const ink = dark ? '#d9ddda' : '#303b32';
  const tile = dark ? '#272c30' : '#d8dcd2';
  const studies = Array.from({ length: 8 }, (_, index) => {
    const column = index%4, row = Math.floor(index/4);
    const x = 58 + column*342, y = 1030 + row*330;
    const shape = index%3 === 0
      ? `<circle cx="${x+147}" cy="${y+125}" r="76" fill="none" stroke="${ink}" stroke-width="2"/><ellipse cx="${x+147}" cy="${y+125}" rx="30" ry="76" fill="none" stroke="${ink}" stroke-width="2"/>`
      : index%3 === 1
      ? `<rect x="${x+30}" y="${y+40}" width="234" height="170" fill="${paper}"/><path d="M${x+55} ${y+175}l45-40 40 20 45-70 45 25" fill="none" stroke="${ink}" stroke-width="3"/>`
      : `<g fill="${ink}">${[0,1,2,3,4].map(i=>`<rect x="${x+40+i*40}" y="${y+45+i*13}" width="22" height="150"/>`).join('')}</g>`;
    return `<rect x="${x}" y="${y}" width="296" height="270" fill="${tile}"/>${shape}`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1800" viewBox="0 0 1440 1800"><rect width="1440" height="1800" fill="${paper}"/>${body}<g font-family="Arial,sans-serif"><text x="58" y="965" font-size="22" fill="${ink}">[page section / layout study]</text>${studies}<text x="58" y="1765" font-size="14" letter-spacing="2" fill="${ink}">PLACEHOLDER / NOT AN ACTUAL WEBSITE CAPTURE</text></g></svg>`;
  await writeFile(new URL(`${name}-scroll.svg`, root), svg);
}
console.log('Three local placeholder scroll studies written.');
