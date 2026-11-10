/**
 * Original line illustrations of the 12 commons, drawn for COMMONKIT (no third-party art).
 * One style: 120-unit grid, round-capped ink line (class "ln"), one offset flat colour block (class "blk")
 * printed slightly out of register behind the line, plus small accent marks (class "acc").
 */

type Tone = 'brass' | 'sage' | 'clay';

interface Art {
  tone: Tone;
  block: string;
  line: string;
  acc?: string;
}

const ART: Record<string, Art> = {
  printer: {
    tone: 'brass',
    block: '<rect x="34" y="58" width="56" height="34" rx="4"/>',
    line: `<rect x="22" y="24" width="76" height="74" rx="5"/>
      <path d="M22 42h76"/>
      <rect x="51" y="35" width="18" height="14" rx="2.5"/>
      <path d="M57 49l3 6 3-6"/>
      <path d="M31 84h58M37 84v6M83 84v6"/>
      <path d="M50 84c0-8 3-12 6-16h8c3 4 6 8 6 16"/>
      <path d="M54 76h12"/>
      <path d="M16 100h88"/>
      <circle cx="88" cy="13" r="7"/><circle cx="88" cy="13" r="2"/>
      <path d="M82 18c-6 6-12 10-16 17"/>`,
    acc: '<path d="M60 58v3"/><path d="M55 60l-2 2M65 60l2 2"/>',
  },
  laser: {
    tone: 'clay',
    block: '<rect x="26" y="62" width="62" height="28" rx="3"/>',
    line: `<rect x="14" y="56" width="92" height="40" rx="5"/>
      <path d="M14 56l10-24h72l10 24"/>
      <path d="M31 38h58l6 13H25z"/>
      <rect x="88" y="64" width="12" height="24" rx="2"/>
      <circle cx="94" cy="71" r="2.2"/><path d="M91 80h6"/>
      <rect x="48" y="62" width="14" height="7" rx="1.5"/>
      <path d="M24 86h56"/>
      <path d="M22 96v6M98 96v6"/>`,
    acc: '<path d="M55 70v12" stroke-dasharray="2 3"/><path d="M50 85l-3 2M60 85l3 2M55 86v3"/>',
  },
  washer: {
    tone: 'sage',
    block: '<circle cx="65" cy="73" r="21"/>',
    line: `<rect x="26" y="16" width="68" height="88" rx="7"/>
      <path d="M26 35h68"/>
      <circle cx="82" cy="26" r="4"/>
      <path d="M35 26h12M35 30h7"/>
      <circle cx="60" cy="68" r="23"/>
      <circle cx="60" cy="68" r="16"/>
      <path d="M45 72c5-3 9 3 15 0s10-3 15 0"/>
      <path d="M34 104v5M86 104v5"/>`,
    acc: '<circle cx="54" cy="62" r="1.6"/><circle cx="64" cy="59" r="1.2"/>',
  },
  fridge: {
    tone: 'sage',
    block: '<rect x="42" y="50" width="44" height="52" rx="4"/>',
    line: `<rect x="34" y="10" width="52" height="98" rx="7"/>
      <path d="M34 44h52"/>
      <path d="M42 22v14M42 52v20"/>
      <path d="M59 58l18-3 2 15-18 3z"/>
      <path d="M63 63l10-1.6M64 67l7-1.1"/>
      <circle cx="68" cy="24" r="4.5"/><path d="M68 19.5c1-3 3-4 5-4"/>
      <path d="M40 108v4M80 108v4"/>`,
    acc: '<path d="M96 30c4 2 4 8 0 10M100 26c7 4 7 14 0 18"/>',
  },
  bike: {
    tone: 'brass',
    block: '<rect x="10" y="56" width="36" height="22" rx="3"/>',
    line: `<circle cx="24" cy="94" r="10"/>
      <circle cx="94" cy="88" r="15"/>
      <rect x="6" y="60" width="38" height="20" rx="3"/>
      <path d="M24 94l8-14"/>
      <path d="M44 80h18l32 8"/>
      <path d="M48 46l4 18-10 16"/><path d="M42 44h13"/>
      <path d="M52 62l10 18"/>
      <path d="M62 80l8-26"/><path d="M64 52h13"/>
      <path d="M70 56l24 32"/>
      <circle cx="62" cy="80" r="4"/>`,
    acc: '<path d="M12 67h24M12 73h16"/>',
  },
  charger: {
    tone: 'sage',
    block: '<rect x="44" y="20" width="36" height="80" rx="6"/>',
    line: `<rect x="38" y="14" width="36" height="84" rx="7"/>
      <rect x="45" y="22" width="22" height="16" rx="2"/>
      <path d="M57 25l-4 6h5l-4 6"/>
      <rect x="51" y="50" width="10" height="11" rx="2"/>
      <path d="M56 61c0 18 32 14 30 30-1 9-14 11-15 3"/>
      <path d="M67 92l4 2-2 6-5-2z"/>
      <path d="M28 100h56"/>`,
    acc: '<path d="M80 22l6-4M82 30h7"/>',
  },
  gpu: {
    tone: 'brass',
    block: '<rect x="24" y="36" width="82" height="22" rx="3"/>',
    line: `<rect x="16" y="30" width="86" height="22" rx="3"/>
      <rect x="16" y="56" width="86" height="22" rx="3"/>
      <rect x="16" y="82" width="86" height="18" rx="3"/>
      <circle cx="31" cy="41" r="6"/><path d="M27 41h8M31 37v8"/>
      <circle cx="31" cy="67" r="6"/><path d="M27 67h8M31 63v8"/>
      <path d="M64 37h30M64 41h30M64 45h30"/>
      <path d="M64 63h30M64 67h30M64 71h30"/>
      <path d="M26 91h44"/>`,
    acc: '<circle cx="46" cy="41" r="1.6"/><circle cx="52" cy="41" r="1.6"/><circle cx="46" cy="67" r="1.6"/>',
  },
  tractor: {
    tone: 'clay',
    block: '<rect x="36" y="34" width="28" height="30" rx="3"/>',
    line: `<circle cx="38" cy="84" r="20"/><circle cx="38" cy="84" r="6"/>
      <circle cx="92" cy="92" r="11"/><circle cx="92" cy="92" r="3"/>
      <path d="M30 64V30h28v34"/>
      <path d="M36 36h16v18H36z"/>
      <path d="M58 64h40v18"/>
      <path d="M58 64v20M58 84h22"/>
      <path d="M84 64V48"/>
      <path d="M26 30h36"/>`,
    acc: '<circle cx="88" cy="40" r="3"/><circle cx="94" cy="32" r="4"/>',
  },
  ladder: {
    tone: 'brass',
    block: '<path d="M46 20h22l16 86H62z"/>',
    line: `<path d="M34 108L52 12M66 108L82 12"/>
      <path d="M50 24h29M47 40h29M44 56h29M41 72h29M38 88h29"/>
      <path d="M82 14l14 8-4 7-12-5"/>
      <circle cx="91" cy="21" r="1.6"/>`,
    acc: '<path d="M24 108h72"/>',
  },
  music: {
    tone: 'clay',
    block: '<rect x="62" y="58" width="42" height="44" rx="4"/>',
    line: `<rect x="56" y="52" width="46" height="50" rx="5"/>
      <circle cx="79" cy="82" r="12"/><circle cx="79" cy="82" r="4"/>
      <path d="M62 60h10M84 60h12"/>
      <path d="M22 98c-6-6-4-16 4-18-2-8 4-14 11-12 6 2 7 9 4 14 7 3 7 13 1 17-6 4-15 4-20-1z"/>
      <path d="M36 74L52 18"/><path d="M49 16l7 2-1 6-7-2z"/>
      <path d="M28 88l6 2"/>`,
    acc: '<path d="M14 28v-10l10-3v10"/><circle cx="12" cy="29" r="2.5"/><circle cx="22" cy="26" r="2.5"/>',
  },
  generator: {
    tone: 'brass',
    block: '<rect x="26" y="42" width="66" height="44" rx="4"/>',
    line: `<rect x="18" y="38" width="80" height="50" rx="5"/>
      <path d="M18 50h80"/>
      <rect x="28" y="58" width="30" height="20" rx="2"/>
      <circle cx="78" cy="68" r="8"/><path d="M75 68h6"/>
      <path d="M40 38v-8h36v8"/>
      <circle cx="30" cy="94" r="7"/><circle cx="86" cy="94" r="7"/>
      <path d="M98 50h8v26"/>`,
    acc: '<path d="M52 18l-5 8h6l-5 8"/>',
  },
  microscope: {
    tone: 'sage',
    block: '<rect x="40" y="62" width="48" height="12" rx="3"/>',
    line: `<rect x="32" y="96" width="58" height="9" rx="3"/>
      <path d="M76 96c14-14 14-40-4-54"/>
      <rect x="49" y="16" width="13" height="34" rx="3" transform="rotate(-24 55 33)"/>
      <rect x="44" y="7" width="11" height="9" rx="2" transform="rotate(-24 50 11)"/>
      <path d="M62 50v8"/>
      <path d="M38 66h42"/><path d="M44 66v-3M72 66v-3"/>
      <circle cx="82" cy="64" r="5"/>
      <path d="M60 82h8M64 78v8"/>`,
    acc: '<path d="M36 12l-5-4M34 20h-6"/>',
  },
};

