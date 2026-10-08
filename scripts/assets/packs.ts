/** Third-party art packs. Every pack must ship a License.txt that says CC0; download.ts checks it. */
export interface Pack {
  id: string;
  name: string;
  author: string;
  page: string;
  zip: string;
  /** Path inside the zip of the packed (no spacing) tilesheet. */
  sheet: string;
  tile: number;
  columns: number;
}

export const PACKS: Pack[] = [
  {
    id: 'tiny-farm',
    name: 'Tiny Farm',
    author: 'Kenney',
    page: 'https://kenney.nl/assets/tiny-farm',
    zip: 'https://kenney.nl/media/pages/assets/tiny-farm/dfded1ae3e-1782913588/kenney_tiny-farm.zip',
    sheet: 'Tilemap/tilemap_packed.png',
    tile: 16,
    columns: 12,
  },
  {
    id: 'tiny-town',
    name: 'Tiny Town',
    author: 'Kenney',
    page: 'https://kenney.nl/assets/tiny-town',
    zip: 'https://kenney.nl/media/pages/assets/tiny-town/a415fbeb49-1735736916/kenney_tiny-town.zip',
    sheet: 'Tilemap/tilemap_packed.png',
    tile: 16,
    columns: 12,
  },
];
