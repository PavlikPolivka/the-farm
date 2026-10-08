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
];

export function assertValid(def: SpriteDef, keys: readonly string[]): void {
  const width = def.rows[0]!.length;
  def.rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`${def.name}: row ${y} has width ${row.length}, expected ${width}`);
    for (const ch of row) if (ch !== '.' && !keys.includes(ch)) throw new Error(`${def.name}: unknown palette key "${ch}"`);
  });
}
