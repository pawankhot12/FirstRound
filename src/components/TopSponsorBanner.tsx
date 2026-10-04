import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, Sparkles, X, Building2 } from 'lucide-react';
import { Advertisement } from '../types';

interface TopSponsorBannerProps {
  ad?: Advertisement | null;
  placement?: 'DASHBOARD_TOP' | 'LANDING_TOP' | string;
  isPreview?: boolean;
  className?: string;
}

export const TopSponsorBanner: React.FC<TopSponsorBannerProps> = ({
  ad,
  placement = 'DASHBOARD_TOP',
  isPreview = false,
  className = '',
}) => {
  const [logoError, setLogoError] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const impressionFired = useRef(false);

  const getSessionId = (): string => {
    try {
      let sid = sessionStorage.getItem('fr_ad_session_id');
      if (!sid) {
        sid = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        sessionStorage.setItem('fr_ad_session_id', sid);
      }
      return sid;
    } catch {
      return 'sess_fallback';
    }
  };

  useEffect(() => {
    if (isPreview || impressionFired.current || !ad?.id) return;
    const sessionId = getSessionId();
    const targetPlacement = placement || ad.placement || 'DASHBOARD_TOP';
    const storageKey = `fr_imp_${ad.id}_${targetPlacement}_${sessionId}`;

    try {
      if (sessionStorage.getItem(storageKey)) return;
      sessionStorage.setItem(storageKey, '1');
    } catch (e) {}

    impressionFired.current = true;

    fetch(`/api/advertisements/${ad.id}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'IMPRESSION',
        sessionId,
        placement: targetPlacement,
        is_test: ad.is_test || 0,
      }),
    }).catch(() => {});
  }, [ad?.id, isPreview, placement, ad?.placement, ad?.is_test]);

  if (!ad || !ad.id || dismissed) {
    return null;
  }

  const handleClick = (e: React.MouseEvent) => {
    if (isPreview) {
      e.preventDefault();
      return;
    }
    const sessionId = getSessionId();
    const targetPlacement = placement || ad.placement || 'DASHBOARD_TOP';

    fetch(`/api/advertisements/${ad.id}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'CLICK',
        sessionId,
        placement: targetPlacement,
        is_test: ad.is_test || 0,
      }),
    }).catch(() => {});

    window.open(ad.destinationUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      role="region"
      aria-label="Sponsored advertisement"
      className={`w-full bg-slate-900 border-b border-amber-500/30 text-slate-100 shadow-md transition-all ${className}`}
      id={`top-sponsor-banner-${ad.id}`}
    >
      <div className="max-w-7xl mx-auto px-4 py-3.5 sm:px-6 lg:px-8 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3.5 text-xs min-h-[48px]">
        {/* Left: Brand & Sponsor badge */}
        <div className="flex items-center gap-2.5 shrink-0">
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
            <Sparkles className="w-2.5 h-2.5" />
            Sponsored
          </span>
          {ad.logoUrl && !logoError ? (
            <img
              src={ad.logoUrl}
              alt={ad.sponsorName}
              onError={() => setLogoError(true)}
              className="w-5 h-5 rounded border border-slate-700 object-contain bg-slate-950 p-0.5"
            />
          ) : (
            <div className="w-5 h-5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <Building2 className="w-3 h-3" />
            </div>
          )}
          <span className="font-bold text-slate-200 truncate max-w-[140px] sm:max-w-[180px]">
            {ad.sponsorName}
          </span>
        </div>

        {/* Middle: Headline & Message */}
        <div className="flex-1 min-w-[200px] flex items-center gap-2 overflow-hidden">
          <span className="font-semibold text-white truncate max-w-full sm:max-w-none">
            {ad.title}
          </span>
          {ad.description && (
            <span className="hidden md:inline text-slate-400 truncate max-w-md border-l border-slate-700 pl-2.5">
              {ad.description}
            </span>
          )}
        </div>

        {/* Right: CTA & Dismiss */}
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={ad.destinationUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleClick}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs transition-colors shadow-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-slate-900"
          >
            <span>{ad.ctaText || 'Learn More'}</span>
            <ExternalLink className="w-3 h-3" />
          </a>

          {!isPreview && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDismissed(true);
              }}
              aria-label="Close advertisement"
              className="p-1 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

interface TopSponsorAdSlotProps {
  ads?: Advertisement[] | Advertisement | null;
  placement?: 'DASHBOARD_TOP' | 'LANDING_TOP' | string;
  isPreview?: boolean;
  className?: string;
}

export const TopSponsorAdSlot: React.FC<TopSponsorAdSlotProps> = ({
  ads,
  placement = 'DASHBOARD_TOP',
  isPreview = false,
  className = '',
}) => {
  const [fetchedAds, setFetchedAds] = useState<Advertisement[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    if (ads !== undefined || isPreview) return;
    let isMounted = true;
    const loadBanner = () => {
      fetch(`/api/advertisements/active?placement=${placement}`)
        .then((res) => res.json())
        .then((data) => {
          if (isMounted && data?.success) {
            if (Array.isArray(data.advertisements)) {
              setFetchedAds(data.advertisements);
            } else if (data.advertisement) {
              setFetchedAds([data.advertisement]);
            } else {
              setFetchedAds([]);
            }
          }
        })
        .catch(() => {});
    };

    loadBanner();
    window.addEventListener('firstround:sponsors-updated', loadBanner);

    return () => {
      isMounted = false;
      window.removeEventListener('firstround:sponsors-updated', loadBanner);
    };
  }, [ads, placement, isPreview]);

  const activeAds = ads !== undefined ? (Array.isArray(ads) ? ads : ads ? [ads] : []) : fetchedAds;
  const validAds = activeAds.filter((ad) => ad && ad.id);

  useEffect(() => {
    if (validAds.length <= 1) return;

    const interval = setInterval(() => {
      setIsFading(true);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % validAds.length);
        setIsFading(false);
      }, 400);
    }, 4000);

    return () => clearInterval(interval);
  }, [validAds.length]);

  if (validAds.length === 0) return null;

  const currentAd = validAds[currentIndex % validAds.length];

  return (
    <div className={`transition-opacity duration-300 ${isFading ? 'opacity-0' : 'opacity-100'} ${className}`}>
      <TopSponsorBanner ad={currentAd} placement={placement} isPreview={isPreview} />
    </div>
  );
};
