import React, { useMemo, useState, useEffect } from 'react';
import { apiGetTestHistory, apiGetMyEntitlements, apiGetMySubscription, apiSelectPlusAssessment, apiDeselectPlusAssessment } from '../api';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Building2,
  CheckCircle2,
  Clock,
  Code2,
  Cpu,
  Crown,
  Database,
  ExternalLink,
  FileCode,
  FileText,
  Filter,
  HelpCircle,
  Layers,
  Lock,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Terminal,
  Trophy,
  X,
  Zap,
  Loader2,
} from 'lucide-react';
import { startRazorpayPurchase } from '../services/razorpayService';
import { ExploreFilters } from './explore/filters/ExploreFilters';
import {
  CompanyInfo,
  DifficultyLevel,
  NavTab,
  PrimaryTestCategory,
  TestCategory,
  TestMode,
  TestSeries,
  UserProfile,
  TestAttempt,
  WeakQuestionItem,
  VerificationStatus,
  SubscriptionInfo,
} from '../types';
import { recommendationEngine } from '../services/RecommendationEngine';

export interface TestHubProps {
  tests: TestSeries[];
  companies?: CompanyInfo[];
  currentUser?: UserProfile | null;
  userAttempts?: TestAttempt[];
  weakQuestions?: WeakQuestionItem[];
  onStartTest: (test: TestSeries, mode: TestMode) => void;
  onNavigateTab?: (tab: NavTab) => void;
}

type ViewState = 'categories' | 'foundation' | 'company' | 'coding';

interface CategoryMeta {
  id: PrimaryTestCategory;
  title: string;
  shortTitle: string;
  tagline: string;
  description: string;
  purpose: string;
  durationLabel: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  borderAccent: string;
  sampleTopics: string[];
  emptyTitle: string;
  emptyDescription: string;
}

const CATEGORIES_CONFIG: Record<PrimaryTestCategory, CategoryMeta> = {
  foundation: {
    id: 'foundation',
    title: 'FOUNDATION & SECTIONAL',
    shortTitle: 'Foundation',
    tagline: 'Build your placement fundamentals.',
    description:
      'Short focused skill assessments to build core numerical, logical, verbal, and analytical ability before attempting full mocks.',
    purpose: 'Build your fundamentals before attempting full mocks.',
    durationLabel: '10–30 mins',
    icon: <BookOpen className="w-6 h-6" />,
    iconBg: 'bg-blue-50 text-blue-700 border-blue-200/80',
    iconColor: 'text-blue-700',
    borderAccent: 'hover:border-blue-300 group-hover:border-blue-400',
    sampleTopics: [
      'Quantitative Aptitude Foundation',
      'Logical Reasoning Foundation',
      'Verbal Ability Foundation',
      'Pseudocode & Programming Logic',
      'Data Interpretation & Analytical Ability',
    ],
    emptyTitle: 'Foundation skill assessments are being structured',
    emptyDescription:
      'High-yield quantitative, logical, verbal, and pseudocode practice tests will appear here.',
  },
  company: {
    id: 'company',
    title: 'COMPANY-SPECIFIC MOCKS',
    shortTitle: 'Company Mocks',
    tagline: 'Practice assessments based on real company patterns.',
    description:
      'Realistic placement simulations structured around researched and verified company recruitment patterns.',
    purpose: 'Realistic assessments based on researched company assessment patterns.',
    durationLabel: '45–90 mins',
    icon: <Building2 className="w-6 h-6" />,
    iconBg: 'bg-purple-50 text-purple-700 border-purple-200/80',
    iconColor: 'text-purple-700',
    borderAccent: 'hover:border-purple-300 group-hover:border-purple-400',
    sampleTopics: [
      'TCS NQT Mock',
      'Infosys Mock',
      'Accenture Mock',
      'Wipro Mock',
      'Cognizant Mock',
    ],
    emptyTitle: 'Company-specific mocks are being prepared',
    emptyDescription:
      'Verified company assessment patterns will appear here once recruitment research is complete.',
  },
  coding: {
    id: 'coding',
    title: 'CODING & TECHNICAL',
    shortTitle: 'Coding & Technical',
    tagline: 'Prepare for coding and technical evaluations.',
    description:
      'Hands-on coding assessments, data structures, SQL queries, pseudocode dry-runs, and core computer science fundamentals.',
    purpose: 'Technical and coding evaluations for software engineering & analyst roles.',
    durationLabel: '30–60 mins',
    icon: <Code2 className="w-6 h-6" />,
    iconBg: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
    iconColor: 'text-emerald-700',
    borderAccent: 'hover:border-emerald-300 group-hover:border-emerald-400',
    sampleTopics: [
      'DSA Coding Assessment',
      'SQL Assessment',
      'Programming Fundamentals',
      'Pseudocode & Output Prediction',
      'CS Fundamentals Technical Mock',
    ],
    emptyTitle: 'Technical & coding assessments are being prepared',
    emptyDescription:
      'Verified DSA, SQL, and core CS fundamental tracks will appear here.',
  },
};

const CODING_TECH_FILTER_OPTIONS = [
  'All',
  'DSA',
  'SQL',
  'C',
  'C++',
  'Java',
  'Python',
  'Pseudocode',
  'CS Fundamentals',
] as const;

