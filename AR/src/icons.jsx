// Icons — minimal stroke set, 24x24 unless overridden
const Icon = {
  Camera: ({ size = 20, color = 'currentColor', stroke = 1.8 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M3 8a2 2 0 0 1 2-2h2.5l1.5-2h6l1.5 2H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z" stroke={color} strokeWidth={stroke} strokeLinejoin="round"/>
      <circle cx="12" cy="13" r="3.5" stroke={color} strokeWidth={stroke}/>
    </svg>
  ),
  Upload: ({ size = 20, color = 'currentColor', stroke = 1.8 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 16V4m0 0-4 4m4-4 4 4" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" stroke={color} strokeWidth={stroke} strokeLinecap="round"/>
    </svg>
  ),
  Sparkle: ({ size = 18, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6L12 3Z" fill={color}/>
      <path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" fill={color} opacity=".7"/>
    </svg>
  ),
  Cube: ({ size = 18, color = 'currentColor', stroke = 1.8 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" stroke={color} strokeWidth={stroke} strokeLinejoin="round"/>
      <path d="M4 7l8 4 8-4M12 11v10" stroke={color} strokeWidth={stroke} strokeLinejoin="round"/>
    </svg>
  ),
  ArrowRight: ({ size = 16, color = 'currentColor', stroke = 2 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M5 12h14m0 0-5-5m5 5-5 5" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Check: ({ size = 14, color = 'currentColor', stroke = 2.5 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 12.5l5 5 11-11" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  X: ({ size = 14, color = 'currentColor', stroke = 2 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M6 6l12 12M6 18L18 6" stroke={color} strokeWidth={stroke} strokeLinecap="round"/>
    </svg>
  ),
  ChevronLeft: ({ size = 18, color = 'currentColor', stroke = 2 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M15 6l-6 6 6 6" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Code: ({ size = 16, color = 'currentColor', stroke = 1.8 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  File: ({ size = 14, color = 'currentColor', stroke = 1.5 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" stroke={color} strokeWidth={stroke} strokeLinejoin="round"/>
      <path d="M14 3v6h6" stroke={color} strokeWidth={stroke} strokeLinejoin="round"/>
    </svg>
  ),
  Folder: ({ size = 14, color = 'currentColor', stroke = 1.5 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" stroke={color} strokeWidth={stroke} strokeLinejoin="round"/>
    </svg>
  ),
  Maximize: ({ size = 18, color = 'currentColor', stroke = 1.8 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Reload: ({ size = 16, color = 'currentColor', stroke = 1.8 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 4v4h-4" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 20v-4h4" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Image: ({ size = 18, color = 'currentColor', stroke = 1.8 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="16" rx="2" stroke={color} strokeWidth={stroke}/>
      <circle cx="9" cy="10" r="1.6" fill={color}/>
      <path d="M5 17l4-4 4 4 3-3 3 3" stroke={color} strokeWidth={stroke} strokeLinejoin="round" fill="none"/>
    </svg>
  ),
  Dot: ({ size = 6, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 6 6"><circle cx="3" cy="3" r="3" fill={color}/></svg>
  ),
};

window.Icon = Icon;
