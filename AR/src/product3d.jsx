// Pseudo-3D product visuals — pure CSS/SVG, no model-viewer
// Each product gets its own canvas so AR feels distinctive.

function ProductBottle({ size = 220, glow = true, accent = '#2563EB' }) {
  return (
    <svg width={size} height={size * 1.4} viewBox="0 0 200 280" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="bottleBody" x1="0" x2="1">
          <stop offset="0" stopColor="#1E293B"/>
          <stop offset="0.45" stopColor="#475569"/>
          <stop offset="0.55" stopColor="#475569"/>
          <stop offset="1" stopColor="#0F172A"/>
        </linearGradient>
        <linearGradient id="bottleHi" x1="0" x2="1">
          <stop offset="0" stopColor="rgba(255,255,255,0)"/>
          <stop offset="0.4" stopColor="rgba(255,255,255,0.35)"/>
          <stop offset="0.6" stopColor="rgba(255,255,255,0)"/>
        </linearGradient>
        <radialGradient id="bottleGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={accent} stopOpacity="0.9"/>
          <stop offset="1" stopColor={accent} stopOpacity="0"/>
        </radialGradient>
      </defs>
      {/* shadow */}
      <ellipse cx="100" cy="265" rx="55" ry="6" fill="#000" opacity="0.18"/>
      {/* glow */}
      {glow && <ellipse cx="100" cy="170" rx="80" ry="40" fill="url(#bottleGlow)" opacity="0.7"/>}
      {/* cap */}
      <rect x="80" y="20" width="40" height="22" rx="3" fill="#1E293B"/>
      <rect x="78" y="38" width="44" height="6" rx="2" fill="#0F172A"/>
      {/* neck */}
      <rect x="86" y="44" width="28" height="14" fill="#334155"/>
      {/* body */}
      <path d="M70 58 Q 68 70 68 90 L 68 230 Q 68 256 100 258 Q 132 256 132 230 L 132 90 Q 132 70 130 58 Z"
            fill="url(#bottleBody)"/>
      {/* highlight */}
      <path d="M82 70 Q 80 82 80 100 L 80 230 Q 80 246 95 248"
            stroke="url(#bottleHi)" strokeWidth="6" fill="none" strokeLinecap="round"/>
      {/* LED strip */}
      <rect x="93" y="160" width="4" height="60" rx="2" fill={accent}>
        {glow && <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite"/>}
      </rect>
      <rect x="92" y="158" width="6" height="64" rx="3" fill="none" stroke={accent} strokeWidth="0.5" opacity="0.6"/>
      {/* grip ring */}
      <ellipse cx="100" cy="200" rx="32" ry="3" fill="#0F172A" opacity="0.7"/>
      <ellipse cx="100" cy="200" rx="32" ry="3" fill="none" stroke="#1E293B" strokeWidth="0.5"/>
    </svg>
  );
}

function ProductLamp({ size = 220, glow = true, accent = '#F59E0B' }) {
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 240 280" style={{ display: 'block' }}>
      <defs>
        <radialGradient id="lampGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={accent} stopOpacity="0.9"/>
          <stop offset="1" stopColor={accent} stopOpacity="0"/>
        </radialGradient>
        <linearGradient id="lampArm" x1="0" x2="1">
          <stop offset="0" stopColor="#94A3B8"/>
          <stop offset="0.5" stopColor="#E2E8F0"/>
          <stop offset="1" stopColor="#94A3B8"/>
        </linearGradient>
      </defs>
      <ellipse cx="120" cy="265" rx="65" ry="6" fill="#000" opacity="0.15"/>
      {glow && <circle cx="180" cy="80" r="80" fill="url(#lampGlow)" opacity="0.9"/>}
      {/* base */}
      <ellipse cx="80" cy="252" rx="45" ry="10" fill="#E2E8F0"/>
      <ellipse cx="80" cy="248" rx="45" ry="10" fill="#F1F5F9"/>
      {/* arm */}
      <rect x="76" y="120" width="8" height="130" fill="url(#lampArm)" rx="2"/>
      <circle cx="80" cy="120" r="6" fill="#475569"/>
      <rect x="80" y="115" width="100" height="6" fill="url(#lampArm)" rx="3" transform="rotate(-15 80 118)"/>
      {/* ring diffuser */}
      <circle cx="180" cy="85" r="38" fill="none" stroke="#CBD5E1" strokeWidth="6"/>
      <circle cx="180" cy="85" r="32" fill={accent} opacity="0.85">
        {glow && <animate attributeName="opacity" values="0.7;0.95;0.7" dur="3s" repeatCount="indefinite"/>}
      </circle>
      <circle cx="180" cy="85" r="32" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1"/>
    </svg>
  );
}

function ProductDevice({ size = 220, glow = true, accent = '#10B981' }) {
  return (
    <svg width={size} height={size * 1.3} viewBox="0 0 220 280" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="devBody" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#475569"/>
          <stop offset="1" stopColor="#1E293B"/>
        </linearGradient>
        <radialGradient id="devGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={accent} stopOpacity="0.7"/>
          <stop offset="1" stopColor={accent} stopOpacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="110" cy="265" rx="60" ry="6" fill="#000" opacity="0.15"/>
      {glow && <ellipse cx="110" cy="140" rx="100" ry="60" fill="url(#devGlow)"/>}
      {/* body */}
      <rect x="40" y="40" width="140" height="200" rx="28" fill="url(#devBody)"/>
      <rect x="40" y="40" width="140" height="200" rx="28" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1"/>
      {/* e-ink screen */}
      <rect x="56" y="60" width="108" height="140" rx="8" fill="#E7E5E4"/>
      <rect x="56" y="60" width="108" height="140" rx="8" fill="none" stroke="#1E293B" strokeOpacity="0.1"/>
      {/* screen content */}
      <text x="110" y="115" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="32" fontWeight="600" fill="#0F172A">98</text>
      <text x="110" y="135" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="#475569" letterSpacing="2">SPO2</text>
      <rect x="68" y="155" width="84" height="3" rx="1.5" fill="#CBD5E1"/>
      <rect x="68" y="155" width="60" height="3" rx="1.5" fill={accent}/>
      <text x="68" y="175" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="#64748B">HRV 47ms</text>
      <text x="68" y="187" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="#64748B">7,240 steps</text>
      {/* dial */}
      <circle cx="190" cy="140" r="14" fill="#0F172A"/>
      <circle cx="190" cy="140" r="14" fill="none" stroke="#475569" strokeWidth="2" strokeDasharray="2 2"/>
      <circle cx="190" cy="140" r="6" fill="#1E293B"/>
      {/* lanyard hole */}
      <circle cx="80" cy="225" r="3" fill="#0F172A"/>
    </svg>
  );
}

function Product3D({ category, size = 220, glow = true, accent }) {
  const props = { size, glow, accent };
  if (category === 'lamp') return <ProductLamp {...props} />;
  if (category === 'device') return <ProductDevice {...props} />;
  return <ProductBottle {...props} />;
}

window.Product3D = Product3D;
window.ProductBottle = ProductBottle;
window.ProductLamp = ProductLamp;
window.ProductDevice = ProductDevice;