export const TestHub: React.FC<TestHubProps> = ({
  tests = [],
  companies = [],
  currentUser = null,
  userAttempts = [],
  weakQuestions = [],
  onStartTest,
  onNavigateTab,
}) => {
  // [TestPerf] StartTest timing start
  const handleStartTestWithPerf = (test: TestSeries, mode: TestMode) => {
    console.time('[TestPerf] StartTest');
    onStartTest(test, mode);
    console.timeEnd('[TestPerf] StartTest');
  };
  const [testHistory, setTestHistory] = useState<any[]>([]);
  const [unlockedAssessments, setUnlockedAssessments] = useState<Set<string>>(new Set());
  const [purchasingTestId, setPurchasingTestId] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser?.id) {
      console.time('[TestPerf] TestHubDataLoad');
      Promise.all([
        apiGetTestHistory(currentUser.id).catch(() => []),
        apiGetMyEntitlements(currentUser.id).catch(() => ({ entitlements: [] })),
        apiGetMySubscription(currentUser.id).catch(() => null),
      ]).then(([historyRes, entitlementsRes, subRes]) => {
        setTestHistory(historyRes || []);
        if (entitlementsRes?.entitlements) {
          setUnlockedAssessments(new Set(entitlementsRes.entitlements.map((e) => e.assessmentId)));
        }
        setSubscription(subRes);
        console.timeEnd('[TestPerf] TestHubDataLoad');
      });
    } else {
      setTestHistory([]);
      setUnlockedAssessments(new Set());
      setSubscription(null);
    }
  }, [currentUser?.id, userAttempts.length]);

  useEffect(() => {
    const handleEntitlementUpdated = () => {
      if (currentUser?.id) {
        apiGetMyEntitlements(currentUser.id)
          .then((res) => {
            if (res?.entitlements) {
              setUnlockedAssessments(new Set(res.entitlements.map((e) => e.assessmentId)));
            }
          })
          .catch(console.error);
      }
    };
    window.addEventListener('firstround:entitlement-updated', handleEntitlementUpdated);
    return () => window.removeEventListener('firstround:entitlement-updated', handleEntitlementUpdated);
  }, [currentUser?.id]);

  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [selectingTestId, setSelectingTestId] = useState<string | null>(null);

  const isAdminUser = currentUser?.role === 'admin' || currentUser?.role === 'super_admin';
  const activePlan = subscription ? subscription.plan : (currentUser?.plan || 'FREE');
  const isSubActive = subscription
    ? (subscription.status || '').toLowerCase() === 'active'
    : ((currentUser?.subscriptionStatus || '').toLowerCase() === 'active');
  const isProOrPremium = isSubActive && (activePlan === 'PRO' || activePlan === 'PREMIUM');
  const isPlusActive = !isAdminUser
    ? (isSubActive && activePlan === 'PLUS')
    : Boolean(subscription && subscription.plan === 'PLUS' && (subscription.status || '').toLowerCase() === 'active');
  const plusSelections = useMemo(() => subscription?.selectedAssessmentIds || [], [subscription]);

  const handleSelectPlusAssessment = async (testId: string) => {
    if (!currentUser?.id) return;
    if (plusSelections.length >= 2 && !plusSelections.includes(testId)) {
      alert('You can select up to 2 Premium tests with Plus.');
      return;
    }
    setSelectingTestId(testId);
    try {
      const res = await apiSelectPlusAssessment(testId, currentUser.id);
      if (res.success) {
        setSubscription((prev) => (prev ? { ...prev, selectedAssessmentIds: res.selections } : null));
      }
    } catch (err: any) {
      alert(err.message || 'Failed to select Premium assessment.');
    } finally {
      setSelectingTestId(null);
    }
  };

  const handleDeselectPlusAssessment = async (testId: string) => {
    if (!currentUser?.id) return;
    setSelectingTestId(testId);
    try {
      const res = await apiDeselectPlusAssessment(testId, currentUser.id);
      if (res.success) {
        setSubscription((prev) => (prev ? { ...prev, selectedAssessmentIds: res.selections } : null));
      }
    } catch (err: any) {
      alert(err.message || 'Failed to deselect Premium assessment.');
    } finally {
      setSelectingTestId(null);
    }
  };

  const handleUnlockAssessment = (test: TestSeries) => {
    if (!currentUser?.id) {
      alert('Please sign in to unlock this assessment.');
      return;
    }

    setPurchasingTestId(test.id);

    startRazorpayPurchase({
      productType: 'ASSESSMENT',
      productId: test.id,
      userId: currentUser.id,
      userName: currentUser.name,
      userEmail: currentUser.email,
      onSuccess: () => {
        setPurchasingTestId(null);
        setUnlockedAssessments((prev) => new Set([...prev, test.id]));
      },
      onError: (err) => {
        setPurchasingTestId(null);
        alert(err || 'Failed to complete assessment purchase.');
      },
    });
  };

  const getTestHistoryStatus = (testId: string) => {
    return testHistory.find((h) => h.testId === testId);
  };

  // Current view state: 'categories' (top level overview) or dedicated category view ('foundation' | 'company' | 'coding')
  const [selectedCategory, setSelectedCategory] = useState<ViewState>(() => {
    return (sessionStorage.getItem('firstround_testhub_category') as ViewState) || 'categories';
  });

  useEffect(() => {
    sessionStorage.setItem('firstround_testhub_category', selectedCategory);
  }, [selectedCategory]);

  // Search state across entire catalogue
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Category specific filters
  const [selectedTopic, setSelectedTopic] = useState<string>('All');
  const [selectedCompany, setSelectedCompany] = useState<string>('All');
  const [selectedTech, setSelectedTech] = useState<string>('All');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('All');
  // Cross-category filters
  const [selectedRole, setSelectedRole] = useState<string>('All');
  const [selectedAvailability, setSelectedAvailability] = useState<string>('All'); // 'All' | 'coming_soon' | 'ready'
  const [showPremiumInfoModal, setShowPremiumInfoModal] = useState(false);

  // Filter tests strictly belonging to the new 3-category architecture
  // (Old seeded tests are filtered out so they do not appear in the Explore catalogue)
  const isFoundationTest = (t: TestSeries): boolean => {
    return t.category === 'foundation';
  };

  const isCompanyTest = (t: TestSeries): boolean => {
    return t.category === 'company';
  };

  const isCodingTest = (t: TestSeries): boolean => {
    return t.category === 'coding';
  };

  // Real test collections
  const foundationTests = useMemo(() => tests.filter(isFoundationTest), [tests]);
  const companyTests = useMemo(() => tests.filter(isCompanyTest), [tests]);
  const codingTests = useMemo(() => tests.filter(isCodingTest), [tests]);

  // Real test counts per primary category
  const categoryCounts = useMemo(
    () => ({
      foundation: foundationTests.length,
      company: companyTests.length,
      coding: codingTests.length,
      total: foundationTests.length + companyTests.length + codingTests.length,
    }),
    [foundationTests, companyTests, codingTests]
  );

  // Available dynamic roles from all tests (cross-category, for the role filter pill row)
  const dynamicRoles = useMemo(() => {
    const set = new Set<string>();
    tests.forEach((t) => {
      (t.roles || t.supportedRoles || []).forEach((r) => set.add(r));
    });
    return Array.from(set).sort();
  }, [tests]);

  // Available dynamic topics from real foundation tests
  const dynamicTopics = useMemo(() => {
    const set = new Set<string>();
    foundationTests.forEach((t) => {
      if (t.topics) t.topics.forEach((top) => set.add(top));
      if (t.skills) t.skills.forEach((s) => set.add(s));
    });
    return Array.from(set);
  }, [foundationTests]);

  // Available dynamic companies from real company tests
  const dynamicCompanies = useMemo(() => {
    const set = new Set<string>();
    companyTests.forEach((t) => {
      if (t.company) set.add(t.company);
      if (t.companyName) set.add(t.companyName);
      if (t.companyId) set.add(t.companyId.toUpperCase());
    });
    return Array.from(set);
  }, [companyTests]);

  // Available dynamic technologies from real coding tests
  const dynamicTechnologies = useMemo(() => {
    const set = new Set<string>();
    codingTests.forEach((t) => {
      if (t.skills) t.skills.forEach((s) => set.add(s));
      if (t.topics) t.topics.forEach((top) => set.add(top));
    });
    return Array.from(set);
  }, [codingTests]);

  // Unified metadata search matcher
  const matchesSearch = (test: TestSeries, query: string): boolean => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);

    const title = (test.title || '').toLowerCase();
    const desc = (test.description || '').toLowerCase();
    const company = (test.company || test.companyName || test.companyId || '').toLowerCase();
    const category = (test.category || '').toLowerCase();
    const testType = (test.testType || '').toLowerCase();
    const difficulty = (test.difficulty || '').toLowerCase();
    const topics = (test.topics || []).map((t) => t.toLowerCase()).join(' ');
    const skills = (test.skills || []).map((s) => s.toLowerCase()).join(' ');
    const roles = (test.roles || []).map((r) => r.toLowerCase()).join(' ');
    const tags = (test.tags || []).map((t) => t.toLowerCase()).join(' ');

    const fullBlob = `${title} ${desc} ${company} ${category} ${testType} ${difficulty} ${topics} ${skills} ${roles} ${tags}`;

    return words.every((word) => fullBlob.includes(word));
  };

  // Active filtered tests for the currently active category view or search
  const filteredCategoryTests = useMemo(() => {
    let list: TestSeries[] = [];

    if (selectedCategory === 'foundation') {
      list = foundationTests;
      if (selectedTopic !== 'All') {
        list = list.filter(
          (t) =>
            t.topics?.includes(selectedTopic) ||
            t.skills?.includes(selectedTopic) ||
            t.title.toLowerCase().includes(selectedTopic.toLowerCase())
        );
      }
    } else if (selectedCategory === 'company') {
      list = companyTests;
      if (selectedCompany !== 'All') {
        const cLow = selectedCompany.toLowerCase();
        list = list.filter(
          (t) =>
            t.company?.toLowerCase().includes(cLow) ||
            t.companyName?.toLowerCase().includes(cLow) ||
            t.companyId?.toLowerCase().includes(cLow) ||
            t.title.toLowerCase().includes(cLow)
        );
      }
    } else if (selectedCategory === 'coding') {
      list = codingTests;
      if (selectedTech !== 'All') {
        const techLow = selectedTech.toLowerCase();
        list = list.filter(
          (t) =>
            t.skills?.some((s) => s.toLowerCase().includes(techLow)) ||
            t.topics?.some((top) => top.toLowerCase().includes(techLow)) ||
            t.title.toLowerCase().includes(techLow)
        );
      }
    } else {
      // 'categories' view - when searching at top level, search across all 3 categories
      list = [...foundationTests, ...companyTests, ...codingTests];
    }

    // Difficulty filter (all categories)
    if (selectedDifficulty !== 'All') {
      list = list.filter((t) => t.difficulty === selectedDifficulty);
    }

    // Role filter (cross-category)
    if (selectedRole !== 'All') {
      const roleLow = selectedRole.toLowerCase();
      list = list.filter(
        (t) =>
          (t.roles || t.supportedRoles || []).some((r) => r.toLowerCase().includes(roleLow))
      );
    }

    // Availability filter (cross-category)
    if (selectedAvailability !== 'All') {
      list = list.filter((t) => (t.status ?? 'coming_soon') === selectedAvailability);
    }

    // Full-text search (all fields)
    if (searchQuery.trim()) {
      list = list.filter((t) => matchesSearch(t, searchQuery));
    }

    // Role-First Recommendation Ranking
    const ranked = recommendationEngine.rankAssessments(
      list,
      currentUser,
      userAttempts,
      weakQuestions
    );
    
    // Sort items by recommendation score (playable tests first, highest role score first)
    const scoreMap = new Map(ranked.map((r) => [r.test.id, r.score]));
    return [...list].sort((a, b) => {
      // Prioritize ready status over coming_soon
      if (a.status === 'ready' && b.status !== 'ready') return -1;
      if (b.status === 'ready' && a.status !== 'ready') return 1;

      const scoreA = scoreMap.get(a.id) ?? 0;
      const scoreB = scoreMap.get(b.id) ?? 0;
      return scoreB - scoreA;
    });
  }, [
    selectedCategory,
    foundationTests,
    companyTests,
    codingTests,
    selectedTopic,
    selectedCompany,
    selectedTech,
    selectedDifficulty,
    selectedRole,
    selectedAvailability,
    searchQuery,
    currentUser,
    userAttempts,
    weakQuestions,
  ]);

  const handleResetFilters = () => {
    setSelectedTopic('All');
    setSelectedCompany('All');
    setSelectedTech('All');
    setSelectedDifficulty('All');
    setSelectedRole('All');
    setSelectedAvailability('All');
    setSearchQuery('');
  };

  const getVerificationBadge = (status?: VerificationStatus) => {
    switch (status) {
      case 'VERIFIED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" />
            Verified Pattern
          </span>
        );
      case 'PATTERN_BASED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
            <Sparkles className="w-3 h-3" />
            Pattern-Based
          </span>
        );
      case 'PARTIALLY_VERIFIED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200">
            <HelpCircle className="w-3 h-3" />
            Partially Verified
          </span>
        );
      case 'UNVERIFIED':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-surface-hover text-text-secondary border border-border">
            Draft
          </span>
        );
    }
  };

  const getDifficultyBadge = (difficulty: DifficultyLevel) => {
    switch (difficulty) {
      case 'Easy':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Hard':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'Medium':
      default:
        return 'bg-amber-50 text-amber-800 border-amber-200';
    }
  };

  return (
    <div id="explore-tests-page" className="w-full max-w-7xl mx-auto space-y-5 sm:space-y-6 pb-20 px-0">
      {/* ========================================================= */}
      {/* 1. PAGE HEADER                                            */}
      {/* ========================================================= */}
      <div id="explore-tests-header" className="space-y-2">
        {selectedCategory !== 'categories' && (
          <button
            id="back-to-categories-btn"
            onClick={() => {
              setSelectedCategory('categories');
              handleResetFilters();
            }}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-text-secondary hover:text-primary p-1 -ml-1 rounded-lg hover:bg-surface-hover transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>All Categories</span>
          </button>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-text-primary font-['Outfit'] tracking-tight">
              {selectedCategory === 'categories'
                ? 'Explore Tests'
                : CATEGORIES_CONFIG[selectedCategory].title}
            </h1>
            <p className="text-xs sm:text-sm text-text-muted max-w-2xl mt-0.5">
              {selectedCategory === 'categories'
                ? `${categoryCounts.total} active assessments available in production catalog`
                : CATEGORIES_CONFIG[selectedCategory].description}
            </p>
          </div>

          {/* Real Test Counter Badge */}
          <div className="self-start sm:self-auto flex items-center gap-2">
            <span
              id="catalogue-real-count-badge"
              className="text-[11px] sm:text-xs font-bold px-3 py-1 bg-surface-hover border border-border/90 text-slate-700 rounded-full shadow-2xs"
            >
              {selectedCategory === 'categories'
                ? `${categoryCounts.total} Active Assessments`
                : `${categoryCounts[selectedCategory]} Available Tests`}
            </span>
          </div>
        </div>

        {/* FirstRound Plus Selection Indicator Banner */}
        {isPlusActive && (
          <div id="plus-selection-banner" className="bg-gradient-to-r from-amber-500/10 via-amber-400/5 to-transparent border border-amber-300/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs mt-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-400 text-slate-950 font-black flex items-center justify-center shrink-0 shadow-2xs border border-amber-500">
                <Crown className="w-5 h-5 text-slate-950 fill-slate-950" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  FirstRound Plus Active
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-400 text-slate-950 shadow-2xs">
                    PLUS
                  </span>
                </h3>
                <p className="text-xs text-slate-600">
                  Select up to 2 Premium assessments to unlock full practice & exam access.
                </p>
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface border border-amber-300 shadow-2xs font-extrabold text-xs text-slate-900">
              <span className="text-amber-600 text-sm font-black">{plusSelections.length}/2</span> Selected
            </div>
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* 2. UNIFIED SEARCH BAR                                     */}
      {/* ========================================================= */}
      <div
        id="explore-tests-search-container"
        className="bg-surface rounded-2xl p-3.5 sm:p-4 border border-border/90 shadow-2xs space-y-3"
      >
        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="explore-tests-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search test name, company, topic, skill, role, technology (e.g. TCS, Infosys, SQL, DSA, Time & Work)..."
            className="w-full h-11 sm:h-11 pl-10 pr-10 bg-app-bg hover:bg-surface focus:bg-surface border border-border rounded-xl text-xs sm:text-sm text-text-primary placeholder-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all shadow-2xs"
          />
          {searchQuery && (
            <button
              id="clear-catalogue-search-btn"
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-surface-hover transition-colors"
              title="Clear search query"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Category Fast Switcher Pills (Horizontal scroll on mobile) */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar pt-1">
          <button
            id="cat-tab-all"
            onClick={() => setSelectedCategory('categories')}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all ${
              selectedCategory === 'categories'
                ? 'bg-primary text-white shadow-xs'
                : 'bg-surface-hover hover:bg-slate-200/70 text-slate-700 border border-border/60'
            }`}
          >
            All Categories
          </button>

          {(['foundation', 'company', 'coding'] as PrimaryTestCategory[]).map((catKey) => {
            const meta = CATEGORIES_CONFIG[catKey];
            const isSelected = selectedCategory === catKey;
            const count = categoryCounts[catKey];
            return (
              <button
                key={catKey}
                id={`cat-tab-${catKey}`}
                onClick={() => setSelectedCategory(catKey)}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all flex items-center gap-2 ${
                  isSelected
                    ? 'bg-primary text-white shadow-xs'
                    : 'bg-surface-hover hover:bg-slate-200/70 text-slate-700 border border-border/60'
                }`}
              >
                <span>{meta.shortTitle}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded font-extrabold ${
                    isSelected
                      ? 'bg-amber-400 text-slate-950'
                      : 'bg-surface text-text-secondary border border-border'
                  }`}
                >
                  {count > 0 ? count : 'Soon'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ========================================================= */}
      {/* 3. MAIN EXPLORE VIEW (3 PRIMARY CATEGORIES CARDS)         */}
      {/* ========================================================= */}
      {selectedCategory === 'categories' && !searchQuery.trim() && (
        <div id="three-category-overview-section" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
            {/* CATEGORY 1: FOUNDATION & SECTIONAL */}
            <div
              id="category-card-foundation"
              className="bg-surface border border-border/90 hover:border-blue-300 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col justify-between transition-all group"
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200/80 text-blue-700 flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  {categoryCounts.foundation > 0 ? (
                    <span className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                      {categoryCounts.foundation} Tests
                    </span>
                  ) : (
                    <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-surface-hover text-text-secondary border border-border">
                      Coming soon
                    </span>
                  )}
                </div>

                <div>
                  <h3 className="text-base sm:text-lg font-bold font-['Outfit'] text-text-primary group-hover:text-blue-900 transition-colors">
                    FOUNDATION & SECTIONAL
                  </h3>
                  <p className="text-xs font-semibold text-blue-700 mt-0.5">
                    "Build your placement fundamentals."
                  </p>
                </div>

                <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
                  Short focused assessments that help students build individual placement skills.
                  Build core fundamentals before attempting full mocks.
                </p>

                {/* Scope & Duration note */}
                <div className="p-3 bg-app-bg border border-slate-150 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-text-muted font-bold">
                    <span>Typical Duration:</span>
                    <span className="text-slate-800 font-extrabold">10–30 minutes</span>
                  </div>
                  <div className="text-[11px] text-text-muted">
                    <span className="font-semibold text-slate-700">Planned Focus:</span> Quant, Logical, Verbal, Pseudocode, Data Interpretation
                  </div>
                </div>
              </div>

              <div className="pt-5 mt-auto">
                <button
                  id="view-foundation-tests-btn"
                  onClick={() => setSelectedCategory('foundation')}
                  className="w-full min-h-[44px] py-2.5 px-4 bg-primary hover:bg-primary-hover active:bg-primary-active text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 group/btn"
                >
                  <span>View Tests</span>
                  <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>

            {/* CATEGORY 2: COMPANY-SPECIFIC MOCKS */}
            <div
              id="category-card-company"
              className="bg-surface border border-border/90 hover:border-purple-300 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col justify-between transition-all group"
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-purple-50 border border-purple-200/80 text-purple-700 flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform">
                    <Building2 className="w-6 h-6" />
                  </div>
                  {categoryCounts.company > 0 ? (
                    <span className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                      {categoryCounts.company} Tests
                    </span>
                  ) : (
                    <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-surface-hover text-text-secondary border border-border">
                      Coming soon
                    </span>
                  )}
                </div>

                <div>
                  <h3 className="text-base sm:text-lg font-bold font-['Outfit'] text-text-primary group-hover:text-purple-900 transition-colors">
                    COMPANY-SPECIFIC MOCKS
                  </h3>
                  <p className="text-xs font-semibold text-purple-700 mt-0.5">
                    "Practice assessments based on real company patterns."
                  </p>
                </div>

                <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
                  Realistic placement assessments based on researched and verified company
                  assessment patterns (TCS, Infosys, Accenture, Wipro, Cognizant).
                </p>

                {/* Scope & Duration note */}
                <div className="p-3 bg-app-bg border border-slate-150 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-text-muted font-bold">
                    <span>Pattern Status:</span>
                    <span className="text-purple-800 font-extrabold">Research & Verification</span>
                  </div>
                  <div className="text-[11px] text-text-muted">
                    <span className="font-semibold text-slate-700">Planned Companies:</span> TCS NQT, Infosys, Accenture, Wipro, Cognizant
                  </div>
                </div>
              </div>

              <div className="pt-5 mt-auto">
                <button
                  id="view-company-mocks-btn"
                  onClick={() => setSelectedCategory('company')}
                  className="w-full min-h-[44px] py-2.5 px-4 bg-primary hover:bg-primary-hover active:bg-primary-active text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 group/btn"
                >
                  <span>View Tests</span>
                  <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>

            {/* CATEGORY 3: CODING & TECHNICAL */}
            <div
              id="category-card-coding"
              className="bg-surface border border-border/90 hover:border-emerald-300 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col justify-between transition-all group"
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200/80 text-emerald-700 flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform">
                    <Code2 className="w-6 h-6" />
                  </div>
                  {categoryCounts.coding > 0 ? (
                    <span className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {categoryCounts.coding} Tests
                    </span>
                  ) : (
                    <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-surface-hover text-text-secondary border border-border">
                      Coming soon
                    </span>
                  )}
                </div>

                <div>
                  <h3 className="text-base sm:text-lg font-bold font-['Outfit'] text-text-primary group-hover:text-emerald-900 transition-colors">
                    CODING & TECHNICAL
                  </h3>
                  <p className="text-xs font-semibold text-emerald-700 mt-0.5">
                    "Prepare for coding and technical evaluations."
                  </p>
                </div>

                <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
                  Technical problem-solving and coding preparation: DSA concepts, SQL querying,
                  programming logic, output prediction, and CS fundamentals.
                </p>

                {/* Scope & Duration note */}
                <div className="p-3 bg-app-bg border border-slate-150 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-text-muted font-bold">
                    <span>Technical Tracks:</span>
                    <span className="text-emerald-800 font-extrabold">DSA, SQL & Core CS</span>
                  </div>
                  <div className="text-[11px] text-text-muted">
                    <span className="font-semibold text-slate-700">Planned Topics:</span> DSA, SQL, C, C++, Java, Python, Pseudocode
                  </div>
                </div>
              </div>

              <div className="pt-5 mt-auto">
                <button
                  id="view-coding-tests-btn"
                  onClick={() => setSelectedCategory('coding')}
                  className="w-full min-h-[44px] py-2.5 px-4 bg-primary hover:bg-primary-hover active:bg-primary-active text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 group/btn"
                >
                  <span>View Tests</span>
                  <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 4. DEDICATED CATEGORY VIEW OR SEARCH RESULTS              */}
      {/* ========================================================= */}
      {(selectedCategory !== 'categories' || searchQuery.trim() !== '') && (
        <div id="category-detail-catalogue" className="space-y-4">
          {/* New Modular Filter System */}
          <ExploreFilters
            selectedCategory={selectedCategory}
            dynamicTopics={dynamicTopics}
            dynamicCompanies={dynamicCompanies}
            dynamicTechnologies={dynamicTechnologies}
            dynamicRoles={dynamicRoles}
            selectedTopic={selectedTopic}
            setSelectedTopic={setSelectedTopic}
            selectedCompany={selectedCompany}
            setSelectedCompany={setSelectedCompany}
            selectedTech={selectedTech}
            setSelectedTech={setSelectedTech}
            selectedDifficulty={selectedDifficulty}
            setSelectedDifficulty={setSelectedDifficulty}
            selectedRole={selectedRole}
            setSelectedRole={setSelectedRole}
            selectedAvailability={selectedAvailability}
            setSelectedAvailability={setSelectedAvailability}
            onReset={handleResetFilters}
            resultCount={filteredCategoryTests.length}
          />

          {/* Test Cards Grid */}
          {filteredCategoryTests.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCategoryTests.filter((test): test is TestSeries => Boolean(test && test.id)).map((test) => {
                const isComingSoon = test.status === 'coming_soon';
                const isPremiumAssessment = test.accessType === 'PREMIUM';
                const isPlusSelected = Boolean(plusSelections && plusSelections.includes(test.id));
                const isIndividuallyUnlocked = Boolean(currentUser && unlockedAssessments && unlockedAssessments.has(test.id));

                const hasAccess = !isPremiumAssessment || Boolean(
                  currentUser && (
                    currentUser.role === 'admin' ||
                    currentUser.role === 'super_admin' ||
                    (unlockedAssessments && unlockedAssessments.has(test.id)) ||
                    isProOrPremium ||
                    (isPlusActive && isPlusSelected)
                  )
                );

                const isLocked = isPremiumAssessment && !hasAccess;

                return (
                  <div
                    key={test.id}
                    id={`test-card-${test.id}`}
                    className={`bg-surface rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4 border transition-all relative overflow-hidden ${
                      isComingSoon
                        ? 'border-border/70 opacity-90'
                        : isLocked
                        ? 'border-amber-300/80 bg-gradient-to-b from-white to-amber-500/[0.02]'
                        : 'border-border/90 hover:border-slate-300'
                    }`}
                  >
                    {/* Content Layer (Always unblurred and fully readable) */}
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Unified PREMIUM badge */}
                          {isPremiumAssessment && (
                            <span
                              id={`premium-badge-${test.id}`}
                              title="Premium Assessment"
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-400 text-slate-950 shadow-2xs border border-amber-500"
                            >
                              <Crown className="w-3 h-3 text-slate-950 fill-slate-950" />
                              <span>PREMIUM</span>
                            </span>
                          )}
                          {/* Coming Soon pill replaces verification badge for blueprint tests */}
                          {isComingSoon ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-surface-hover text-text-muted border border-border">
                              <Layers className="w-3 h-3" />
                              Coming Soon
                            </span>
                          ) : (
                            getVerificationBadge(test.verificationStatus)
                          )}
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${getDifficultyBadge(
                              test.difficulty
                            )}`}
                          >
                            {test.difficulty}
                          </span>
                          {(() => {
                            const h = getTestHistoryStatus(test.id);
                            if (!h) return null;
                            if (h.status === 'COMPLETED') {
                              return <span className="inline-block px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold border border-emerald-200 tracking-wider">✓ Completed</span>;
                            }
                            if (h.status === 'IN_PROGRESS') {
                              return <span className="inline-block px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-bold border border-amber-200 tracking-wider">In Progress</span>;
                            }
                            if (h.status === 'VISITED') {
                              return <span className="inline-block px-2 py-0.5 bg-surface-hover text-text-muted rounded text-[10px] font-bold border border-border tracking-wider">Visited</span>;
                            }
                            return null;
                          })()}
                        </div>
                        <span className="text-xs font-bold text-text-muted flex items-center gap-1 shrink-0">
                          <Clock className="w-3.5 h-3.5" />
                          {test.durationMinutes || test.duration || 0}m
                        </span>
                      </div>

                      <h4 className="text-sm sm:text-base font-bold text-text-primary leading-snug">
                        {test.title}
                      </h4>

                      <p className="text-xs text-text-secondary line-clamp-2">
                        {test.description}
                      </p>

                      {/* Metadata tags */}
                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        {test.company && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200">
                            {test.company}
                          </span>
                        )}
                        {test.topics?.slice(0, 3).map((top) => (
                          <span
                            key={top}
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-surface-hover text-slate-700 border border-border"
                          >
                            {top}
                          </span>
                        ))}
                        {test.skills?.slice(0, 2).map((sk) => (
                          <span
                            key={sk}
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200"
                          >
                            {sk}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Bottom Action Bar */}
                    {hasAccess ? (
                       // Accessible test (including Premium with access)
                       <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                         <span className="text-xs text-text-muted font-semibold">
                           {test.totalQuestions || test.questionCount || 0} Questions
                         </span>
                         <div className="flex items-center gap-2">
                           <button
                             id={`practice-btn-${test.id}`}
                             onClick={() => handleStartTestWithPerf(test, 'practice')}
                             className="min-h-[38px] px-3.5 py-1.5 bg-surface hover:bg-app-bg text-slate-700 text-xs font-bold rounded-xl border border-border transition-colors flex items-center gap-1.5"
                           >
                             Practice
                           </button>
                           <button
                             id={`start-test-btn-${test.id}`}
                             onClick={() => handleStartTestWithPerf(test, 'exam')}
                             className="min-h-[38px] px-3.5 py-1.5 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
                           >
                             <Play className="w-3.5 h-3.5 fill-white" />
                             <span>Start Test</span>
                           </button>
                         </div>
                       </div>
                     ) : isPlusActive && isPremiumAssessment ? (
                       // Plus selection UI when not yet unlocked
                       <div className="pt-3 border-t border-slate-200/80 -mx-5 -mb-5 p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 rounded-b-2xl bg-slate-50/50">
                         <span className="text-xs text-slate-600 font-semibold">
                           {test.totalQuestions || test.questionCount || 0} Questions • Plus Assessment
                         </span>
                         <div className="flex items-center gap-2 shrink-0">
                           {plusSelections.length < 2 ? (
                             <button
                               id={`select-plus-btn-${test.id}`}
                               disabled={selectingTestId === test.id}
                               onClick={() => handleSelectPlusAssessment(test.id)}
                               className="px-4 py-1.5 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-slate-950 text-xs font-extrabold rounded-xl shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                             >
                               {selectingTestId === test.id ? (
                                 <>
                                   <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                   <span>Selecting...</span>
                                 </>
                               ) : (
                                 <>
                                   <Crown className="w-3.5 h-3.5" />
                                   <span>Select Assessment</span>
                                 </>
                               )}
                             </button>
                           ) : (
                             <button
                               id={`plus-limit-btn-${test.id}`}
                               disabled
                               className="px-3.5 py-1.5 bg-slate-100 text-slate-500 text-xs font-bold rounded-xl border border-slate-200 cursor-not-allowed flex items-center gap-1.5"
                             >
                               <Lock className="w-3.5 h-3.5" />
                               <span>2/2 Selections Used</span>
                             </button>
                           )}
                         </div>
                       </div>
                     ) : (
                       // Locked Premium without Plus: show unlock only
                       <div className="pt-3 border-t border-amber-200/80 bg-amber-500/[0.04] -mx-5 -mb-5 p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 rounded-b-2xl">
                         <div className="flex items-center gap-1.5 text-slate-700 font-bold text-xs">
                           <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                           <span>{test.totalQuestions || test.questionCount || 0} Questions • Premium</span>
                         </div>
                         <div className="flex items-center gap-2 shrink-0">
                           <button
                             id={`locked-btn-${test.id}`}
                             disabled={purchasingTestId === test.id}
                             onClick={() => handleUnlockAssessment(test)}
                             className="px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-slate-950 text-xs font-extrabold rounded-xl shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                           >
                             {purchasingTestId === test.id ? (
                               <>
                                 <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                 <span>Unlocking...</span>
                               </>
                             ) : (
                               <>
                                 <Lock className="w-3.5 h-3.5" />
                                 <span>Get Premium</span>
                               </>
                             )}
                           </button>
                         </div>
                       </div>
                     )}
                  </div>
                );
              })}
            </div>

          ) : (
            /* ========================================================= */
            /* 5. INTENTIONAL, POLISHED EMPTY STATES                     */
            /* ========================================================= */
            <div
              id="category-empty-state"
              className="bg-surface border border-border/90 rounded-2xl p-8 sm:p-12 text-center max-w-2xl mx-auto shadow-2xs space-y-4"
            >
              <div className="w-14 h-14 rounded-2xl bg-surface-hover border border-border text-text-muted flex items-center justify-center mx-auto shadow-2xs">
                {searchQuery.trim() ? (
                  <Search className="w-7 h-7 text-slate-400" />
                ) : selectedCategory === 'company' ? (
                  <Building2 className="w-7 h-7 text-purple-600" />
                ) : selectedCategory === 'coding' ? (
                  <Code2 className="w-7 h-7 text-emerald-600" />
                ) : (
                  <BookOpen className="w-7 h-7 text-blue-600" />
                )}
              </div>

              <div className="space-y-1.5">
                <h3 className="text-base sm:text-lg font-bold font-['Outfit'] text-text-primary">
                  {searchQuery.trim()
                    ? `No assessments found for "${searchQuery}"`
                    : selectedCategory !== 'categories'
                    ? CATEGORIES_CONFIG[selectedCategory].emptyTitle
                    : 'No assessments available'}
                </h3>
                <p className="text-xs sm:text-sm text-text-secondary max-w-md mx-auto leading-relaxed">
                  {searchQuery.trim()
                    ? 'Try searching by company name, skill, topic, or role, or clear your search to explore all categories.'
                    : selectedCategory !== 'categories'
                    ? CATEGORIES_CONFIG[selectedCategory].emptyDescription
                    : 'Tests for this category are currently being structured according to verified assessment patterns.'}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-center gap-3 flex-wrap">
                {searchQuery.trim() ? (
                  <button
                    id="reset-search-empty-btn"
                    onClick={() => {
                      setSearchQuery('');
                      handleResetFilters();
                    }}
                    className="min-h-[44px] px-5 py-2.5 bg-surface-hover hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl border border-border transition-colors"
                  >
                    Clear Search
                  </button>
                ) : selectedCategory !== 'foundation' ? (
                  <>
                    <button
                      id="explore-foundation-tests-action-btn"
                      onClick={() => setSelectedCategory('foundation')}
                      className="min-h-[44px] px-5 py-2.5 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
                    >
                      Explore Foundation Tests
                    </button>
                    <button
                      id="return-all-categories-btn"
                      onClick={() => setSelectedCategory('categories')}
                      className="min-h-[44px] px-4 py-2.5 bg-surface-hover hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-border transition-colors"
                    >
                      All Categories
                    </button>
                  </>
                ) : (
                  <button
                    id="return-all-categories-btn-2"
                    onClick={() => setSelectedCategory('categories')}
                    className="min-h-[44px] px-5 py-2.5 bg-surface-hover hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-border transition-colors"
                  >
                    Return to Categories
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL: FIRSTROUND PREMIUM INFORMATIONAL DRAWER */}
      {showPremiumInfoModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-5 text-slate-900 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-bold shadow-xs">
                  <Crown className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold font-['Outfit'] text-slate-950">FirstRound Premium</h3>
                  <p className="text-2xs text-amber-700 font-bold uppercase tracking-wider">Coming Soon in Phase 2</p>
                </div>
              </div>
              <button
                onClick={() => setShowPremiumInfoModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
              <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-1.5">
                <p className="font-bold text-amber-950 text-xs">FirstRound is primarily 100% FREE.</p>
                <p className="text-2xs text-amber-900">
                  All foundation practice tests, canonical question banks, community leaderboards, and the FirstRound AI Copilot remain completely free for every student.
                </p>
              </div>

              <div className="space-y-2 pt-1">
                <p className="font-bold text-slate-900">FirstRound Premium will unlock only:</p>
                <ul className="space-y-1.5 text-2xs text-slate-700">
                  <li className="flex items-start gap-2">
                    <span className="text-amber-600 font-bold">1.</span>
                    <span>Exclusive company premium simulation mock assessments.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-600 font-bold">2.</span>
                    <span>Deep AI Socratic Tutor guidance inside Practice Mode.</span>
                  </li>
                </ul>
              </div>

              <p className="text-2xs text-slate-500 italic pt-1">
                Real payment integrations will be added in Phase 2 without affecting your current free experience.
              </p>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setShowPremiumInfoModal(false)}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
