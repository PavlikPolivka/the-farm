/**
 * Sprites the Kenney packs don't have, drawn as palette-indexed grids (one character per pixel,
 * see palette.ts). Claude Code can't produce raster images directly, so this is how it draws.
 */
export interface SpriteDef {
  name: string;
  rows: string[];
}

const WINDMILL: SpriteDef = {
  name: 'windmill',
  rows: [
    '......kkkk......',
    '.....kRrrRk.....',
    '....kRrrrrRk....',
    '...kRrrrrrrRk...',
    '...kkkkkkkkkk...',
    '....kTttttok....',
    '....kTttttok....',
    '....kTtkktok....',
    '....kTksSkok....',
    '....kTtkktok....',
    '....kTttttok....',
    '...kTttttttok...',
    '...kTttttttok...',
    '...kTttttttok...',
    '...kTttttttok...',
    '..kTttttttttok..',
    '..kTttttttttok..',
    '..kTttkkkkttok..',
    '..kTttkBBkttok..',
    '..kTttkBBkttok..',
    '.kTtttkBBktttok.',
    '.kTtttkBBktttok.',
    '.kTtttkBBktttok.',
    '.kkkkkkkkkkkkkk.',
  ],
};

/** One sail pointing up; the build rotates it four times around the hub. */
const SAIL = [
  'kkkkkk',
  'kWlWlk',
  'klWlWk',
  'kWlWlk',
  'klWlWk',
  'kWlWlk',
  'klWlWk',
  'kWlWlk',
  'klWlWk',
  'kWlWlk',
  'kkBBkk',
  '..BB..',
  '..BB..',
];

function windmillSails(): SpriteDef {
  const size = 32;
  const grid: string[][] = Array.from({ length: size }, () => Array<string>(size).fill('_'));
  const put = (x: number, y: number, ch: string) => {
    if (ch !== '.' && ch !== '_') grid[y]![x] = ch;
  };
  // Sail occupies columns 13..18, rows 1..13; rotate (x, y) -> (31 - y, x) for each quarter turn.
  for (let turn = 0; turn < 4; turn++) {
    SAIL.forEach((row, sy) =>
      [...row].forEach((ch, sx) => {
        let x = 13 + sx;
        let y = 1 + sy;
        for (let i = 0; i < turn; i++) [x, y] = [31 - y, x];
        put(x, y, ch);
      }),
    );
  }
  ['kkkk', 'kbbk', 'kbbk', 'kkkk'].forEach((row, dy) => [...row].forEach((ch, dx) => put(14 + dx, 14 + dy, ch)));
  return { name: 'windmill-sails', rows: grid.map((r) => r.join('').replace(/_/g, '.')) };
}

const WOOL: SpriteDef = {
  name: 'wool',
  rows: [
    '................',
    '................',
    '.....kkkkkk.....',
    '....kWWWWlWk....',
    '...kWWlWWWWlk...',
    '..kWWWWWlWWWWk..',
    '..kWlWWWWWWlWk..',
    '..kWWWWlWWWWWk..',
    '..kWWlWWWWWlWk..',
    '..kWWWWWWlWWWk..',
    '...klWWWWWWWk...',
    '....kllWWllk....',
    '.....kkkkkk.....',
    '................',
    '................',
    '................',
  ],
};

const HONEY: SpriteDef = {
  name: 'honey',
  rows: [
    '................',
    '....kkkkkkkk....',
    '....kBBBBBBk....',
    '....kkkkkkkk....',
    '...kWwwwwwwWk...',
    '...kyyyyyyyyk...',
    '..kyWyyyyyyYyk..',
    '..kyWyyyyyyYyk..',
    '..kyWykkkkyYyk..',
    '..kyyykTTkyYyk..',
    '..kyyykkkkyYyk..',
    '..kyyyyyyyyYyk..',
    '...kYyyyyyyYk...',
    '....kkkkkkkk....',
    '................',
    '................',
  ],
};