export const ART_KEYS = Object.keys(ART);

/** Inline SVG for an asset icon key from a profile's `meta.icon`. */
export function art(icon: string, label: string, extraClass = ''): string {
  const a = ART[icon];
  if (!a) throw new Error(`no illustration for icon "${icon}"`);
  return `<svg class="art art-${a.tone} ${extraClass}" viewBox="0 0 120 120" role="img" aria-label="${label}">
    <g class="blk" transform="translate(4 3)">${a.block}</g>
    <g class="ln">${a.line}</g>${a.acc ? `<g class="ln acc">${a.acc}</g>` : ''}
  </svg>`;
}

/** COMMONKIT mark: an equipment tag with its eyelet and string. */
export const LOGO_MARK = `<svg class="mark" viewBox="0 0 32 32" aria-hidden="true">
  <g transform="rotate(-10 16 16)">
    <path class="mark-tag" d="M10 5h12l6 7v14a2.5 2.5 0 0 1-2.5 2.5h-19A2.5 2.5 0 0 1 4 26V12z"/>
    <circle class="mark-hole" cx="16" cy="11.5" r="2.6"/>
    <path class="mark-line" d="M9.5 19h13M9.5 23.5h8"/>
  </g>
</svg>`;

const AVATAR_TONES = ['#e9b765', '#9fcfbd', '#e59c84', '#b9c6f0', '#e8dcc4', '#c9b6e4'];

/** Generated avatar: initials on a tinted disc with a small stripe pattern. No person is depicted. */
export function avatar(name: string, size = 36): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const bg = AVATAR_TONES[h % AVATAR_TONES.length]!;
  const initials = name
    .replace(/\..*$/, '')
    .slice(0, 2)
    .replace(/^./, (c) => c.toUpperCase());
  const rot = (h >> 3) % 180;
  return `<svg class="avatar" width="${size}" height="${size}" viewBox="0 0 36 36" aria-hidden="true">
    <defs><clipPath id="av-${h}"><circle cx="18" cy="18" r="18"/></clipPath></defs>
    <g clip-path="url(#av-${h})"><rect width="36" height="36" fill="${bg}"/>
    <path d="M-4 30h44M-4 36h44" stroke="#1a1915" stroke-opacity=".12" stroke-width="3" transform="rotate(${rot} 18 18)"/></g>
    <text x="18" y="22.5" text-anchor="middle" font-size="12.5" font-weight="650" fill="#1a1915">${initials}</text>
  </svg>`;
}
