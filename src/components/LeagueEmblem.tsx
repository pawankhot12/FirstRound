import React from 'react';

export type LeagueTierName =
  | 'Bronze'
  | 'Silver'
  | 'Gold'
  | 'Platinum'
  | 'Diamond'
  | 'Heroic'
  | 'Elite Heroic'
  | 'Master'
  | 'Elite Master';

interface LeagueEmblemProps {
  tier: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showGlow?: boolean;
  className?: string;
  animated?: boolean;
}

const sizeMap = {
  xs: 'w-6 h-6',
  sm: 'w-9 h-9',
  md: 'w-12 h-12',
  lg: 'w-18 h-18 sm:w-20 sm:h-20',
  xl: 'w-24 h-24 sm:w-28 sm:h-28',
};

export const LeagueEmblem: React.FC<LeagueEmblemProps> = ({
  tier,
  size = 'md',
  showGlow = true,
  className = '',
  animated = true,
}) => {
  const normTier = (tier || 'Bronze').trim();

  // Tier Theme Colors & SVG Gradient Definitions
  const getEmblemStyle = (t: string) => {
    switch (t) {
      case 'Elite Master':
        return {
          glow: 'rgba(255, 183, 3, 0.45)',
          gradId: 'grad-elitemaster',
          stop1: '#FFD700',
          stop2: '#9D4EDD',
          stop3: '#10002B',
          accent: '#FFE600',
          border: 'border-amber-400/80',
          bgRing: 'from-amber-400 via-purple-600 to-slate-950',
          title: 'Elite Master League Emblem',
        };
      case 'Master':
        return {
          glow: 'rgba(157, 78, 221, 0.4)',
          gradId: 'grad-master',
          stop1: '#C77DFF',
          stop2: '#7B2CBF',
          stop3: '#3A0CA3',
          accent: '#E0AAFF',
          border: 'border-purple-500/70',
          bgRing: 'from-purple-400 to-indigo-900',
          title: 'Master League Emblem',
        };
      case 'Elite Heroic':
        return {
          glow: 'rgba(255, 0, 84, 0.45)',
          gradId: 'grad-eliteheroic',
          stop1: '#FF4D6D',
          stop2: '#C9184A',
          stop3: '#800F2F',
          accent: '#FF8FA3',
          border: 'border-rose-500/80',
          bgRing: 'from-rose-500 via-pink-600 to-slate-900',
          title: 'Elite Heroic League Emblem',
        };
      case 'Heroic':
        return {
          glow: 'rgba(255, 84, 0, 0.4)',
          gradId: 'grad-heroic',
          stop1: '#FF7B00',
          stop2: '#FF0054',
          stop3: '#9E0059',
          accent: '#FFB703',
          border: 'border-orange-500/70',
          bgRing: 'from-orange-500 to-rose-700',
          title: 'Heroic League Emblem',
        };
      case 'Diamond':
        return {
          glow: 'rgba(0, 180, 216, 0.4)',
          gradId: 'grad-diamond',
          stop1: '#90E0EF',
          stop2: '#00B4D8',
          stop3: '#03045E',
          accent: '#CAF0F8',
          border: 'border-cyan-400/80',
          bgRing: 'from-cyan-400 to-blue-900',
          title: 'Diamond League Emblem',
        };
      case 'Platinum':
        return {
          glow: 'rgba(0, 245, 212, 0.35)',
          gradId: 'grad-platinum',
          stop1: '#80FFDB',
          stop2: '#00F5D4',
          stop3: '#0077B6',
          accent: '#C7F9CC',
          border: 'border-teal-300/70',
          bgRing: 'from-teal-300 to-emerald-800',
          title: 'Platinum League Emblem',
        };
      case 'Gold':
        return {
          glow: 'rgba(255, 195, 0, 0.4)',
          gradId: 'grad-gold',
          stop1: '#FFEA00',
          stop2: '#FFB703',
          stop3: '#D48806',
          accent: '#FFF59D',
          border: 'border-amber-400/70',
          bgRing: 'from-amber-300 to-amber-700',
          title: 'Gold League Emblem',
        };
      case 'Silver':
        return {
          glow: 'rgba(224, 225, 221, 0.3)',
          gradId: 'grad-silver',
          stop1: '#FFFFFF',
          stop2: '#ADB5BD',
          stop3: '#495057',
          accent: '#F8F9FA',
          border: 'border-slate-300/70',
          bgRing: 'from-slate-200 to-slate-600',
          title: 'Silver League Emblem',
        };
      case 'Bronze':
      default:
        return {
          glow: 'rgba(205, 127, 50, 0.3)',
          gradId: 'grad-bronze',
          stop1: '#E07A5F',
          stop2: '#CD7F32',
          stop3: '#6F4E37',
          accent: '#F4A261',
          border: 'border-amber-700/60',
          bgRing: 'from-amber-600 to-amber-950',
          title: 'Bronze League Emblem',
        };
    }
  };

  const style = getEmblemStyle(normTier);
  const sizeClasses = sizeMap[size] || sizeMap.md;

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 ${sizeClasses} ${className}`}
      title={style.title}
      aria-label={style.title}
      role="img"
    >
      {/* Background Soft Glow Aura */}
      {showGlow && (
        <div
          className={`absolute inset-0 rounded-full filter blur-md transition-opacity duration-300 ${
            animated ? 'animate-pulse' : ''
          }`}
          style={{ backgroundColor: style.glow, opacity: 0.7 }}
        />
      )}

      {/* Primary Emblem SVG Artwork */}
      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full relative z-10 drop-shadow-md overflow-visible"
      >
        <defs>
          <linearGradient id={style.gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={style.stop1} />
            <stop offset="50%" stopColor={style.stop2} />
            <stop offset="100%" stopColor={style.stop3} />
          </linearGradient>

          <linearGradient id={`${style.gradId}-accent`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.8" />
            <stop offset="100%" stopColor={style.accent} stopOpacity="0.2" />
          </linearGradient>

          <filter id="glow-filter" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Outer Shield / Crown Silhouette based on Tier */}
        {normTier === 'Elite Master' && (
          <g>
            {/* Wing Elements */}
            <path
              d="M10 38 Q 22 20 40 30 Q 25 45 20 60 Z"
              fill={`url(#${style.gradId})`}
              opacity="0.9"
            />
            <path
              d="M90 38 Q 78 20 60 30 Q 75 45 80 60 Z"
              fill={`url(#${style.gradId})`}
              opacity="0.9"
            />
            {/* Star Crown Shield Base */}
            <polygon
              points="50,10 65,30 85,38 70,60 74,85 50,72 26,85 30,60 15,38 35,30"
              fill={`url(#${style.gradId})`}
              stroke="#FFF"
              strokeWidth="1.5"
            />
            {/* Inner Core Gem */}
            <polygon
              points="50,22 62,38 50,66 38,38"
              fill={`url(#${style.gradId}-accent)`}
              stroke="#FFD700"
              strokeWidth="1.5"
            />
            <circle cx="50" cy="42" r="5" fill="#FFF" />
          </g>
        )}

        {normTier === 'Master' && (
          <g>
            {/* Cosmic Octagon Shield */}
            <polygon
              points="50,8 82,22 92,54 75,85 50,92 25,85 8,54 18,22"
              fill={`url(#${style.gradId})`}
              stroke={style.accent}
              strokeWidth="2"
            />
            {/* Master Star */}
            <polygon
              points="50,20 57,36 74,38 61,50 65,67 50,58 35,67 39,50 26,38 43,36"
              fill={`url(#${style.gradId}-accent)`}
              stroke="#FFF"
              strokeWidth="1"
            />
          </g>
        )}

        {(normTier === 'Elite Heroic' || normTier === 'Heroic') && (
          <g>
            {/* Flame Wing Silhouette */}
            <path
              d="M50 8 C68 22, 88 30, 82 58 C76 80, 58 92, 50 94 C42 92, 24 80, 18 58 C12 30, 32 22, 50 8 Z"
              fill={`url(#${style.gradId})`}
              stroke={style.accent}
              strokeWidth="2"
            />
            {/* Inner Flame Crest */}
            <path
              d="M50 24 C58 35, 70 42, 66 60 C62 74, 54 80, 50 82 C46 80, 38 74, 34 60 C30 42, 42 35, 50 24 Z"
              fill={`url(#${style.gradId}-accent)`}
            />
            {normTier === 'Elite Heroic' && (
              <polygon points="50,30 55,42 67,42 57,50 61,62 50,54 39,62 43,50 33,42 45,42" fill="#FFF" />
            )}
          </g>
        )}

        {normTier === 'Diamond' && (
          <g>
            {/* Diamond Crystal Shield */}
            <polygon
              points="50,6 88,32 50,94 12,32"
              fill={`url(#${style.gradId})`}
              stroke="#FFF"
              strokeWidth="2"
            />
            {/* Inner Facets */}
            <polygon
              points="50,6 88,32 50,42 12,32"
              fill={`url(#${style.gradId}-accent)`}
            />
            <polygon
              points="50,42 88,32 50,94"
              fill="rgba(255,255,255,0.15)"
            />
            <polygon
              points="50,42 12,32 50,94"
              fill="rgba(0,0,0,0.15)"
            />
            <circle cx="50" cy="42" r="6" fill="#FFF" />
          </g>
        )}

        {normTier === 'Platinum' && (
          <g>
            {/* Hexagonal Shield */}
            <polygon
              points="50,10 86,28 86,72 50,90 14,72 14,28"
              fill={`url(#${style.gradId})`}
              stroke={style.accent}
              strokeWidth="2"
            />
            {/* Platinum Inset Emblem */}
            <polygon
              points="50,22 74,36 74,64 50,78 26,64 26,36"
              fill={`url(#${style.gradId}-accent)`}
            />
            <path d="M50 28 L50 72 M28 50 L72 50" stroke="#FFF" strokeWidth="2" opacity="0.8" />
          </g>
        )}

        {normTier === 'Gold' && (
          <g>
            {/* Golden Curved Crest Shield */}
            <path
              d="M50 10 L84 24 V52 C84 72, 68 86, 50 92 C32 86, 16 72, 16 52 V24 L50 10 Z"
              fill={`url(#${style.gradId})`}
              stroke="#FFF"
              strokeWidth="2"
            />
            {/* Inner Star */}
            <polygon
              points="50,26 56,40 71,40 59,49 63,64 50,55 37,64 41,49 29,40 44,40"
              fill={`url(#${style.gradId}-accent)`}
              stroke="#FFF"
              strokeWidth="1"
            />
          </g>
        )}

        {normTier === 'Silver' && (
          <g>
            {/* Silver Classic Shield */}
            <path
              d="M50 12 L80 26 V50 C80 68, 66 82, 50 88 C34 82, 20 68, 20 50 V26 L50 12 Z"
              fill={`url(#${style.gradId})`}
              stroke="#FFF"
              strokeWidth="1.5"
            />
            {/* Chevron Stripes */}
            <path
              d="M32 38 L50 50 L68 38 M32 48 L50 60 L68 48"
              stroke={`url(#${style.gradId}-accent)`}
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        )}

        {normTier === 'Bronze' && (
          <g>
            {/* Bronze Round Spartan Shield */}
            <circle
              cx="50"
              cy="50"
              r="38"
              fill={`url(#${style.gradId})`}
              stroke={style.accent}
              strokeWidth="2"
            />
            <circle
              cx="50"
              cy="50"
              r="28"
              fill={`url(#${style.gradId}-accent)`}
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="1.5"
            />
            {/* Bronze V Chevron */}
            <path
              d="M34 42 L50 58 L66 42"
              stroke="#FFF"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        )}
      </svg>
    </div>
  );
};
