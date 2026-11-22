/**
 * Snow-covered Himalayan range, drawn as SVG (crisp at any size, no image download).
 * Each peak gets a snow cap proportional to its height, clipped to the ridge shape.
 * Peaks sit in the lower half and the left side stays low, so the title reads cleanly on the sky.
 */

const W = 1600;
const H = 320;

const ranges = [
  {
    id: "far",
    fill: "#b3c4d8",
    shade: "#9fb3cb",
    snowDepth: 0.85,
    snow: "#fbfdff",
    pts: [[0, 262], [140, 236], [280, 246], [420, 204], [540, 222], [660, 170], [780, 118], [880, 168], [980, 144], [1080, 182], [1200, 108], [1320, 166], [1440, 148], [1540, 196], [1600, 186]],
  },
  {
    id: "mid",
    fill: "#7f97b2",
    shade: "#6f88a5",
    snowDepth: 0.6,
    snow: "#eef3f9",
    pts: [[0, 292], [160, 252], [320, 272], [470, 232], [620, 266], [780, 222], [920, 258], [1060, 214], [1200, 254], [1340, 226], [1480, 260], [1600, 240]],
  },
  {
    id: "near",
    fill: "#4f6580",
    shade: "#465b75",
    snowDepth: 0,
    snow: "",
    pts: [[0, 308], [200, 286], [380, 302], [560, 288], [760, 306], [960, 284], [1160, 304], [1360, 290], [1600, 302]],
  },
];

const toPoints = (pts: number[][]) => `${pts.map((p) => p.join(",")).join(" ")} ${W},${H} 0,${H}`;

const summits = (pts: number[][]) =>
  pts.map((p, i) => i).filter((i) => i > 0 && i < pts.length - 1 && pts[i][1] < pts[i - 1][1] && pts[i][1] < pts[i + 1][1]);

/** Shadowed right-hand face of each peak. */
function shadows(pts: number[][]) {
  return summits(pts)
    .map((i) => {
      const [x, y] = pts[i];
      const [nx, ny] = pts[i + 1];
      return `M${x},${y} L${nx},${ny} L${x + (nx - x) * 0.4},${ny} Z`;
    })
    .join(" ");
}

/** Snow cap per peak: covers the top ~45% of each summit, with a soft wavy lower edge. */
function snowCaps(pts: number[][], depth: number) {
  return summits(pts)
    .map((i) => {
      const [x, y] = pts[i];
      const [lx, ly] = pts[i - 1];
      const [rx, ry] = pts[i + 1];
      const bottom = y + (Math.min(ly, ry) - y) * depth;
      let d = `M${lx},0 H${rx} V${bottom}`;
      for (let xx = rx; xx >= lx; xx -= 6) d += ` L${xx},${(bottom + 5 * Math.sin(xx / 11) + 3 * Math.sin(xx / 4.3)).toFixed(1)}`;
      return d + " Z";
    })
    .join(" ");
}

/** A few pine clusters along the near ridge (not a uniform fence). */
function pines() {
  const clusters = [[40, 9], [330, 6], [700, 8], [1010, 5], [1290, 9]];
  const d: string[] = [];
  clusters.forEach(([start, n], c) => {
    for (let i = 0; i < n; i++) {
      const x = start + i * 15 + ((i * 7 + c * 3) % 6);
      const h = 18 + ((i * 13 + c * 5) % 16);
      const base = H - 4 + ((i * 3) % 5);
      d.push(`M${x},${base} L${x + 6},${base - h} L${x + 12},${base} Z`);
    }
  });
  return d.join(" ");
}

export function MountainBanner({ className }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="mb-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#cfdff0" />
          <stop offset="55%" stopColor="#e9f0f7" />
          <stop offset="100%" stopColor="#f5f8fb" />
        </linearGradient>
        <radialGradient id="mb-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#fff8ea" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#fff8ea" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="mb-mist" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f3f6fa" stopOpacity="0" />
          <stop offset="100%" stopColor="#f3f6fa" stopOpacity="0.7" />
        </linearGradient>
        {ranges.map((r) => (
          <clipPath key={r.id} id={`mb-${r.id}`}>
            <polygon points={toPoints(r.pts)} />
          </clipPath>
        ))}
        {ranges.filter((r) => r.snowDepth > 0).map((r) => (
          <clipPath key={r.id} id={`mb-${r.id}-snow`}>
            <path d={snowCaps(r.pts, r.snowDepth)} />
          </clipPath>
        ))}
      </defs>

      <rect width={W} height={H} fill="url(#mb-sky)" />
      <circle cx={1290} cy={86} r={150} fill="url(#mb-sun)" />

      {ranges.map((r, i) => (
        <g key={r.id}>
          <polygon points={toPoints(r.pts)} fill={r.fill} />
          <path d={shadows(r.pts)} fill={r.shade} clipPath={`url(#mb-${r.id})`} />
          {r.snowDepth > 0 && (
            <g clipPath={`url(#mb-${r.id})`}>
              <path d={snowCaps(r.pts, r.snowDepth)} fill={r.snow} />
              <path d={shadows(r.pts)} fill="#dbe5f0" opacity={0.9} clipPath={`url(#mb-${r.id}-snow)`} />
            </g>
          )}
          {i < ranges.length - 1 && <rect y={i === 0 ? 210 : 262} width={W} height={H} fill="url(#mb-mist)" />}
        </g>
      ))}

      <path d={pines()} fill="#34465c" />
    </svg>
  );
}
