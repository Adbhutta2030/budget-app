// Original MBT (My Budget Tracker) logo mark — a navy badge with gold lettering
// and a small upward trend line. Pure vector, no stock imagery.
export default function MbtLogo({ size = 64, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className={className}>
      <defs>
        <linearGradient id="mbtRing" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f0d999" />
          <stop offset="50%" stopColor="#d4af5f" />
          <stop offset="100%" stopColor="#a67c2e" />
        </linearGradient>
        <linearGradient id="mbtGold" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#f3dfa0" />
          <stop offset="100%" stopColor="#c49a45" />
        </linearGradient>
        <radialGradient id="mbtBg" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#132a4a" />
          <stop offset="100%" stopColor="#0a1628" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="57" fill="url(#mbtBg)" stroke="url(#mbtRing)" strokeWidth="2.5" />
      <circle cx="60" cy="60" r="50" fill="none" stroke="url(#mbtRing)" strokeWidth="0.75" opacity="0.4" />
      <text x="60" y="57" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700" fontSize="30" fill="url(#mbtGold)" letterSpacing="1.5">MBT</text>
      <path d="M32 84 L47 72 L59 79 L88 50" stroke="url(#mbtGold)" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M75 50 L88 50 L88 63" stroke="url(#mbtGold)" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
