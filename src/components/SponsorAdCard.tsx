import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, Sparkles, Building2 } from 'lucide-react';
import { Advertisement } from '../types';

interface SponsorAdCardProps {
  ad: Advertisement;
  isPreview?: boolean;
  className?: string;
}

export const SponsorAdCard: React.FC<SponsorAdCardProps> = ({
  ad,
  isPreview = false,
  className = '',
}) => {
  const [logoError, setLogoError] = useState(false);
  const [imageError, setImageError] = useState(false);
  const impressionFired = useRef(false);

  // Generate or retrieve persistent session ID
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

  // Track impression once per session per ad
  useEffect(() => {
    if (isPreview || impressionFired.current || !ad?.id) return;

    const sessionId = getSessionId();
    const storageKey = `fr_imp_${ad.id}_${sessionId}`;

    try {
      if (sessionStorage.getItem(storageKey)) {
        return; // Already tracked in this session
      }
      sessionStorage.setItem(storageKey, '1');
    } catch (e) {}

    impressionFired.current = true;

    // Fire impression event asynchronously without blocking UI
    fetch(`/api/advertisements/${ad.id}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'IMPRESSION',
        sessionId,
        placement: ad.placement,
        is_test: ad.is_test || 0,
      }),
    }).catch(() => {
      // Fail silently from client perspective
    });
  }, [ad?.id, isPreview, ad?.placement, ad?.is_test]);

  if (!ad || !ad.id) {
    return null;
  }

  const handleClick = (e: React.MouseEvent) => {
    if (isPreview) {
      e.preventDefault();
      return;
    }

    const sessionId = getSessionId();

    // Fire click event asynchronously
    fetch(`/api/advertisements/${ad.id}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'CLICK',
        sessionId,
        placement: ad.placement,
        is_test: ad.is_test || 0,
      }),
    }).catch(() => {
      // Analytics failure must never block navigation
    });

    // Destination URL opens in new tab with target="_blank" rel="noopener noreferrer"
    window.open(ad.destinationUrl, '_blank', 'noopener,noreferrer');
  };

  const isCreativeType = ad.adType === 'OPTIONAL_CREATIVE_CARD' && ad.cardImageUrl && !imageError;

  return (
    <div
      onClick={handleClick}
      className={`group relative overflow-hidden rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-5 shadow-lg transition-all duration-300 hover:border-amber-500/40 hover:shadow-xl hover:shadow-amber-500/5 ${
        isPreview ? 'cursor-default' : 'cursor-pointer'
      } ${className}`}
      id={`sponsor-card-${ad.id}`}
    >
      {/* Background glow accent */}
      <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-amber-500/10 blur-2xl transition-all duration-500 group-hover:bg-amber-500/20" />

      {/* Header: Sponsored Badge & Logo */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {ad.logoUrl && !logoError ? (
            <img
              src={ad.logoUrl}
              alt={ad.sponsorName}
              onError={() => setLogoError(true)}
              className="h-7 w-7 rounded-lg border border-slate-700 object-contain bg-slate-950 p-1"
            />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400">
              <Building2 className="h-4 w-4" />
            </div>
          )}
          <span className="text-xs font-semibold tracking-wide text-slate-300">
            {ad.sponsorName}
          </span>
        </div>

        <div className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-medium tracking-wider text-amber-400 uppercase">
          <Sparkles className="h-2.5 w-2.5" />
          Sponsored
        </div>
      </div>

      {/* Optional Creative Image */}
      {isCreativeType && (
        <div className="mb-3 overflow-hidden rounded-xl border border-slate-700/50">
          <img
            src={ad.cardImageUrl!}
            alt={ad.title}
            onError={() => setImageError(true)}
            className="h-28 w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>
      )}

      {/* Content */}
      <div className="mb-4">
        <h3 className="text-sm font-bold leading-snug text-white transition-colors group-hover:text-amber-300">
          {ad.title}
        </h3>
        {ad.description && (
          <p className="mt-1 line-clamp-2 text-xs text-slate-400">
            {ad.description}
          </p>
        )}
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-between border-t border-slate-800 pt-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 transition-all group-hover:translate-x-0.5 group-hover:text-amber-300">
          {ad.ctaText || 'Learn More'}
          <ExternalLink className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  );
};
