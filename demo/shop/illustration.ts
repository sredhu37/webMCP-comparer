import type { Color, Detail, Product, Shape } from './catalog.ts';

const swatches: Record<Color, string> = {
  red: '#c62828',
  blue: '#1e4fa3',
  black: '#262626',
  white: '#f2f2f2',
  green: '#2e7d32',
  grey: '#8d8d8d',
  brown: '#6d4c2f',
  beige: '#d9c49b',
};

const outline = '#00000055';
const shortSleeveTop =
  'M60 42 L85 32 Q100 44 115 32 L140 42 L172 74 L150 92 L140 82 L140 172 L60 172 L60 82 L50 92 L28 74 Z';
const longSleeveTop =
  'M62 44 L86 36 Q100 46 114 36 L138 44 L176 154 L154 160 L140 104 L140 174 L60 174 L60 104 L46 160 L24 154 Z';

function repeat<T>(values: readonly T[], draw: (value: T, index: number) => string): string {
  return values.map(draw).join('');
}

type Draw = (fill: string, details: readonly Detail[]) => string;

const shapes: Record<Shape, Draw> = {
  shirt: (fill, details) =>
    `<path d="${shortSleeveTop}" fill="${fill}" stroke="${outline}"/>` +
    `<path d="M85 32 L100 58 L92 66 L78 40 Z M115 32 L100 58 L108 66 L122 40 Z" fill="${fill}" stroke="${outline}"/>` +
    `<line x1="100" y1="58" x2="100" y2="172" stroke="${outline}"/>` +
    repeat(
      [78, 98, 118, 138, 158],
      (y) => `<circle cx="104" cy="${y}" r="2.2" fill="#fff" stroke="${outline}"/>`,
    ) +
    (details.includes('pocket')
      ? `<rect x="114" y="78" width="18" height="20" fill="none" stroke="${outline}"/>`
      : '') +
    (details.includes('linen')
      ? repeat(
          [70, 90, 110, 130, 150],
          (y) => `<line x1="62" y1="${y}" x2="138" y2="${y + 6}" stroke="#ffffff33"/>`,
        )
      : ''),
  tee: (fill) =>
    `<path d="${shortSleeveTop}" fill="${fill}" stroke="${outline}"/>` +
    `<path d="M85 32 Q100 50 115 32" fill="none" stroke="${outline}" stroke-width="2"/>`,
  polo: (fill) =>
    `<path d="${shortSleeveTop}" fill="${fill}" stroke="${outline}"/>` +
    `<path d="M85 32 L96 50 L84 52 Z M115 32 L104 50 L116 52 Z" fill="${fill}" stroke="${outline}"/>` +
    `<line x1="100" y1="44" x2="100" y2="72" stroke="${outline}"/>` +
    '<circle cx="103" cy="56" r="2" fill="#fff"/><circle cx="103" cy="66" r="2" fill="#fff"/>',
  hoodie: (fill) =>
    `<path d="${longSleeveTop}" fill="${fill}" stroke="${outline}"/>` +
    `<path d="M80 40 Q100 10 120 40 Q100 60 80 40 Z" fill="${fill}" stroke="${outline}"/>` +
    `<path d="M78 130 L122 130 L128 160 L72 160 Z" fill="none" stroke="${outline}"/>` +
    '<line x1="95" y1="48" x2="94" y2="80" stroke="#fff"/><line x1="105" y1="48" x2="106" y2="80" stroke="#fff"/>',
  sweater: (fill) =>
    `<path d="${longSleeveTop}" fill="${fill}" stroke="${outline}"/>` +
    `<path d="M86 36 Q100 54 114 36" fill="none" stroke="${outline}" stroke-width="3"/>` +
    repeat(
      [62, 70, 78, 86, 94, 102, 110, 118, 126, 134],
      (x) => `<line x1="${x}" y1="164" x2="${x}" y2="174" stroke="${outline}"/>`,
    ),
  sneaker: (fill, details) =>
    `<path d="M28 132 Q32 96 68 94 L104 100 Q128 116 164 120 Q178 124 176 140 L28 140 Z" fill="${fill}" stroke="${outline}"/>` +
    `<rect x="24" y="138" width="156" height="14" rx="6" fill="#fafafa" stroke="${outline}"/>` +
    repeat(
      [0, 1, 2, 3],
      (i) =>
        `<line x1="${76 + i * 9}" y1="${100 + i * 3}" x2="${84 + i * 9}" y2="${108 + i * 3}" stroke="#fff" stroke-width="2"/>`,
    ) +
    (details.includes('stripe')
      ? '<path d="M70 132 Q110 112 150 128" fill="none" stroke="#fff" stroke-width="5"/>'
      : ''),
  boot: (fill) =>
    `<path d="M62 46 L112 46 L114 118 Q152 120 166 134 L166 150 L62 150 Z" fill="${fill}" stroke="${outline}"/>` +
    '<rect x="58" y="148" width="112" height="12" rx="3" fill="#3b2a1a"/>' +
    repeat(
      [60, 74, 88, 102],
      (y) => `<line x1="96" y1="${y}" x2="112" y2="${y + 4}" stroke="#888" stroke-width="2"/>`,
    ),
  loafer: (fill) =>
    `<path d="M28 136 Q36 108 78 108 L130 110 Q166 116 174 136 L174 146 L28 146 Z" fill="${fill}" stroke="${outline}"/>` +
    '<rect x="26" y="144" width="150" height="9" rx="3" fill="#2a1b10"/>' +
    '<path d="M84 112 Q104 126 124 112" fill="none" stroke="#2a1b10" stroke-width="4"/>',
  fedora: (fill) =>
    `<ellipse cx="100" cy="128" rx="74" ry="15" fill="${fill}" stroke="${outline}"/>` +
    `<path d="M62 128 Q60 62 100 60 Q140 62 138 128 Z" fill="${fill}" stroke="${outline}"/>` +
    '<path d="M86 62 Q100 76 114 62" fill="none" stroke="#555"/>' +
    '<rect x="62" y="108" width="76" height="11" fill="#7a1f1f"/>',
  cap: (fill) =>
    `<path d="M48 124 Q50 62 104 62 Q152 64 152 124 Z" fill="${fill}" stroke="${outline}"/>` +
    `<path d="M140 118 Q186 118 186 132 Q160 138 132 128 Z" fill="${fill}" stroke="${outline}"/>` +
    `<circle cx="102" cy="63" r="4" fill="${fill}" stroke="${outline}"/>` +
    `<line x1="102" y1="66" x2="98" y2="122" stroke="${outline}"/>`,
  beanie: (fill) =>
    `<path d="M56 130 Q54 66 100 64 Q146 66 144 130 Z" fill="${fill}" stroke="${outline}"/>` +
    `<rect x="52" y="122" width="96" height="26" rx="5" fill="${fill}" stroke="${outline}"/>` +
    `<circle cx="100" cy="56" r="13" fill="${fill}" stroke="${outline}"/>` +
    repeat(
      [64, 76, 88, 100, 112, 124, 136],
      (x) => `<line x1="${x}" y1="124" x2="${x}" y2="146" stroke="${outline}"/>`,
    ),
  straw: (fill) =>
    `<ellipse cx="100" cy="126" rx="86" ry="20" fill="${fill}" stroke="${outline}"/>` +
    `<path d="M64 126 Q62 70 100 68 Q138 70 136 126 Z" fill="${fill}" stroke="${outline}"/>` +
    '<rect x="64" y="108" width="72" height="10" fill="#1f2a44"/>' +
    repeat(
      [78, 90, 100],
      (y) => `<path d="M68 ${y} Q100 ${y + 6} 132 ${y}" fill="none" stroke="#a88a55"/>`,
    ),
};

/** Hex colour of a catalog colour, for swatches. */
export function swatch(color: Color): string {
  return swatches[color];
}

/** A standalone 200 x 200 SVG drawing of the product. */
export function productIllustration(product: Product): string {
  const { shape, details = [], shade } = product.look;
  const fill = shade ?? swatches[product.color];
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">' +
    '<rect width="200" height="200" fill="#f3f4f6"/>' +
    shapes[shape](fill, details) +
    '</svg>'
  );
}
