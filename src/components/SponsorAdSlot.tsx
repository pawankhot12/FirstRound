import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Advertisement } from '../types';
import { SponsorAdCard } from './SponsorAdCard';

interface SponsorAdSlotProps {
  ads?: Advertisement[] | Advertisement | null;
  isPreview?: boolean;
  className?: string;
}

const AUTOPLAY_INTERVAL = 3500; // 3.5s rotation
const TRANSITION_DURATION = 600; // 600ms smooth transition

export const SponsorAdSlot: React.FC<SponsorAdSlotProps> = ({
  ads,
  isPreview = false,
  className = '',
}) => {
  const [fetchedAds, setFetchedAds] = useState<Advertisement[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const startXRef = useRef<number | null>(null);
  const hasDraggedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoplayTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Normalize input props to array of valid ads
  const propAds: Advertisement[] = (() => {
    if (!ads) return [];
    if (Array.isArray(ads)) {
      return ads.filter((ad) => ad && ad.id);
    }
    return ads.id ? [ads] : [];
  })();

  // Fetch active ads if no ads prop supplied and not preview
  useEffect(() => {
    if (ads !== undefined || isPreview) return;
    let isMounted = true;
    const loadAds = () => {
      fetch('/api/advertisements/active?placement=CARD_SIDEBAR')
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

    loadAds();
    window.addEventListener('firstround:sponsors-updated', loadAds);

    return () => {
      isMounted = false;
      window.removeEventListener('firstround:sponsors-updated', loadAds);
    };
  }, [ads, isPreview]);

  const validAds = ads !== undefined ? propAds : fetchedAds;

  // Check prefers-reduced-motion
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, []);

  const nextSlide = useCallback(() => {
    if (validAds.length <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % validAds.length);
  }, [validAds.length]);

  const prevSlide = useCallback(() => {
    if (validAds.length <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + validAds.length) % validAds.length);
  }, [validAds.length]);

  // Automatic rotation setup
  useEffect(() => {
    if (validAds.length <= 1 || isHovered || isDragging || prefersReducedMotion) {
      if (autoplayTimerRef.current) clearInterval(autoplayTimerRef.current);
      return;
    }

    autoplayTimerRef.current = setInterval(() => {
      nextSlide();
    }, AUTOPLAY_INTERVAL);

    return () => {
      if (autoplayTimerRef.current) clearInterval(autoplayTimerRef.current);
    };
  }, [validAds.length, isHovered, isDragging, prefersReducedMotion, nextSlide]);

  // Mouse Drag Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (validAds.length <= 1) return;
    startXRef.current = e.clientX;
    hasDraggedRef.current = false;
    setIsDragging(true);
    setDragOffset(0);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || startXRef.current === null) return;
    const currentX = e.clientX;
    const diff = currentX - startXRef.current;
    if (Math.abs(diff) > 5) {
      hasDraggedRef.current = true;
    }
    setDragOffset(diff);
  };

  const handleMouseUpOrLeave = () => {
    if (!isDragging) return;
    setIsDragging(false);
    startXRef.current = null;

    if (Math.abs(dragOffset) > 40) {
      if (dragOffset < 0) {
        nextSlide();
      } else {
        prevSlide();
      }
    }
    setDragOffset(0);
  };

  // Touch Swipe Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (validAds.length <= 1) return;
    startXRef.current = e.touches[0].clientX;
    hasDraggedRef.current = false;
    setIsDragging(true);
    setDragOffset(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || startXRef.current === null) return;
    const currentX = e.touches[0].clientX;
    const diff = currentX - startXRef.current;
    if (Math.abs(diff) > 5) {
      hasDraggedRef.current = true;
    }
    setDragOffset(diff);
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    startXRef.current = null;

    if (Math.abs(dragOffset) > 40) {
      if (dragOffset < 0) {
        nextSlide();
      } else {
        prevSlide();
      }
    }
    setDragOffset(0);
  };

  // Prevent click triggering navigation if user was dragging card
  const handleClickCapture = (e: React.MouseEvent) => {
    if (hasDraggedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      hasDraggedRef.current = false;
    }
  };

  // ZERO-AD RULE: Render absolutely nothing when no active ads exist
  if (validAds.length === 0) {
    return null;
  }

  // Single Ad: Render simple card without carousel wrapper
  if (validAds.length === 1) {
    return (
      <div className={`relative w-full ${className}`} id="sponsor-ad-slot-container">
        <SponsorAdCard ad={validAds[0]} isPreview={isPreview} />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`group relative w-full select-none ${className}`}
      id="sponsor-ad-slot-container"
      role="region"
      aria-roledescription="carousel"
      aria-label="Sponsored Partners Carousel"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        handleMouseUpOrLeave();
      }}
    >
      {/* Carousel Track Viewport */}
      <div
        className={`overflow-hidden rounded-2xl touch-pan-y ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClickCapture={handleClickCapture}
      >
        <div
          className="flex w-full"
          style={{
            transform: `translateX(calc(-${currentIndex * 100}% + ${dragOffset}px))`,
            transition: isDragging || prefersReducedMotion
              ? 'none'
              : `transform ${TRANSITION_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)`,
          }}
        >
          {validAds.map((ad, idx) => (
            <div
              key={ad.id || idx}
              className="w-full shrink-0 flex-none"
              aria-hidden={idx !== currentIndex}
            >
              <SponsorAdCard ad={ad} isPreview={isPreview} />
            </div>
          ))}
        </div>
      </div>

      {/* Navigation Arrows (Desktop hover) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          prevSlide();
        }}
        aria-label="Previous Sponsor"
        className="absolute left-2 top-1/2 -translate-y-1/2 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/80 border border-slate-700 text-slate-200 opacity-0 group-hover:opacity-100 transition-all hover:bg-amber-500 hover:text-slate-950 hover:border-amber-400 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer shadow-md"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          nextSlide();
        }}
        aria-label="Next Sponsor"
        className="absolute right-2 top-1/2 -translate-y-1/2 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/80 border border-slate-700 text-slate-200 opacity-0 group-hover:opacity-100 transition-all hover:bg-amber-500 hover:text-slate-950 hover:border-amber-400 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer shadow-md"
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      {/* Rotation Indicator Dots */}
      <div className="absolute top-4 right-4 flex items-center gap-1.5 z-20">
        {validAds.map((ad, idx) => (
          <button
            key={ad.id || idx}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setCurrentIndex(idx);
            }}
            aria-label={`Go to sponsor slide ${idx + 1}`}
            role="tab"
            aria-selected={idx === currentIndex}
            className={`h-2 rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer ${
              idx === currentIndex
                ? 'w-5 bg-amber-400'
                : 'w-2 bg-slate-600/70 hover:bg-slate-400'
            }`}
          />
        ))}
      </div>
    </div>
  );
};
