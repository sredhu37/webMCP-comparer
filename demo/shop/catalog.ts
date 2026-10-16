export const categories = ['shirts', 'shoes', 'hats', 'sweaters'] as const;
export type Category = (typeof categories)[number];

export const colors = ['red', 'blue', 'black', 'white', 'green', 'grey', 'brown', 'beige'] as const;
export type Color = (typeof colors)[number];

export type Shape =
  | 'shirt'
  | 'tee'
  | 'polo'
  | 'hoodie'
  | 'sweater'
  | 'sneaker'
  | 'boot'
  | 'loafer'
  | 'fedora'
  | 'cap'
  | 'beanie'
  | 'straw';

export type Detail = 'pocket' | 'linen' | 'stripe';

export interface Look {
  shape: Shape;
  details?: readonly Detail[];
  /** Fill colour when it differs from the swatch of the product's colour. */
  shade?: string;
}

export interface Product {
  id: string;
  name: string;
  category: Category;
  color: Color;
  /** Price in EUR. */
  price: number;
  sizes: readonly string[];
  description: string;
  /** Alt text of the product illustration. */
  alt: string;
  look: Look;
}

export const products: readonly Product[] = [
  {
    id: 'red-shirt-basic',
    name: 'Red shirt basic',
    category: 'shirts',
    color: 'red',
    price: 19.99,
    sizes: ['S', 'M', 'L', 'XL'],
    description: 'Everyday cotton button-up shirt with a classic collar.',
    alt: 'Red short-sleeve button-up shirt',
    look: { shape: 'shirt' },
  },
  {
    id: 'red-linen-shirt',
    name: 'Red linen shirt',
    category: 'shirts',
    color: 'red',
    price: 29.99,
    sizes: ['M', 'L'],
    description: 'Light linen shirt for warm days.',
    alt: 'Red linen button-up shirt with a faint woven texture',
    look: { shape: 'shirt', details: ['linen'] },
  },
  {
    id: 'red-shirt-premium',
    name: 'Red shirt premium',
    category: 'shirts',
    color: 'red',
    price: 34.99,
    sizes: ['S', 'M', 'L'],
    description: 'Heavier cotton shirt with a chest pocket.',
    alt: 'Red button-up shirt with a chest pocket',
    look: { shape: 'shirt', details: ['pocket'] },
  },
  {
    id: 'blue-oxford-shirt',
    name: 'Blue oxford shirt',
    category: 'shirts',
    color: 'blue',
    price: 27.5,
    sizes: ['S', 'M', 'L', 'XL'],
    description: 'Oxford cloth shirt with a chest pocket.',
    alt: 'Blue button-up oxford shirt with a chest pocket',
    look: { shape: 'shirt', details: ['pocket'] },
  },
  {
    id: 'white-tee',
    name: 'White tee',
    category: 'shirts',
    color: 'white',
    price: 9.99,
    sizes: ['S', 'M', 'L', 'XL'],
    description: 'Plain crew-neck T-shirt.',
    alt: 'White crew-neck T-shirt',
    look: { shape: 'tee' },
  },
  {
    id: 'black-tee',
    name: 'Black tee',
    category: 'shirts',
    color: 'black',
    price: 9.99,
    sizes: ['S', 'M', 'L'],
    description: 'Plain crew-neck T-shirt.',
    alt: 'Black crew-neck T-shirt',
    look: { shape: 'tee' },
  },
  {
    id: 'green-polo',
    name: 'Green polo',
    category: 'shirts',
    color: 'green',
    price: 22,
    sizes: ['M', 'L', 'XL'],
    description: 'Pique polo shirt with a two-button placket.',
    alt: 'Green polo shirt with a collar and two buttons',
    look: { shape: 'polo' },
  },
  {
    id: 'red-polo',
    name: 'Red polo',
    category: 'shirts',
    color: 'red',
    price: 24,
    sizes: ['L', 'XL'],
    description: 'Pique polo shirt with a two-button placket.',
    alt: 'Red polo shirt with a collar and two buttons',
    look: { shape: 'polo' },
  },
  {
    id: 'blue-sneakers',
    name: 'Blue sneakers',
    category: 'shoes',
    color: 'blue',
    price: 79.99,
    sizes: ['40', '41', '42', '43', '44'],
    description: 'Low-top canvas sneakers with a white sole.',
    alt: 'Blue low-top sneaker with white laces and sole',
    look: { shape: 'sneaker' },
  },
  {
    id: 'white-sneakers',
    name: 'White sneakers',
    category: 'shoes',
    color: 'white',
    price: 69.99,
    sizes: ['39', '40', '41', '42'],
    description: 'Low-top leather sneakers.',
    alt: 'White low-top sneaker',
    look: { shape: 'sneaker' },
  },
  {
    id: 'black-boots',
    name: 'Black boots',
    category: 'shoes',
    color: 'black',
    price: 119,
    sizes: ['41', '42', '43', '44', '45'],
    description: 'Lace-up leather ankle boots.',
    alt: 'Black lace-up ankle boot',
    look: { shape: 'boot' },
  },
  {
    id: 'red-runners',
    name: 'Red runners',
    category: 'shoes',
    color: 'red',
    price: 89,
    sizes: ['40', '42', '44'],
    description: 'Lightweight running shoes.',
    alt: 'Red running shoe with a white side stripe',
    look: { shape: 'sneaker', details: ['stripe'] },
  },
  {
    id: 'brown-loafers',
    name: 'Brown loafers',
    category: 'shoes',
    color: 'brown',
    price: 99,
    sizes: ['41', '42', '43'],
    description: 'Slip-on suede loafers.',
    alt: 'Brown slip-on loafer',
    look: { shape: 'loafer' },
  },
  {
    id: 'black-hat',
    name: 'Black hat',
    category: 'hats',
    color: 'black',
    price: 24.99,
    sizes: ['one size'],
    description: 'Wool felt fedora with a red band.',
    alt: 'Black fedora with a dark red band',
    look: { shape: 'fedora' },
  },
  {
    id: 'red-cap',
    name: 'Red cap',
    category: 'hats',
    color: 'red',
    price: 14.99,
    sizes: ['one size'],
    description: 'Six-panel baseball cap.',
    alt: 'Red baseball cap',
    look: { shape: 'cap' },
  },
  {
    id: 'blue-beanie',
    name: 'Blue beanie',
    category: 'hats',
    color: 'blue',
    price: 12,
    sizes: ['one size'],
    description: 'Rib-knit beanie with a pompom.',
    alt: 'Blue knitted beanie with a pompom',
    look: { shape: 'beanie' },
  },
  {
    id: 'straw-hat',
    name: 'Straw hat',
    category: 'hats',
    color: 'beige',
    price: 29,
    sizes: ['M', 'L'],
    description: 'Woven straw hat with a navy band.',
    alt: 'Beige woven straw hat with a navy band',
    look: { shape: 'straw' },
  },
  {
    id: 'grey-hoodie',
    name: 'Grey hoodie',
    category: 'sweaters',
    color: 'grey',
    price: 49,
    sizes: ['S', 'M', 'L', 'XL'],
    description: 'Fleece hoodie with a front pocket.',
    alt: 'Grey hooded sweatshirt with drawstrings and a front pocket',
    look: { shape: 'hoodie' },
  },
  {
    id: 'red-hoodie',
    name: 'Red hoodie',
    category: 'sweaters',
    color: 'red',
    price: 52,
    sizes: ['M', 'L'],
    description: 'Fleece hoodie with a front pocket.',
    alt: 'Red hooded sweatshirt with drawstrings and a front pocket',
    look: { shape: 'hoodie' },
  },
  {
    id: 'navy-sweater',
    name: 'Navy sweater',
    category: 'sweaters',
    color: 'blue',
    price: 59,
    sizes: ['S', 'M', 'L'],
    description: 'Merino crew-neck sweater.',
    alt: 'Navy blue crew-neck knitted sweater',
    look: { shape: 'sweater', shade: '#1f2a44' },
  },
];

export const popularProductIds = ['red-shirt-premium', 'blue-sneakers', 'black-hat', 'grey-hoodie'];

export function findProduct(id: string): Product | undefined {
  return products.find((product) => product.id === id);
}

export interface SearchFilters {
  /** Free text; every word must match the name, category or colour. */
  query?: string;
  category?: string;
  color?: string;
  size?: string;
  maxPrice?: number;
}

/** Matching products, cheapest first. */
export function searchProducts(filters: SearchFilters = {}): Product[] {
  const words = (filters.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const color = filters.color?.toLowerCase();
  const category = filters.category?.toLowerCase();
  const maxPrice = filters.maxPrice;

  return products
    .filter((product) => {
      const text = `${product.name} ${product.category} ${product.color}`.toLowerCase();
      return (
        words.every((word) => text.includes(word)) &&
        (!color || product.color === color) &&
        (!category || product.category === category) &&
        (!filters.size || product.sizes.includes(filters.size)) &&
        (maxPrice === undefined || Number.isNaN(maxPrice) || product.price <= maxPrice)
      );
    })
    .sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
}

export function formatPrice(price: number): string {
  return `€${price.toFixed(2)}`;
}
