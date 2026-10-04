import React, { useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Brain,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  Code,
  Compass,
  FileSpreadsheet,
  GraduationCap,
  Layers,
  Lightbulb,
  Menu,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { CompanyInfo, TestSeries, Advertisement } from '../types';
import { SponsorAdSlot } from './SponsorAdSlot';
import { TopSponsorAdSlot } from './TopSponsorBanner';

interface LandingPageProps {
  onGetStarted: () => void;
  onLogin: () => void;
  tests?: TestSeries[];
  companies?: CompanyInfo[];
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onGetStarted,
  onLogin,
  tests = [],
  companies = [],
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [landingAds, setLandingAds] = useState<Advertisement[]>([]);

  React.useEffect(() => {
    let isMounted = true;
    const loadLandingAds = () => {
      fetch('/api/advertisements/active?placement=LANDING_TOP')
        .then((res) => res.json())
        .then((data) => {
          if (isMounted && data?.success) {
            if (Array.isArray(data.advertisements)) {
              setLandingAds(data.advertisements);
            } else if (data.advertisement) {
              setLandingAds([data.advertisement]);
            } else {
              setLandingAds([]);
            }
          } else if (isMounted) {
            setLandingAds([]);
          }
        })
        .catch(() => {
          if (isMounted) setLandingAds([]);
        });
    };

    loadLandingAds();
    window.addEventListener('firstround:sponsors-updated', loadLandingAds);

    return () => {
      isMounted = false;
      window.removeEventListener('firstround:sponsors-updated', loadLandingAds);
    };
  }, []);

  const supportedRecruiters = [
    { name: 'TCS', role: 'NQT / Prime / Digital', color: 'border-sky-200 bg-sky-50 text-sky-900' },
    { name: 'Infosys', role: 'Specialist / SE / DSE', color: 'border-blue-200 bg-blue-50 text-blue-900' },
    { name: 'Accenture', role: 'ASE / FSE Assessment', color: 'border-purple-200 bg-purple-50 text-purple-900' },
    { name: 'Wipro', role: 'Elite NLTH / Turbo', color: 'border-emerald-200 bg-emerald-50 text-emerald-900' },
    { name: 'Cognizant', role: 'GenC / GenC Elevate', color: 'border-indigo-200 bg-indigo-50 text-indigo-900' },
    { name: 'Capgemini', role: 'Exceller / Analyst', color: 'border-cyan-200 bg-cyan-50 text-cyan-900' },
    { name: 'Amazon', role: 'OA / SDE / Support', color: 'border-amber-200 bg-amber-50 text-amber-900' },
  ];

  const scrollToSection = (id: string) => {
    setIsMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-app-bg text-text-primary flex flex-col font-['Plus_Jakarta_Sans'] selection:bg-amber-300 selection:text-text-primary no-scrollbar overflow-y-auto">
      {/* TOP SPONSOR BANNER — ONLY IF ACTIVE */}
      <TopSponsorAdSlot ads={landingAds} placement="LANDING_TOP" />

      {/* ========================================================================= */}
      {/* 1. PUBLIC NAVBAR                                                          */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-40 bg-primary border-b border-primary-hover text-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow-sm">
              <Zap className="w-5 h-5 fill-slate-950" />
            </div>
            <div>
              <span className="text-lg font-black tracking-tight text-white font-['Outfit'] block leading-none">
                FirstRound
              </span>
              <span className="text-[10px] font-semibold text-amber-400 tracking-wider uppercase">
                Placement Readiness
              </span>
            </div>
          </div>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-8 text-xs font-semibold text-slate-300">
            <button
              onClick={() => scrollToSection('features')}
              className="hover:text-white transition-colors"
            >
              Features
            </button>
            <button
              onClick={() => scrollToSection('supported-tests')}
              className="hover:text-white transition-colors"
            >
              Supported Tests
            </button>
            <button
              onClick={() => scrollToSection('how-it-works')}
              className="hover:text-white transition-colors"
            >
              How It Works
            </button>
          </nav>

          {/* Desktop Auth CTAs */}
          <div className="hidden md:flex items-center gap-3">
            <button
              id="landing-nav-login-btn"
              onClick={onLogin}
              className="px-4 py-2 text-xs font-bold text-slate-200 hover:text-white hover:bg-surface/10 rounded-xl transition-colors"
            >
              Sign In
            </button>
            <button
              id="landing-nav-get-started-btn"
              onClick={onGetStarted}
              className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 transform active:scale-95"
            >
              <span>Get Started</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 text-slate-300 hover:text-white hover:bg-surface/10 rounded-lg"
            aria-label="Toggle navigation menu"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Dropdown Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-primary-dark border-t border-primary-hover px-4 py-5 space-y-4">
            <nav className="flex flex-col space-y-3 text-sm font-semibold text-slate-200">
              <button
                onClick={() => scrollToSection('features')}
                className="text-left py-1 hover:text-amber-400"
              >
                Features
              </button>
              <button
                onClick={() => scrollToSection('supported-tests')}
                className="text-left py-1 hover:text-amber-400"
              >
                Supported Tests
              </button>
              <button
                onClick={() => scrollToSection('how-it-works')}
                className="text-left py-1 hover:text-amber-400"
              >
                How It Works
              </button>
            </nav>

            <div className="pt-3 border-t border-slate-700/60 flex flex-col gap-2.5">
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onLogin();
                }}
                className="w-full py-2.5 bg-surface/10 text-white font-bold text-xs rounded-xl"
              >
                Sign In
              </button>
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onGetStarted();
                }}
                className="w-full py-2.5 bg-amber-400 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5"
              >
                <span>Get Started</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ========================================================================= */}
      {/* 2. HERO SECTION                                                           */}
      {/* ========================================================================= */}
      <section className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-28 bg-primary text-white">
        {/* Subtle geometric background accents */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-sky-500 blur-3xl"></div>
          <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-amber-500 blur-3xl"></div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Hero Content */}
            <div className="lg:col-span-7 space-y-6 text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface/10 border border-white/20 text-amber-300 text-xs font-bold tracking-wide uppercase">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>FIRSTROUND</span>
              </div>

              <div className="space-y-2">
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-[1.1] font-['Outfit']">
                  Practice smarter. <br />
                  <span className="text-amber-400">Get placement ready.</span>
                </h1>
              </div>

              <p className="text-base sm:text-lg text-slate-300 max-w-xl font-normal leading-relaxed">
                Prepare for aptitude, reasoning, technical assessments and company-focused placement
                tests — all in one focused platform.
              </p>

              {/* CTAs */}
              <div className="pt-2 flex flex-wrap items-center gap-4">
                <button
                  id="hero-get-started-btn"
                  onClick={onGetStarted}
                  className="px-7 py-3.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-sm rounded-xl shadow-lg hover:shadow-amber-400/20 transition-all flex items-center gap-2 transform active:scale-95"
                >
                  <span>Get Started</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  id="hero-explore-tests-btn"
                  onClick={() => scrollToSection('supported-tests')}
                  className="px-6 py-3.5 bg-surface/10 hover:bg-surface/20 border border-white/20 text-white font-bold text-sm rounded-xl transition-colors flex items-center gap-2"
                >
                  <BookOpen className="w-4 h-4 text-amber-400" />
                  <span>Explore Tests</span>
                </button>
              </div>

              {/* Verified Product Pillars */}
              <div className="pt-6 grid grid-cols-3 gap-4 border-t border-slate-700/60 max-w-lg">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-amber-400">Company Patterns</p>
                  <p className="text-[11px] text-slate-400">TCS, Infosys, Wipro, Accenture</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-amber-400">Assessment Practice</p>
                  <p className="text-[11px] text-slate-400">Timed exams & practice mode</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-amber-400">Revision Vault</p>
                  <p className="text-[11px] text-slate-400">Targeted mistake analysis</p>
                </div>
              </div>
            </div>

            {/* Right Hero Visual: Authentic UI Interface Preview */}
            <div className="lg:col-span-5">
              <div className="bg-primary-dark border border-primary-active rounded-3xl p-5 sm:p-6 shadow-2xl text-text-primary space-y-4 relative">
                {/* Visual Header bar */}
                <div className="flex items-center justify-between pb-3 border-b border-primary-active text-white text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></div>
                    <span className="font-bold tracking-wide">TCS Digital Practice Mock</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-amber-400 font-bold bg-primary-dark px-2.5 py-1 rounded-lg border border-primary-active">
                    <Clock className="w-3.5 h-3.5" />
                    <span>44:30</span>
                  </div>
                </div>

                {/* Sample Question Card */}
                <div className="bg-surface rounded-2xl p-4 sm:p-5 border border-border shadow-sm space-y-3.5">
                  <div className="flex items-center justify-between text-[11px] text-text-muted">
                    <span className="font-bold text-primary uppercase tracking-wider">
                      Question 4 of 10 • Quantitative Aptitude
                    </span>
                    <span className="px-2 py-0.5 bg-amber-50 text-amber-900 font-bold border border-amber-200 rounded">
                      Medium
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm font-semibold text-text-primary leading-relaxed">
                    A train passes a station platform in 36 seconds and a man standing on the
                    platform in 20 seconds. If the speed of the train is 54 km/hr, what is the length
                    of the platform?
                  </p>

                  {/* Options List */}
                  <div className="space-y-1.5 pt-1">
                    {[
                      { id: 'A', text: '220 meters', active: false },
                      { id: 'B', text: '240 meters', active: true },
                      { id: 'C', text: '260 meters', active: false },
                      { id: 'D', text: '300 meters', active: false },
                    ].map((opt) => (
                      <div
                        key={opt.id}
                        className={`p-2.5 rounded-xl border text-xs font-medium flex items-center justify-between transition-colors ${
                          opt.active
                            ? 'bg-amber-50 border-amber-400 text-slate-950 font-bold'
                            : 'bg-app-bg border-border text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold ${
                              opt.active ? 'bg-amber-400 text-slate-950' : 'bg-slate-200 text-text-secondary'
                            }`}
                          >
                            {opt.id}
                          </span>
                          <span>{opt.text}</span>
                        </div>
                        {opt.active && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                      </div>
                    ))}
                  </div>

                  {/* Bottom test helper controls */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span className="text-text-muted font-medium">💡 Formula: Speed = Distance / Time</span>
                    <span className="font-bold text-primary">Next Question →</span>
                  </div>
                </div>

                {/* Sub-card: Real-Time Diagnostic Bar */}
                <div className="bg-primary-dark rounded-xl p-3 border border-primary-active text-white flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span className="font-medium text-slate-200">AI Step-by-Step Mentor & Doubt Solver</span>
                  </div>
                  <span className="text-[11px] font-bold text-amber-400">Available on demand</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. COMPANY STRIP (Recruiters Supported)                                   */}
      {/* ========================================================================= */}
      <section id="supported-tests" className="py-12 bg-surface border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
          <div className="space-y-1">
            <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
              Company Assessment Patterns
            </h2>
            <p className="text-xl sm:text-2xl font-bold text-text-primary">
              Prepare for assessments across leading recruiters
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 pt-2">
            {supportedRecruiters.map((rec) => (
              <div
                key={rec.name}
                className="p-3.5 rounded-2xl border border-border bg-app-bg/70 hover:bg-surface hover:border-slate-300 hover:shadow-xs transition-all flex flex-col items-center justify-center text-center space-y-1 group"
              >
                <div className="w-8 h-8 rounded-xl bg-primary text-amber-400 flex items-center justify-center font-extrabold text-xs shadow-xs">
                  {rec.name.slice(0, 2).toUpperCase()}
                </div>
                <h4 className="text-xs font-bold text-text-primary">{rec.name}</h4>
                <p className="text-[10px] text-text-muted line-clamp-1">{rec.role}</p>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-slate-400 max-w-xl mx-auto pt-1">
            Practice test series and problem sets organized around common company-specific assessment patterns.
          </p>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. CORE FEATURES (4 Core Modules)                                         */}
      {/* ========================================================================= */}
      <section id="features" className="py-20 bg-app-bg border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <span className="text-xs font-extrabold uppercase tracking-wider text-sky-700">
              Everything You Need For Campus Placement
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-text-primary tracking-tight font-['Outfit']">
              Engineered for Focused Practice
            </h2>
            <p className="text-sm text-text-secondary leading-relaxed">
              Target your weak spots, simulate genuine recruitment round environments, and prepare
              systematically.
            </p>
          </div>

          {/* 4 Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Feature 1 */}
            <div className="bg-surface rounded-3xl p-6 border border-border shadow-xs space-y-4 hover:border-slate-300 transition-all flex flex-col justify-between">
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center">
                  <Target className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-text-primary">Placement Tests</h3>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Company-focused mocks and topic-based practice for placement preparation.
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center gap-1 text-[11px] font-bold text-sky-700">
                <span>Quantitative • Logical • Verbal</span>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="bg-surface rounded-3xl p-6 border border-border shadow-xs space-y-4 hover:border-slate-300 transition-all flex flex-col justify-between">
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-amber-600" />
                </div>
                <h3 className="text-lg font-bold text-text-primary">AI Mentor</h3>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Get step-by-step explanations when you get stuck.
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center gap-1 text-[11px] font-bold text-amber-700">
                <span>Shortcuts • Detailed logic breakdown</span>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="bg-surface rounded-3xl p-6 border border-border shadow-xs space-y-4 hover:border-slate-300 transition-all flex flex-col justify-between">
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-purple-50 border border-purple-200 text-purple-700 flex items-center justify-center">
                  <RotateCcw className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-text-primary">Revision Vault</h3>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Turn mistakes into targeted revision and re-quiz practice.
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center gap-1 text-[11px] font-bold text-purple-700">
                <span>Custom re-tests • Bookmarked traps</span>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="bg-surface rounded-3xl p-6 border border-border shadow-xs space-y-4 hover:border-slate-300 transition-all flex flex-col justify-between">
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-text-primary">Performance Tracking</h3>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Understand your accuracy, progress and preparation readiness.
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                <span>Time-per-question • Section stats</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 5. HOW IT WORKS (3 Simple Steps)                                          */}
      {/* ========================================================================= */}
      <section id="how-it-works" className="py-20 bg-surface border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <span className="text-xs font-extrabold uppercase tracking-wider text-text-muted">
              Simple 3-Step Process
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-text-primary tracking-tight font-['Outfit']">
              How It Works
            </h2>
            <p className="text-sm text-text-secondary">
              A structured workflow designed for continuous placement preparation improvement.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="bg-app-bg rounded-3xl p-8 border border-border space-y-4 relative group hover:bg-surface hover:border-slate-300 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-primary text-amber-400 flex items-center justify-center font-black text-lg shadow-sm">
                01
              </div>
              <h3 className="text-xl font-bold text-text-primary">Choose a Test</h3>
              <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
                Select a company mock, topic drill or placement assessment.
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-app-bg rounded-3xl p-8 border border-border space-y-4 relative group hover:bg-surface hover:border-slate-300 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-primary text-amber-400 flex items-center justify-center font-black text-lg shadow-sm">
                02
              </div>
              <h3 className="text-xl font-bold text-text-primary">Practice & Analyze</h3>
              <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
                Take the assessment and understand your performance.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-app-bg rounded-3xl p-8 border border-border space-y-4 relative group hover:bg-surface hover:border-slate-300 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-primary text-amber-400 flex items-center justify-center font-black text-lg shadow-sm">
                03
              </div>
              <h3 className="text-xl font-bold text-text-primary">Improve</h3>
              <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
                Use mistakes, revision and AI guidance to prepare better.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 5.5 SPONSOR PARTNERS CAROUSEL                                            */}
      {/* ========================================================================= */}
      <section className="py-8 bg-app-bg border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SponsorAdSlot />
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 6. FINAL CTA                                                              */}
      {/* ========================================================================= */}
      <section className="py-20 bg-primary text-white relative overflow-hidden">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6 relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center mx-auto shadow-lg">
            <Zap className="w-7 h-7 fill-slate-950" />
          </div>

          <div className="space-y-2">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight font-['Outfit']">
              Ready to start your placement preparation?
            </h2>
            <p className="text-base text-slate-300 max-w-xl mx-auto">
              Build your preparation one assessment at a time.
            </p>
          </div>

          <div className="pt-3">
            <button
              id="landing-final-get-started-btn"
              onClick={onGetStarted}
              className="px-8 py-4 bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-sm rounded-xl shadow-xl transition-all inline-flex items-center gap-2 transform active:scale-95"
            >
              <span>Get Started</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 7. FOOTER                                                                 */}
      {/* ========================================================================= */}
      <footer className="bg-primary-dark border-t border-primary-hover text-slate-300 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="flex items-center justify-center sm:justify-start gap-3 text-center sm:text-left">
            <div className="w-8 h-8 rounded-lg bg-amber-400 text-slate-950 flex items-center justify-center font-black text-sm shrink-0">
              <Zap className="w-4 h-4 fill-slate-950" />
            </div>
            <div>
              <span className="text-base font-black text-white font-['Outfit'] block leading-none">
                FirstRound
              </span>
              <span className="text-[11px] text-slate-400">
                Placement preparation built around practice, analysis and improvement.
              </span>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-700/60 text-center text-xs text-slate-400">
            <p>© 2026 FirstRound. Placement Readiness Platform.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};
