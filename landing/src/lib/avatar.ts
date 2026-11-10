/** Generated avatars (initials on a tinted disc, small stripe pattern). No person is depicted; no third-party art. */

const AVATAR_TONES = ['#e9b765', '#9fcfbd', '#e59c84', '#b9c6f0', '#e8dcc4', '#c9b6e4'];

export function avatar(name: string, size = 36): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const bg = AVATAR_TONES[h % AVATAR_TONES.length]!;
  const initials = name.replace(/\..*$/, '').slice(0, 2).replace(/^./, (c) => c.toUpperCase());
  const rot = (h >> 3) % 180;
  return `<svg class="avatar" width="${size}" height="${size}" viewBox="0 0 36 36" aria-hidden="true">
    <rect width="36" height="36" fill="${bg}"/>
    <path d="M-8 30h52M-8 37h52" stroke="#1a1915" stroke-opacity=".12" stroke-width="3" transform="rotate(${rot} 18 18)"/>
    <text x="18" y="22.5" text-anchor="middle" font-size="12.5" font-weight="650" fill="#1a1915">${initials}</text>
  </svg>`;
}