const HAND: SpriteDef = {
  name: 'hand',
  rows: [
    '......kk........',
    '.....kppk.......',
    '.....kppk.......',
    '.....kppk.......',
    '.....kppkkkkkk..',
    '..kk.kppkppkppk.',
    '.kppkkppkppkppk.',
    '.kppppppppppppk.',
    '.kPpppppppppppk.',
    '..kPppppppppppk.',
    '..kPPpppppppppk.',
    '...kPPppppppk...',
    '....kPPPPPPk....',
    '....kWWWWWWk....',
    '....kwwwwwwk....',
    '....kkkkkkkk....',
  ],
};

const SPARKLE: SpriteDef = {
  name: 'sparkle',
  rows: [
    '................',
    '...........y....',
    '..........yWy...',
    '...........y....',
    '................',
    '................',
    '....y...........',
    '...yWy..........',
    '..yWWWy.........',
    '...yWy..........',
    '....y...........',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
};

const STAR: SpriteDef = {
  name: 'star',
  rows: [
    '................',
    '.......kk.......',
    '......kyyk......',
    '......kyyk......',
    '.kkkkkkyykkkkkk.',
    '.kyyyyyyyyyyyyk.',
    '..kyyyyWyyyyyk..',
    '...kyyyyyyyyk...',
    '....kyyyyyyk....',
    '....kyyyyyyk....',
    '...kyyykkyyyk...',
    '...kyyk..kyyk...',
    '..kyyk....kyyk..',
    '..kkk......kkk..',
    '................',
    '................',
  ],
};

const SPRINKLER: SpriteDef = {
  name: 'sprinkler',
  rows: [
    '................',
    '..S...S...S.....',
    '.S..S.....S..S..',
    '....S..S.S......',
    '......kkkk......',
    '.....kllllk.....',
    '.....kgggGk.....',
    '......kglk......',
    '......kglk......',
    '......kglk......',
    '......kglk......',
    '......kglk......',
    '....kkkglkkk....',
    '....kNnnnnNk....',
    '....kkkkkkkk....',
    '................',
  ],
};

const SCARECROW: SpriteDef = {
  name: 'scarecrow',
  rows: [
    '......kkkk......',
    '.....kBBBBk.....',
    '...kkkkkkkkkk...',
    '.....kyTTyk.....',
    '.....kTkkTk.....',
    '.....kTTTTk.....',
    '.kkkkkkrrkkkkkk.',
    '.kyrrrrrrrrrryk.',
    '.kkkkkrRrrkkkkk.',
    '.....krRrrk.....',
    '.....krrRrk.....',
    '.....kkbbkk.....',
    '......kbbk......',
    '......kbbk......',
    '......kbbk......',
    '....nnkbbknn....',
  ],
};

const LOCK: SpriteDef = {
  name: 'lock',
  rows: [
    '................',
    '................',
    '......kkkk......',
    '.....kggggk.....',
    '....kgk..kgk....',
    '....kgk..kgk....',
    '....kgk..kgk....',
    '...kkkkkkkkkk...',
    '...kyyyyyyyYk...',
    '...kyyyykkyYk...',
    '...kyyyykkyYk...',
    '...kyyyyyyyYk...',
    '...kYyyyyyyYk...',
    '...kkkkkkkkkk...',
    '................',
    '................',
  ],
};

const GEAR: SpriteDef = {
  name: 'gear',
  rows: [
    '................',
    '.......kk.......',
    '...kk.kggk.kk...',
    '..kggkkggkkggk..',
    '...kggggggggk...',
    '..kgggGkkGgggk..',
    '.kkggGk..kGggkk.',
    'kggggk....kggggk',
    'kggggk....kggggk',
    '.kkggGk..kGggkk.',
    '..kgggGkkGgggk..',
    '...kggggggggk...',
    '..kggkkggkkggk..',
    '...kk.kggk.kk...',
    '.......kk.......',
    '................',
  ],
};

/** App icon: a small red barn (kept from M0, now in the master palette). */
const BARN_ICON: SpriteDef = {
  name: 'barn-icon',
  rows: [
    '......kkkk......',
    '....kkrrrrkk....',
    '..kkrrrrrrrrkk..',
    '.krrrrrrrrrrrrk.',
    'kWWWWWWWWWWWWWWk',
    '.krrrrrrrrrrrrk.',
    '.krrkkkkkkkkrrk.',
    '.krrkyyWWyykrrk.',
    '.krRkyWyyWykRrk.',
    '.krRkWyyyyWkRrk.',
    '.krRkyWyyWykRrk.',
    '.krRkyyWWyykRrk.',
    '.krRkbbbbbbkRrk.',
    'nkkkkkkkkkkkkkkn',
    'nnnNnnnnnNnnnnnn',
    'NnnnnnNnnnnnnNnn',
  ],
};

/** Leaderboards: a gold cup. */
const TROPHY: SpriteDef = {
  name: 'trophy',
  rows: [
    '................',
    '...kkkkkkkkkk...',
    '.kkkWyyyyyyYkkk.',
    'kk.kWyyyyyyYk.kk',
    'k..kWyyyyyyYk..k',
    'k..kyyyyyyyYk..k',
    'kk.kyyyyyyyYk.kk',
    '.kkkyyyyyyYYkkk.',
    '....kyyyyyYk....',
    '.....kyyyYk.....',
    '......kyYk......',
    '......kyYk......',
    '.....kkyYkk.....',
    '....kBBBBBBk....',
    '....kBbbbbBk....',
    '....kkkkkkkk....',
  ],
};

const CROWN: SpriteDef = {
  name: 'crown',
  rows: [
    '................',
    '................',
    '................',
    '.k.....kk.....k.',
    'kyk...kyyk...kyk',
    'kyyk.kyyyyk.kyyk',
    'kyyykyyyyyykyyyk',
    'kyyyyyyrryyyyyyk',
    'kyyyyyyrryyyyyyk',
    'kyySyyyyyyyySyyk',
    'kYyyyyyyyyyyyyYk',
    'kYYYYYYYYYYYYYYk',
    'kkkkkkkkkkkkkkkk',
    '................',
    '................',
    '................',
  ],
};

/** Harvest Rush: a weed (don't tap). */
const WEED: SpriteDef = {
  name: 'weed',
  rows: [
    '................',
    '......k...k.....',
    '..k..kGk.kGk..k.',
    '.kGk.kGGkGGk.kGk',
    '.kGGkkGNGGkkkGGk',
    '..kGNkkGNGkkNGk.',
    '..kNGNkGNkkGNNk.',
    '...kNNGkNkGNNk..',
    '.k..kNNNNNNNk..k',
    'kGk..kNNNNNk..kG',
    'kGNk.kkNNNkk.kNG',
    '.kNNkkGNNNGkkNNk',
    '..kNNNNNNNNNNNk.',
    '...kkNNNNNNNkk..',
    '....bbkkkkkkbb..',
    '..bbbbbbbbbbbbb.',
  ],
};

/** Crop Merge, level 1: a few seeds. */
const SEED: SpriteDef = {
  name: 'seed',
  rows: [
    '................',
    '................',
    '................',
    '................',
    '.....kk.........',
    '....kTtk...kk...',
    '....ktok..kTtk..',
    '.....kk...ktok..',
    '...........kk...',
    '.......kk.......',
    '......kTtk......',
    '......ktok..kk..',
    '.......kk..kTtk.',
    '...kk......ktok.',
    '..kTtk......kk..',
    '..ktok..........',
  ],
};

/** Pexeso: the back of a card. */
const CARD_BACK: SpriteDef = {
  name: 'card-back',
  rows: [
    '.kkkkkkkkkkkkkk.',
    'kSSSSSSSSSSSSSSk',
    'kSsSSSSSSSSSSsSk',
    'kSSSSSSSSSSSSSSk',
    'kSSSSSSkkSSSSSSk',
    'kSSSSSkyykSSSSSk',
    'kSSSSkyyyykSSSSk',
    'kSSSkyyWyyykSSSk',
    'kSSSkyyyyyykSSSk',
    'kSSSSkyyyykSSSSk',
    'kSSSSSkyykSSSSSk',
    'kSSSSSSkkSSSSSSk',
    'kSSSSSSSSSSSSSSk',
    'kSsSSSSSSSSSSsSk',
    'kSSSSSSSSSSSSSSk',
    '.kkkkkkkkkkkkkk.',
  ],
};

/** Water Pipes tiles, drawn from their openings (N=1, E=2, S=4, W=8), dry and wet. */
export const PIPE_SHAPES = { end: 1, straight: 5, corner: 3, tee: 7, cross: 15 } as const;
function pipe(name: string, mask: number, wet: boolean): SpriteDef {
  const inBand = (v: number) => v >= 5 && v <= 10;
  const shape = (x: number, y: number) => {
    if (x < 0 || y < 0 || x > 15 || y > 15) return false;
    if (inBand(x) && inBand(y)) return true;
    if (inBand(x) && y < 5 && mask & 1) return true;
    if (inBand(y) && x > 10 && mask & 2) return true;
    if (inBand(x) && y > 10 && mask & 4) return true;
    if (inBand(y) && x < 5 && mask & 8) return true;
    return false;
  };
  const rows: string[] = [];
  for (let y = 0; y < 16; y++) {
    let row = '';
    for (let x = 0; x < 16; x++) {
      if (!shape(x, y)) {
        row += '.';
        continue;
      }
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nx = x + dx!, ny = y + dy!;
        return nx >= 0 && ny >= 0 && nx <= 15 && ny <= 15 && !shape(nx, ny);
      });
      const light = (x === 6 && inBand(y)) || (y === 6 && inBand(x));
      row += edge ? 'k' : wet ? (light ? 's' : 'S') : light ? 'w' : 'l';
    }
    rows.push(row);
  }
  return { name, rows };
}
const PIPES = Object.entries(PIPE_SHAPES).flatMap(([shape, mask]) => [pipe(`pipe-${shape}`, mask, false), pipe(`pipe-${shape}-wet`, mask, true)]);

/** Egg Sort: four kinds, each with its own colour AND pattern (never colour alone). */
function egg(i: number): SpriteDef {
  const [fill, mark] = (['rW', 'SW', 'yY', 'nN'] as const)[i]!;
  const rows: string[] = [];
  for (let y = 0; y < 16; y++) {
    let row = '';
    for (let x = 0; x < 16; x++) {
      const inside = (px: number, py: number) => {
        const ry = py < 8 ? 7.2 : 6.2;
        return ((px - 7.5) / 5.6) ** 2 + ((py - 8.5) / ry) ** 2 <= 1;
      };
      if (!inside(x, y)) {
        row += '.';
        continue;
      }
      const edge = !inside(x + 1, y) || !inside(x - 1, y) || !inside(x, y + 1) || !inside(x, y - 1);
      let marked = false;
      if (i === 0) marked = (x + y) % 4 === 0 && y % 2 === 0; // dots
      if (i === 1) marked = y % 4 === 1; // stripes
      if (i === 2) marked = (y + Math.abs(((x % 4) - 2))) % 5 === 0; // zigzag
      if (i === 3) marked = Math.floor(x / 3) % 2 === Math.floor(y / 3) % 2; // checks
      row += edge ? 'k' : x === 5 && y === 4 ? 'W' : marked ? mark : fill;
    }
    rows.push(row);
  }
  return { name: `egg-${i}`, rows };
}
const EGGS = [0, 1, 2, 3].map(egg);

export const GENERATED: SpriteDef[] = [
  WINDMILL,
  windmillSails(),
  WOOL,
  HONEY,
  HAND,
  SPARKLE,
  STAR,
  SPRINKLER,
  SCARECROW,
  LOCK,
  GEAR,
  BARN_ICON,
  TROPHY,
  CROWN,
  WEED,
  SEED,
  CARD_BACK,
  ...PIPES,
  ...EGGS,
];

export function assertValid(def: SpriteDef, keys: readonly string[]): void {
  const width = def.rows[0]!.length;
  def.rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`${def.name}: row ${y} has width ${row.length}, expected ${width}`);
    for (const ch of row) if (ch !== '.' && !keys.includes(ch)) throw new Error(`${def.name}: unknown palette key "${ch}"`);
  });
}
