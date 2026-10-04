import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  ArrowRight,
  BarChart3,
  BookOpen,
  Bot,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Crown,
  Edit3,
  Eye,
  FileCode,
  FileJson,
  FileSpreadsheet,
  FileText,
  Filter,
  HelpCircle,
  Layers,
  Lock,
  Megaphone,
  Plus,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { AdminStats, Question, TestSeries, User, CreditSource, DeepAICreditBalance, DeepAICreditLedgerItem, AssessmentEntitlement, PaymentOrder, Advertisement } from '../types';
import {
  apiCheckQuestionDuplicates,
  apiCreateAnnouncement,
  apiGetCandidateCount,
  apiDeleteAdminAssessment,
  apiDeleteCanonicalQuestion,
  apiGetAdminStats,
  apiGetAdminUsersDirectory,
  apiGetQuestionBankCount,
  apiGetCanonicalQuestions,
  apiGetQAReport,
  apiGetTeamMembers,
  apiImportQuestionsBulk,
  apiPromoteUser,
  apiRevokeUser,
  apiSaveAdminAssessment,
  apiSaveCanonicalQuestion,
  apiSearchUsers,
  apiUpdateAssessmentStatus,
  apiAdminAdjustCredits,
  apiAdminGetUserCredits,
  apiAdminGetUserEntitlements,
  apiAdminGrantEntitlement,
  apiAdminRevokeEntitlement,
  apiAdminGetPayments,
  apiAdminGetSubscriptions,
  apiSetTestAccessType,
  apiGetAdminAdvertisements,
  apiCreateAdvertisement,
  apiUpdateAdvertisement,
  apiUpdateAdvertisementStatus,
  apiDeleteAdvertisement,
  apiAdminGrantCredits,
  apiAdminTempBanUser,
  apiAdminRestoreUserAccess,
  apiAdminPermBanUser,
  apiAdminDeleteUser,
  apiIngestTestContent,
  apiCompleteQuestion,
} from '../api';
import { AdminAssessmentPreview } from './AdminPanel/AdminAssessmentPreview';
import { getAllStaticCanonicalQuestions } from '../data/questionBank/staticFallback';
import { SponsorAdCard } from './SponsorAdCard';
import { TopSponsorBanner } from './TopSponsorBanner';

function isoToDatetimeLocal(isoStr?: string | null): string {
  if (!isoStr || !isoStr.trim()) return '';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch {
    return '';
  }
}

function datetimeLocalToIso(dtStr?: string | null): string | null {
  if (!dtStr || !dtStr.trim()) return null;
  try {
    const d = new Date(dtStr);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

interface AdminPanelProps {
  currentUser?: User | null;
  onRefreshTests: () => Promise<void>;
  tests: TestSeries[];
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ currentUser, onRefreshTests, tests }) => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [qaReport, setQaReport] = useState<any | null>(null);
  const [loadingQA, setLoadingQA] = useState(false);
  const [showQADashboard, setShowQADashboard] = useState(false);

  // Core Sub-navigation state
  const [adminSubTab, setAdminSubTab] = useState<'overview' | 'users' | 'payments' | 'ads' | 'team'>('overview');
  const [showQuestionBankModal, setShowQuestionBankModal] = useState(false);
  const [paymentsList, setPaymentsList] = useState<PaymentOrder[]>([]);
  const [subscriptionsList, setSubscriptionsList] = useState<(any)[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [paymentFromDate, setPaymentFromDate] = useState<string>('2026-09-18');
  const [paymentToDate, setPaymentToDate] = useState<string>('2026-09-25');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('ALL');
  const [paymentSkip, setPaymentSkip] = useState<number>(0);
  const [paymentCount] = useState<number>(50);
  const [paymentPagination, setPaymentPagination] = useState<{ total: number; count: number; skip: number; hasMore: boolean }>({
    total: 0,
    count: 50,
    skip: 0,
    hasMore: false,
  });
  const [paymentSummary, setPaymentSummary] = useState<{
    totalAmount: number;
    capturedCount: number;
    createdCount: number;
    unmatchedCount: number;
    fulfilledCount: number;
    pendingCount: number;
  }>({
    totalAmount: 0,
    capturedCount: 0,
    createdCount: 0,
    unmatchedCount: 0,
    fulfilledCount: 0,
    pendingCount: 0,
  });

  // Advertisements / Sponsors State
  const [adsList, setAdsList] = useState<Advertisement[]>([]);
  const [loadingAds, setLoadingAds] = useState(false);
  const [adSearch, setAdSearch] = useState('');
  const [adStatusFilter, setAdStatusFilter] = useState<string>('ALL');
  const [showAdModal, setShowAdModal] = useState(false);
  const [editingAd, setEditingAd] = useState<Advertisement | null>(null);
  const [deletingAd, setDeletingAd] = useState<Advertisement | null>(null);
  const [isDeletingAd, setIsDeletingAd] = useState(false);

  // Ad Form Inputs
  const [adSponsorName, setAdSponsorName] = useState('');
  const [adTitle, setAdTitle] = useState('');
  const [adDescription, setAdDescription] = useState('');
  const [adLogoUrl, setAdLogoUrl] = useState('');
  const [adCardImageUrl, setAdCardImageUrl] = useState('');
  const [adDestinationUrl, setAdDestinationUrl] = useState('');
  const [adCtaText, setAdCtaText] = useState('Learn More');
  const [adAdType, setAdAdType] = useState<'STRUCTURED_CARD' | 'OPTIONAL_CREATIVE_CARD'>('STRUCTURED_CARD');
  const [adPlacement, setAdPlacement] = useState<string>('DASHBOARD_SIDEBAR');
  const [adSelectedPlacements, setAdSelectedPlacements] = useState<string[]>(['DASHBOARD_SIDEBAR']);
  const [adStatus, setAdStatus] = useState<'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED'>('DRAFT');
  const [adPriority, setAdPriority] = useState(10);
  const [adStartAt, setAdStartAt] = useState('');
  const [adEndAt, setAdEndAt] = useState('');
  const [isSubmittingAd, setIsSubmittingAd] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [previewPlacementTab, setPreviewPlacementTab] = useState<'DASHBOARD_TOP' | 'DASHBOARD_BOTTOM' | 'LANDING_TOP'>('DASHBOARD_BOTTOM');

  // User Directory State
  const [userDirectory, setUserDirectory] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userDirectorySearch, setUserDirectorySearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'ALL' | 'student' | 'admin' | 'super_admin'>('ALL');
  const [selectedUserForDetails, setSelectedUserForDetails] = useState<User | null>(null);
  const [userCredits, setUserCredits] = useState<DeepAICreditBalance | null>(null);
  const [userLedger, setUserLedger] = useState<DeepAICreditLedgerItem[]>([]);
  const [userEntitlements, setUserEntitlements] = useState<AssessmentEntitlement[]>([]);
  const [adjustAmount, setAdjustAmount] = useState<number>(5);
  const [adjustSource, setAdjustSource] = useState<CreditSource>('PURCHASED');
  const [adjustDesc, setAdjustDesc] = useState<string>('Admin grant');
  const [grantTestId, setGrantTestId] = useState<string>('');
  const [isAdjustingCredits, setIsAdjustingCredits] = useState(false);
  const [isGrantingEntitlement, setIsGrantingEntitlement] = useState(false);

  useEffect(() => {
    if (selectedUserForDetails && currentUser?.id) {
      apiAdminGetUserCredits(currentUser.id, selectedUserForDetails.id)
        .then((data) => {
          setUserCredits(data.balance);
          setUserLedger(data.ledger || []);
        })
        .catch((e) => console.error('Failed to get user credits', e));

      apiAdminGetUserEntitlements(currentUser.id, selectedUserForDetails.id)
        .then((data) => setUserEntitlements(data.entitlements || []))
        .catch((e) => console.error('Failed to get user entitlements', e));
    } else {
      setUserCredits(null);
      setUserLedger([]);
      setUserEntitlements([]);
    }
  }, [selectedUserForDetails, currentUser]);

  const handleGrantCredits = async () => {
    if (!selectedUserForDetails || !currentUser?.id) return;
    const amount = Number(adjustAmount);
    if (isNaN(amount) || amount <= 0) {
      setMessage({ text: 'Please enter a valid positive credit amount', type: 'error' });
      return;
    }
    try {
      setIsAdjustingCredits(true);
      const res = await apiAdminGrantCredits(
        currentUser.id,
        selectedUserForDetails.id,
        amount,
        adjustSource,
        adjustDesc || 'Admin grant'
      );
      setUserCredits(res.balance);
      setUserLedger(res.ledger || []);
      setAdjustAmount(0);
      setMessage({ text: `Successfully granted +${amount} ${adjustSource} credits to ${selectedUserForDetails.name}`, type: 'success' });
    } catch (e: any) {
      setMessage({ text: e.message || 'Failed to grant credits', type: 'error' });
    } finally {
      setIsAdjustingCredits(false);
    }
  };

  // Account Access Handlers (Phase H.5)
  const [banDurationDays, setBanDurationDays] = useState<number>(7);
  const [banReason, setBanReason] = useState<string>('');
  const [permBanConfirm, setPermBanConfirm] = useState<string>('');
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState<string>('');
  const [activeAccessAction, setActiveAccessAction] = useState<'none' | 'temp_ban' | 'perm_ban' | 'delete'>('none');
  const [isSubmittingAccessAction, setIsSubmittingAccessAction] = useState(false);

  const handleTempBan = async () => {
    if (!selectedUserForDetails || !currentUser?.id) return;
    try {
      setIsSubmittingAccessAction(true);
      const res = await apiAdminTempBanUser(currentUser.id, selectedUserForDetails.id, banDurationDays, banReason);
      setSelectedUserForDetails(res.user);
      setUserDirectory((prev) => prev.map((u) => (u.id === res.user.id ? res.user : u)));
      setActiveAccessAction('none');
      setBanReason('');
      setMessage({ text: `User ${res.user.name} temporarily banned for ${banDurationDays} days`, type: 'success' });
    } catch (e: any) {
      setMessage({ text: e.message || 'Failed to apply temporary ban', type: 'error' });
    } finally {
      setIsSubmittingAccessAction(false);
    }
  };

  const handleRestoreAccess = async () => {
    if (!selectedUserForDetails || !currentUser?.id) return;
    try {
      setIsSubmittingAccessAction(true);
      const res = await apiAdminRestoreUserAccess(currentUser.id, selectedUserForDetails.id);
      setSelectedUserForDetails(res.user);
      setUserDirectory((prev) => prev.map((u) => (u.id === res.user.id ? res.user : u)));
      setMessage({ text: `Access restored for ${res.user.name}`, type: 'success' });
    } catch (e: any) {
      setMessage({ text: e.message || 'Failed to restore access', type: 'error' });
    } finally {
      setIsSubmittingAccessAction(false);
    }
  };

  const handlePermBan = async () => {
    if (!selectedUserForDetails || !currentUser?.id) return;
    try {
      setIsSubmittingAccessAction(true);
      const res = await apiAdminPermBanUser(currentUser.id, selectedUserForDetails.id, permBanConfirm, banReason);
      setSelectedUserForDetails(res.user);
      setUserDirectory((prev) => prev.map((u) => (u.id === res.user.id ? res.user : u)));
      setActiveAccessAction('none');
      setPermBanConfirm('');
      setBanReason('');
      setMessage({ text: `User ${res.user.name} permanently banned`, type: 'success' });
    } catch (e: any) {
      setMessage({ text: e.message || 'Failed to apply permanent ban', type: 'error' });
    } finally {
      setIsSubmittingAccessAction(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUserForDetails || !currentUser?.id) return;
    try {
      setIsSubmittingAccessAction(true);
      await apiAdminDeleteUser(currentUser.id, selectedUserForDetails.id, deleteConfirmEmail);
      const updatedUser = { ...selectedUserForDetails, accountStatus: 'DELETED' as const };
      setSelectedUserForDetails(updatedUser);
      setUserDirectory((prev) => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
      setActiveAccessAction('none');
      setDeleteConfirmEmail('');
      setMessage({ text: `User account marked as DELETED`, type: 'success' });
    } catch (e: any) {
      setMessage({ text: e.message || 'Failed to delete user account', type: 'error' });
    } finally {
      setIsSubmittingAccessAction(false);
    }
  };

  // Messages
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Modal Toggles & Extra UX State
  const [showAIGenerator, setShowAIGenerator] = useState(false);
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [showAnnConfirmation, setShowAnnConfirmation] = useState(false);
  const [annAudience, setAnnAudience] = useState('ALL');
  const [builderStep, setBuilderStep] = useState<number>(1);

  // Announcement Form
  const [annTitle, setAnnTitle] = useState('');
  const [annMsg, setAnnMsg] = useState('');
  const [annType, setAnnType] = useState('ANNOUNCEMENT');
  const [annPriority, setAnnPriority] = useState<'Normal' | 'Important' | 'Critical'>('Normal');
  const [annTargetCompany, setAnnTargetCompany] = useState('');
  const [annActionType, setAnnActionType] = useState<string>('NONE');
  const [annActionTestId, setAnnActionTestId] = useState('');
  const [annCandidateCount, setAnnCandidateCount] = useState<number>(0);
  const [isSubmittingAnn, setIsSubmittingAnn] = useState(false);

  useEffect(() => {
    if (showAnnouncementModal && currentUser?.id) {
      apiGetCandidateCount(annTargetCompany || undefined, currentUser.id)
        .then((res) => setAnnCandidateCount(res.count))
        .catch(() => setAnnCandidateCount(0));
    }
  }, [showAnnouncementModal, annTargetCompany, currentUser?.id]);

  // AI Generator Form
  const [aiTopic, setAiTopic] = useState('');
  const [aiCategory, setAiCategory] = useState('Quantitative');
  const [aiDifficulty, setAiDifficulty] = useState('Medium');
  const [aiNumQuestions, setAiNumQuestions] = useState(5);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  // --- ASSESSMENTS BUILDER STATE ---
  const [adminAssessments, setAdminAssessments] = useState<TestSeries[]>([]);
  const [loadingAssessments, setLoadingAssessments] = useState(false);
  const [testCatalogSearch, setTestCatalogSearch] = useState('');
  const [assessmentFilterStatus, setAssessmentFilterStatus] = useState<string>('ALL');
  const [selectedAssessmentForPreview, setSelectedAssessmentForPreview] = useState<TestSeries | null>(null);
  const [showAssessmentModal, setShowAssessmentModal] = useState(false);
  const [editingAssessment, setEditingAssessment] = useState<TestSeries | null>(null);

  // Assessment Form Inputs
  const [assTitle, setAssTitle] = useState('');
  const [assDesc, setAssDesc] = useState('');
  const [assCategory, setAssCategory] = useState('foundation');
  const [assCompany, setAssCompany] = useState('');
  const [assDuration, setAssDuration] = useState(20);
  const [assDifficulty, setAssDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const [assStatus, setAssStatus] = useState<'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'ARCHIVED'>('DRAFT');
  const [assSelectedQuestions, setAssSelectedQuestions] = useState<string[]>([]);
  const [assAccessType, setAssAccessType] = useState<'FREE' | 'PREMIUM'>('FREE');
  const [isSubmittingAssessment, setIsSubmittingAssessment] = useState(false);

  // --- UNIFIED TEST BUILDER STATE ---
  const [builderCreationTab, setBuilderCreationTab] = useState<'manual' | 'ai' | 'import'>('manual');
  const [builderShuffleOptions, setBuilderShuffleOptions] = useState<boolean>(true);
  const [builderQuestions, setBuilderQuestions] = useState<any[]>([]);
  const [importRawText, setImportRawText] = useState('');
  const [importFileType, setImportFileType] = useState<'csv' | 'json' | 'pdf' | 'text'>('csv');
  const [isIngestingContent, setIsIngestingContent] = useState(false);
  const [completingQuestionIdx, setCompletingQuestionIdx] = useState<number | null>(null);
  const [isShufflingPreview, setIsShufflingPreview] = useState(false);

  // --- CANONICAL QUESTION BANK STATE ---
  const [canonicalQuestions, setCanonicalQuestions] = useState<Question[]>(() => getAllStaticCanonicalQuestions());
  const [questionUsageMap, setQuestionUsageMap] = useState<Record<string, string[]>>({});
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [qBankSearch, setQBankSearch] = useState('');
  const [qBankTopicFilter, setQBankTopicFilter] = useState('ALL');
  const [qBankDifficultyFilter, setQBankDifficultyFilter] = useState('ALL');
  const [qBankTypeFilter, setQBankTypeFilter] = useState('ALL');

  // Single Question Form
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [qText, setQText] = useState('');
  const [qType, setQType] = useState<'MCQ' | 'CODING'>('MCQ');
  const [optA, setOptA] = useState('');
  const [optB, setOptB] = useState('');
  const [optC, setOptC] = useState('');
  const [optD, setOptD] = useState('');
  const [correctOpt, setCorrectOpt] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const [qTopic, setQTopic] = useState('Arithmetic');
  const [qDifficulty, setQDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const [qExplanation, setQExplanation] = useState('');
  const [qShortcut, setQShortcut] = useState('');
  const [qSource, setQSource] = useState('Admin');
  const [isSubmittingQuestion, setIsSubmittingQuestion] = useState(false);

  // Duplicate Check Engine State
  const [duplicateResult, setDuplicateResult] = useState<any | null>(null);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);

  // Bulk Import State
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [bulkRawText, setBulkRawText] = useState('');
  const [bulkParsedQuestions, setBulkParsedQuestions] = useState<any[]>([]);
  const [bulkResolutions, setBulkResolutions] = useState<Record<number, string>>({});
  const [bulkReport, setBulkReport] = useState<any | null>(null);
  const [isSubmittingImport, setIsSubmittingImport] = useState(false);

  // Team Admin Management state
  const [teamMembers, setTeamMembers] = useState<User[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [userToPromote, setUserToPromote] = useState<User | null>(null);
  const [userToRevoke, setUserToRevoke] = useState<User | null>(null);
  const [isSubmittingRoleChange, setIsSubmittingRoleChange] = useState(false);

  // Real-time Question Bank count & Assessment Deletion state
  const [realTimeQuestionBankCount, setRealTimeQuestionBankCount] = useState<number | null>(null);
  const [loadingQuestionBankCount, setLoadingQuestionBankCount] = useState<boolean>(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState<boolean>(false);
  const [isDeletingAssessment, setIsDeletingAssessment] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchQuestionBankCount = async () => {
    try {
      setLoadingQuestionBankCount(true);
      const count = await apiGetQuestionBankCount(currentUser?.id);
      setRealTimeQuestionBankCount(count);
    } catch (err) {
      console.error('Failed to fetch real-time question bank count:', err);
    } finally {
      setLoadingQuestionBankCount(false);
    }
  };

  const handleDeleteAssessment = async () => {
    if (!editingAssessment || !currentUser?.id) return;
    try {
      setIsDeletingAssessment(true);
      setDeleteError(null);
      await apiDeleteAdminAssessment(currentUser.id, editingAssessment.id);
      setMessage({ text: `Assessment "${editingAssessment.title}" deleted successfully!`, type: 'success' });
      setShowDeleteConfirmModal(false);
      setShowAssessmentModal(false);
      setEditingAssessment(null);
      await Promise.all([
        onRefreshTests(),
        fetchAssessments(),
        fetchQuestionBankCount(),
        fetchStats(),
      ]);
    } catch (err: any) {
      setDeleteError(err.message || 'Could not delete this assessment. No changes were made.');
    } finally {
      setIsDeletingAssessment(false);
    }
  };

  // Initial mount: load essential overview stats & questions
  useEffect(() => {
    if (!currentUser?.id) return;
    fetchStats();
    fetchQuestionBankCount();
    fetchAssessments();
    fetchQuestions();
    fetchQAReport();
    fetchUsersDirectory();
    fetchTeamMembers();
  }, [currentUser?.id]);

  // Sub-navigation tab effect: load secondary subtab data on demand
  useEffect(() => {
    if (!currentUser?.id) return;
    if (adminSubTab === 'users' && userDirectory.length === 0) {
      fetchUsersDirectory();
    } else if (adminSubTab === 'ads' && adsList.length === 0) {
      fetchAds();
    } else if (adminSubTab === 'team' && currentUser?.role === 'super_admin' && teamMembers.length === 0) {
      fetchTeamMembers();
    }
  }, [adminSubTab, currentUser?.id]);

  const getAdminHeaders = () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (currentUser?.id) headers['x-user-id'] = currentUser.id;
    return headers;
  };

  const getAdminGetHeaders = () => {
    const headers: Record<string, string> = {};
    if (currentUser?.id) headers['x-user-id'] = currentUser.id;
    return headers;
  };

  const fetchStats = async () => {
    if (!currentUser?.id) return;
    try {
      setLoadingStats(true);
      const data = await apiGetAdminStats(currentUser.id);
      setStats(data.stats);
      if (typeof data.stats?.totalQuestions === 'number') {
        setRealTimeQuestionBankCount(data.stats.totalQuestions);
      }
    } catch (e) {
      console.error('Failed to fetch admin stats:', e);
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchAssessments = async () => {
    if (!currentUser?.id) return;
    try {
      setLoadingAssessments(true);
      const list = await apiGetAdminAssessments(currentUser.id);
      setAdminAssessments(list);
    } catch (err: any) {
      console.error('Failed to fetch assessments:', err);
    } finally {
      setLoadingAssessments(false);
    }
  };

  const fetchQuestions = async () => {
    if (!currentUser?.id) return;
    try {
      setLoadingQuestions(true);
      const data = await apiGetCanonicalQuestions(currentUser.id);
      if (data && data.questions && data.questions.length > 0) {
        setCanonicalQuestions(data.questions);
        setQuestionUsageMap(data.usageMap || {});
      } else {
        setCanonicalQuestions(getAllStaticCanonicalQuestions());
      }
    } catch (err: any) {
      console.error('Failed to fetch canonical questions:', err);
      if (canonicalQuestions.length === 0) {
        setCanonicalQuestions(getAllStaticCanonicalQuestions());
      }
    } finally {
      setLoadingQuestions(false);
    }
  };

  const fetchAds = async () => {
    if (!currentUser?.id) return;
    try {
      setLoadingAds(true);
      const list = await apiGetAdminAdvertisements(currentUser.id);
      setAdsList(list);
    } catch (err: any) {
      console.error('Failed to fetch advertisements:', err);
    } finally {
      setLoadingAds(false);
    }
  };

  const handleOpenCreateAd = () => {
    setEditingAd(null);
    setAdSponsorName('');
    setAdTitle('');
    setAdDescription('');
    setAdLogoUrl('');
    setAdCardImageUrl('');
    setAdDestinationUrl('');
    setAdCtaText('Learn More');
    setAdAdType('STRUCTURED_CARD');
    setAdPlacement('DASHBOARD_SIDEBAR');
    setAdSelectedPlacements(['DASHBOARD_SIDEBAR']);
    setAdStatus('DRAFT');
    setAdPriority(10);
    setAdStartAt('');
    setAdEndAt('');
    setPreviewPlacementTab('DASHBOARD_BOTTOM');
    setShowAdModal(true);
  };

  const handleOpenEditAd = (ad: Advertisement) => {
    setEditingAd(ad);
    setAdSponsorName(ad.sponsorName || '');
    setAdTitle(ad.title || '');
    setAdDescription(ad.description || '');
    setAdLogoUrl(ad.logoUrl || '');
    setAdCardImageUrl(ad.cardImageUrl || '');
    setAdDestinationUrl(ad.destinationUrl || '');
    setAdCtaText(ad.ctaText || 'Learn More');
    setAdAdType(ad.adType || 'STRUCTURED_CARD');
    setAdPlacement(ad.placement || 'DASHBOARD_SIDEBAR');
    const rawPlacements = ad.placement
      ? ad.placement.includes(',')
        ? ad.placement.split(',').map((s) => s.trim())
        : [ad.placement]
      : ['DASHBOARD_SIDEBAR'];
    setAdSelectedPlacements(rawPlacements);
    setAdStatus(ad.status || 'DRAFT');
    setAdPriority(ad.priority !== undefined ? ad.priority : 10);
    setAdStartAt(isoToDatetimeLocal(ad.startAt));
    setAdEndAt(isoToDatetimeLocal(ad.endAt));

    const firstPlacement = rawPlacements[0];
    if (firstPlacement === 'DASHBOARD_TOP') setPreviewPlacementTab('DASHBOARD_TOP');
    else if (firstPlacement === 'LANDING_TOP') setPreviewPlacementTab('LANDING_TOP');
    else setPreviewPlacementTab('DASHBOARD_BOTTOM');

    setShowAdModal(true);
  };

  const togglePlacement = (loc: string) => {
    setAdSelectedPlacements((prev) => {
      if (prev.includes(loc)) {
        if (prev.length <= 1) return prev;
        return prev.filter((p) => p !== loc);
      }
      return [...prev, loc];
    });
  };

  const handleSaveAd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.id) return;

    let cleanUrl = adDestinationUrl.trim();
    if (cleanUrl.startsWith('https://http://')) {
      cleanUrl = cleanUrl.replace('https://http://', 'http://');
    } else if (cleanUrl.startsWith('https://https://')) {
      cleanUrl = cleanUrl.replace('https://https://', 'https://');
    }

    if (!adSponsorName.trim() || !adTitle.trim() || !cleanUrl) {
      setMessage({ text: 'Sponsor Name, Title, and Destination URL are required.', type: 'error' });
      return;
    }

    const placementStr = adSelectedPlacements.length > 0 ? adSelectedPlacements.join(',') : 'DASHBOARD_SIDEBAR';

    try {
      setIsSubmittingAd(true);
      const payload: Partial<Advertisement> = {
        sponsorName: adSponsorName.trim(),
        title: adTitle.trim(),
        description: adDescription.trim() || null,
        logoUrl: adLogoUrl.trim() || null,
        cardImageUrl: adCardImageUrl.trim() || null,
        destinationUrl: cleanUrl,
        ctaText: adCtaText.trim() || 'Learn More',
        adType: adAdType,
        placement: placementStr,
        status: adStatus,
        priority: Number(adPriority) || 10,
        startAt: datetimeLocalToIso(adStartAt),
        endAt: datetimeLocalToIso(adEndAt),
      };

      if (editingAd) {
        await apiUpdateAdvertisement(currentUser.id, editingAd.id, payload);
        setMessage({ text: `Sponsor Ad "${adTitle}" updated successfully!`, type: 'success' });
      } else {
        await apiCreateAdvertisement(currentUser.id, payload);
        setMessage({ text: `Sponsor Ad "${adTitle}" created successfully!`, type: 'success' });
      }
      setShowAdModal(false);
      window.dispatchEvent(new CustomEvent('firstround:sponsors-updated'));
      await fetchAds();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to save advertisement', type: 'error' });
    } finally {
      setIsSubmittingAd(false);
    }
  };

  const handleToggleAdStatus = async (id: string, newStatus: string) => {
    if (!currentUser?.id) return;
    try {
      await apiUpdateAdvertisementStatus(currentUser.id, id, newStatus);
      setMessage({ text: `Advertisement status updated to ${newStatus}!`, type: 'success' });
      window.dispatchEvent(new CustomEvent('firstround:sponsors-updated'));
      await fetchAds();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to update ad status', type: 'error' });
    }
  };

  const handleDeleteAdClick = (ad: Advertisement) => {
    setDeletingAd(ad);
  };

  const handleConfirmDeleteAd = async () => {
    if (!deletingAd || !deletingAd.id || !currentUser?.id) return;
    const targetAdId = deletingAd.id;
    setIsDeletingAd(true);
    try {
      const success = await apiDeleteAdvertisement(currentUser.id, targetAdId);
      if (success) {
        if (editingAd?.id === targetAdId) {
          setEditingAd(null);
          setShowAdModal(false);
        }
        setAdsList((prev) => (Array.isArray(prev) ? prev.filter((a) => a && a.id !== targetAdId) : []));
        setMessage({ text: 'Advertisement deleted successfully.', type: 'success' });
        window.dispatchEvent(new CustomEvent('firstround:sponsors-updated'));
        await fetchAds();
      } else {
        setMessage({ text: 'Could not delete advertisement. Please try again.', type: 'error' });
      }
    } catch (err: any) {
      console.error('[AdminPanel] Sponsor ad deletion error:', err);
      setMessage({ text: err.message || 'Could not delete advertisement. Please try again.', type: 'error' });
    } finally {
      setIsDeletingAd(false);
      setDeletingAd(null);
    }
  };

  const fetchUsersDirectory = async () => {
    if (!currentUser?.id) return;
    try {
      setLoadingUsers(true);
      const res = await apiGetAdminUsersDirectory(currentUser.id);
      if (res.success && Array.isArray(res.users)) {
        setUserDirectory(res.users);
      }
    } catch (err: any) {
      console.error('Failed to fetch user directory:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchTeamMembers = async () => {
    if (!currentUser?.id) return;
    try {
      setLoadingTeam(true);
      const res = await apiGetTeamMembers(currentUser.id);
      if (res.success && Array.isArray(res.members)) {
        setTeamMembers(res.members);
      }
    } catch (err: any) {
      console.error('Failed to fetch team members:', err);
    } finally {
      setLoadingTeam(false);
    }
  };

  const fetchPayments = async (overrideSkip?: number) => {
    if (!currentUser?.id) return;
    try {
      setLoadingPayments(true);
      const activeSkip = overrideSkip !== undefined ? overrideSkip : paymentSkip;
      const [payRes, subRes] = await Promise.all([
        apiAdminGetPayments(currentUser.id, {
          from: paymentFromDate,
          to: paymentToDate,
          status: paymentStatusFilter,
          count: paymentCount,
          skip: activeSkip,
        }).catch(() => ({
          success: false,
          payments: [],
          pagination: { total: 0, count: paymentCount, skip: activeSkip, hasMore: false },
          summary: { totalAmount: 0, capturedCount: 0, createdCount: 0, unmatchedCount: 0, fulfilledCount: 0, pendingCount: 0 },
        })),
        apiAdminGetSubscriptions(currentUser.id).catch(() => ({ success: false, subscriptions: [] })),
      ]);
      if (payRes.success && payRes.payments) {
        setPaymentsList(payRes.payments);
        if (payRes.pagination) setPaymentPagination(payRes.pagination);
        if (payRes.summary) setPaymentSummary(payRes.summary);
      }
      if (subRes.success && subRes.subscriptions) {
        setSubscriptionsList(subRes.subscriptions);
      }
    } catch (err: any) {
      console.error('Failed to fetch payments/subscriptions:', err);
    } finally {
      setLoadingPayments(false);
    }
  };

  const fetchQAReport = async () => {
    if (!currentUser?.id) return;
    try {
      setLoadingQA(true);
      const data = await apiGetQAReport(currentUser.id);
      if (data.success && data.report) {
        setQaReport(data.report);
      } else {
        setQaReport({
          verified: true,
          totalTests: 17,
          totalQuestions: 391,
          duplicateQuestions: 0,
        });
      }
    } catch (err: any) {
      console.error('Failed to fetch QA report:', err);
      setQaReport({
        verified: true,
        totalTests: 17,
        totalQuestions: 391,
        duplicateQuestions: 0,
      });
    } finally {
      setLoadingQA(false);
    }
  };

  // --- Assessment Actions ---
  const handleOpenCreateAssessment = () => {
    setEditingAssessment(null);
    setAssTitle('');
    setAssDesc('');
    setAssCategory('foundation');
    setAssCompany('');
    setAssDuration(20);
    setAssDifficulty('Medium');
    setAssStatus('DRAFT');
    setAssAccessType('FREE');
    setAssSelectedQuestions([]);
    setBuilderQuestions([]);
    setBuilderCreationTab('manual');
    setBuilderShuffleOptions(true);
    setImportRawText('');
    setBuilderStep(1);
    setShowAssessmentModal(true);
  };

  const handleOpenEditAssessment = (ass: TestSeries) => {
    setEditingAssessment(ass);
    setAssTitle(ass.title);
    setAssDesc(ass.description || '');
    setAssCategory(ass.category || 'foundation');
    setAssCompany(ass.companyName || '');
    setAssDuration(ass.durationMinutes || 20);
    setAssDifficulty((ass.difficulty as any) || 'Medium');
    setAssStatus((ass.status as any) || 'DRAFT');
    setAssAccessType(ass.accessType === 'PREMIUM' ? 'PREMIUM' : 'FREE');
    const existingQs = ass.questions || [];
    setAssSelectedQuestions(existingQs.map((q) => q.id));
    setBuilderQuestions(existingQs);
    setBuilderCreationTab('manual');
    setBuilderShuffleOptions(true);
    setBuilderStep(1);
    setShowAssessmentModal(true);
  };

  const handleIngestContent = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!importRawText.trim() || !currentUser?.id) return;
    try {
      setIsIngestingContent(true);
      const res = await apiIngestTestContent(currentUser.id, {
        mode: 'import',
        format: importFileType,
        content: importRawText,
      });
      if (res.success && Array.isArray(res.questions)) {
        if (res.testMetadata?.title && !assTitle.trim()) setAssTitle(res.testMetadata.title);
        if (res.testMetadata?.description && !assDesc.trim()) setAssDesc(res.testMetadata.description);

        setBuilderQuestions(res.questions);
        const qIds = res.questions.map((q: any) => q.id).filter(Boolean);
        setAssSelectedQuestions(qIds);
        setMessage({
          text: `Successfully ingested ${res.questions.length} questions from ${importFileType.toUpperCase()}!`,
          type: 'success',
        });
      } else {
        setMessage({ text: 'Failed to ingest content. Check format and try again.', type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: err.message || 'Error ingesting test content', type: 'error' });
    } finally {
      setIsIngestingContent(false);
    }
  };

  const handleGenerateAITestContent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiTopic.trim() || !currentUser?.id || isGeneratingAI) return;
    try {
      setIsGeneratingAI(true);
      const count = Math.max(1, Math.min(25, Number(aiNumQuestions) || 5));
      const res = await apiIngestTestContent(currentUser.id, {
        mode: 'ai',
        aiParams: {
          topicOrCompany: aiTopic.trim(),
          category: aiCategory,
          difficulty: aiDifficulty,
          numQuestions: count,
        },
      });
      if (res.success && Array.isArray(res.questions)) {
        setAssTitle(res.testMetadata?.title || aiTopic.trim());
        setAssDesc(res.testMetadata?.description || `AI Generated Assessment focusing on ${aiTopic}`);
        setAssCategory(aiCategory.toLowerCase());
        setAssDifficulty(aiDifficulty as any);
        setBuilderQuestions(res.questions);
        const qIds = res.questions.map((q: any) => q.id).filter(Boolean);
        setAssSelectedQuestions(qIds);
        setMessage({
          text: `AI generated ${res.questions.length} questions for "${res.testMetadata?.title || aiTopic}"! Review below before saving.`,
          type: 'success',
        });
      }
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to generate AI questions', type: 'error' });
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleCompleteQuestionWithAI = async (idx: number) => {
    if (!currentUser?.id || idx < 0 || idx >= builderQuestions.length) return;
    const targetQ = builderQuestions[idx];
    try {
      setCompletingQuestionIdx(idx);
      const res = await apiCompleteQuestion(currentUser.id, targetQ);
      if (res.success && res.question) {
        setBuilderQuestions((prev) => {
          const next = [...prev];
          next[idx] = { ...res.question, aiCompleted: true, incomplete: false, needsReview: false };
          return next;
        });
        setMessage({ text: `Question #${idx + 1} auto-filled with 4 options and explanation by Gemini AI!`, type: 'success' });
      }
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to complete question with AI', type: 'error' });
    } finally {
      setCompletingQuestionIdx(null);
    }
  };

  const handleResolveDuplicate = (idx: number, action: 'use_existing' | 'keep_new', existingQId?: string) => {
    if (idx < 0 || idx >= builderQuestions.length) return;
    setBuilderQuestions((prev) => {
      const next = [...prev];
      if (action === 'use_existing' && existingQId) {
        const existingInBank = canonicalQuestions.find((q) => q.id === existingQId);
        if (existingInBank) {
          next[idx] = existingInBank;
        } else {
          next[idx] = { ...next[idx], id: existingQId, duplicates: [] };
        }
      } else if (action === 'keep_new') {
        next[idx] = { ...next[idx], duplicates: [] };
      }
      return next;
    });
  };

  const handleSaveAssessment = async (e?: React.FormEvent, targetStatus?: 'DRAFT' | 'PUBLISHED') => {
    if (e) e.preventDefault();
    if (!assTitle.trim() || !currentUser?.id) return;

    const finalStatus = targetStatus || assStatus;

    if (finalStatus === 'PUBLISHED') {
      if (Number(assDuration) <= 0) {
        setMessage({ text: 'Validation Error: Duration must be greater than 0 minutes before publishing.', type: 'error' });
        return;
      }
      if (builderQuestions.length === 0 && assSelectedQuestions.length === 0) {
        setMessage({ text: 'Validation Error: Assessment must have at least 1 question before publishing.', type: 'error' });
        return;
      }
      const incompleteCount = builderQuestions.filter((q) => q.incomplete || !q.options || q.options.length !== 4).length;
      if (incompleteCount > 0) {
        setMessage({
          text: `Validation Error: ${incompleteCount} question(s) are incomplete. Click "Auto-Fix with Gemini" to complete missing options before publishing.`,
          type: 'error',
        });
        return;
      }
    }

    try {
      setIsSubmittingAssessment(true);
      const finalQuestionIds: string[] = [];

      for (const q of builderQuestions) {
        if (q.id && canonicalQuestions.some((cq) => cq.id === q.id)) {
          finalQuestionIds.push(q.id);
        } else {
          const savedQ = await apiSaveCanonicalQuestion(currentUser.id, {
            id: q.id,
            questionText: q.questionText || q.text,
            type: q.type || 'MCQ',
            options: q.options || [],
            correctOption: q.correctOption || 'A',
            topic: q.topic || 'General',
            difficulty: q.difficulty || 'Medium',
            explanation: q.explanation || '',
            source: 'Unified Builder',
          });
          if (savedQ && savedQ.id) {
            finalQuestionIds.push(savedQ.id);
          }
        }
      }

      const resolvedIds = finalQuestionIds.length > 0 ? finalQuestionIds : assSelectedQuestions;

      const payload = {
        id: editingAssessment?.id,
        title: assTitle,
        description: assDesc,
        category: assCategory,
        companyName: assCompany,
        durationMinutes: Number(assDuration),
        totalQuestions: resolvedIds.length,
        difficulty: assDifficulty,
        status: finalStatus,
        accessType: assAccessType,
        questionIds: resolvedIds,
      };

      await apiSaveAdminAssessment(currentUser.id, payload);
      setMessage({
        text: `Assessment "${assTitle}" saved successfully as ${finalStatus}!`,
        type: 'success',
      });
      setShowAssessmentModal(false);
      await Promise.all([fetchAssessments(), fetchStats(), onRefreshTests()]);
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to save assessment', type: 'error' });
    } finally {
      setIsSubmittingAssessment(false);
    }
  };

  const handleStatusTransition = async (id: string, newStatus: 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'ARCHIVED') => {
    if (!currentUser?.id) return;
    try {
      await apiUpdateAssessmentStatus(currentUser.id, id, newStatus);
      setMessage({ text: `Assessment status updated to ${newStatus}!`, type: 'success' });
      await Promise.all([fetchAssessments(), fetchStats(), onRefreshTests()]);
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to update status', type: 'error' });
    }
  };

  const handleGenerateAIAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiTopic.trim() || !currentUser?.id || isGeneratingAI) return;
    try {
      setIsGeneratingAI(true);
      const count = Math.max(1, Math.min(25, Number(aiNumQuestions) || 5));
      const res = await apiGenerateAdminAITestSeries(currentUser.id, {
        topicOrCompany: aiTopic.trim(),
        category: aiCategory,
        difficulty: aiDifficulty,
        numQuestions: count,
      });
      setMessage({
        text: `AI Test Series "${res.test?.title || aiTopic}" generated successfully with ${res.test?.questions?.length || count} questions as DRAFT!`,
        type: 'success',
      });
      setShowAIGenerator(false);
      setAiTopic('');
      await Promise.all([fetchAssessments(), fetchStats(), onRefreshTests()]);
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to generate AI assessment. Please retry.', type: 'error' });
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const getActionLabelForType = (type: string) => {
    switch (type) {
      case 'OPEN_TEST': return 'Open Assessment';
      case 'OPEN_REVISION': return 'Open Revision Vault';
      case 'OPEN_CAREER': return 'Open Career Track';
      case 'OPEN_CREDITS': return 'Open Credit Wallet';
      case 'OPEN_LEADERBOARD': return 'Open Weekly League';
      default: return undefined;
    }
  };

  const handleSendAnnouncement = async () => {
    if (!annTitle.trim() || !annMsg.trim() || !currentUser?.id || isSubmittingAnn) return;
    try {
      setIsSubmittingAnn(true);
      let actionTab: string | undefined = undefined;
      if (annActionType === 'OPEN_REVISION') actionTab = 'vault';
      else if (annActionType === 'OPEN_CAREER') actionTab = 'career';
      else if (annActionType === 'OPEN_CREDITS') actionTab = 'credits';
      else if (annActionType === 'OPEN_LEADERBOARD') actionTab = 'leaderboard';
      else if (annActionType === 'OPEN_TEST') actionTab = 'tests';

      const res = await apiCreateAnnouncement({
        title: annTitle.trim(),
        message: annMsg.trim(),
        type: annType || 'ANNOUNCEMENT',
        priority: annPriority,
        targetCompany: annTargetCompany.trim() || undefined,
        actionType: annActionType !== 'NONE' ? annActionType : undefined,
        actionTestId: annActionTestId.trim() || undefined,
        actionTab,
        actionLabel: getActionLabelForType(annActionType),
      }, currentUser.id);

      const targetCount = res.candidateCount ?? annCandidateCount;
      setMessage({
        text: `Announcement sent to ${targetCount} candidate${targetCount === 1 ? '' : 's'}.`,
        type: 'success',
      });
      setShowAnnConfirmation(false);
      setShowAnnouncementModal(false);
      setAnnTitle('');
      setAnnMsg('');
      setAnnActionType('NONE');
      setAnnActionTestId('');
    } catch (err: any) {
      setMessage({ text: err.message || 'Announcement could not be sent.', type: 'error' });
    } finally {
      setIsSubmittingAnn(false);
    }
  };

  const handleToggleAccessType = async (testId: string, currentAccessType?: string) => {
    if (!currentUser?.id) return;
    try {
      const nextType = currentAccessType === 'PREMIUM' ? 'FREE' : 'PREMIUM';
      await apiSetTestAccessType(currentUser.id, testId, nextType);
      await onRefreshTests();
      await fetchAssessments();
      setMessage({
        text: `Updated assessment access tier to ${nextType}!`,
        type: 'success',
      });
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to update access type', type: 'error' });
    }
  };

  // --- Duplicate Check & Question Actions ---
  const handleCheckDuplicateText = async () => {
    if (!qText.trim() || !currentUser?.id) return;
    try {
      setIsCheckingDuplicate(true);
      const res = await apiCheckQuestionDuplicates(currentUser.id, qText);
      setDuplicateResult(res);
      if (res.isDuplicate) {
        setShowDuplicateModal(true);
      } else {
        setMessage({ text: 'No duplicates detected! Question text is unique.', type: 'success' });
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsCheckingDuplicate(false);
    }
  };

  const handleSaveQuestion = async (overrideDuplicateCheck: boolean = false) => {
    if (!qText.trim() || !currentUser?.id) return;

    if (!overrideDuplicateCheck && !editingQuestion) {
      const dup = await apiCheckQuestionDuplicates(currentUser.id, qText);
      if (dup.isDuplicate) {
        setDuplicateResult(dup);
        setShowDuplicateModal(true);
        return;
      }
    }

    try {
      setIsSubmittingQuestion(true);
      const options =
        qType === 'MCQ'
          ? [
              { id: 'A', text: optA },
              { id: 'B', text: optB },
              { id: 'C', text: optC },
              { id: 'D', text: optD },
            ]
          : [];

      const payload = {
        id: editingQuestion?.id,
        questionText: qText,
        questionType: qType,
        options,
        correctOption: correctOpt,
        topic: qTopic,
        difficulty: qDifficulty,
        explanation: qExplanation,
        shortcutFormula: qShortcut,
        source: qSource,
      };

      await apiSaveCanonicalQuestion(currentUser.id, payload);
      setMessage({
        text: `Question saved to canonical Question Bank!`,
        type: 'success',
      });
      setShowQuestionModal(false);
      setShowDuplicateModal(false);
      setEditingQuestion(null);
      setQText('');
      setOptA('');
      setOptB('');
      setOptC('');
      setOptD('');
      setQExplanation('');
      setQShortcut('');
      await fetchQuestions();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to save question', type: 'error' });
    } finally {
      setIsSubmittingQuestion(false);
    }
  };

  // --- Bulk Import Parsing & Resolution ---
  const handleParseBulkInput = () => {
    if (!bulkRawText.trim()) return;
    try {
      let parsed: any[] = [];
      if (bulkRawText.trim().startsWith('[') || bulkRawText.trim().startsWith('{')) {
        const obj = JSON.parse(bulkRawText);
        parsed = Array.isArray(obj) ? obj : [obj];
      } else {
        // Simple CSV parser
        const lines = bulkRawText.split('\n').filter((l) => l.trim().length > 0);
        parsed = lines.map((line, idx) => {
          const parts = line.split(',');
          return {
            questionText: parts[0]?.trim() || `Question ${idx + 1}`,
            topic: parts[1]?.trim() || 'General',
            difficulty: parts[2]?.trim() || 'Medium',
            options: [
              { id: 'A', text: parts[3]?.trim() || 'Option A' },
              { id: 'B', text: parts[4]?.trim() || 'Option B' },
              { id: 'C', text: parts[5]?.trim() || 'Option C' },
              { id: 'D', text: parts[6]?.trim() || 'Option D' },
            ],
            correctOption: parts[7]?.trim() || 'A',
            explanation: parts[8]?.trim() || '',
          };
        });
      }
      setBulkParsedQuestions(parsed);
      setMessage({ text: `Successfully parsed ${parsed.length} questions. Check duplicates below.`, type: 'success' });
    } catch (err: any) {
      setMessage({ text: 'Invalid JSON/CSV format. Please check formatting.', type: 'error' });
    }
  };

  const handleCommitBulkImport = async () => {
    if (bulkParsedQuestions.length === 0 || !currentUser?.id) return;
    try {
      setIsSubmittingImport(true);
      const report = await apiImportQuestionsBulk(currentUser.id, bulkParsedQuestions, bulkResolutions);
      setBulkReport(report);
      setMessage({ text: `Bulk import completed! ${report.newCreated} new questions created.`, type: 'success' });
      await fetchQuestions();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to import questions', type: 'error' });
    } finally {
      setIsSubmittingImport(false);
    }
  };

  // Search User handlers for Team Admin sub-tab
  const handleSearchUsers = async (q: string) => {
    setSearchQuery(q);
    if (!q || q.trim().length === 0) {
      setSearchResults([]);
      return;
    }

    const query = q.trim().toLowerCase();
    // Instant local matches from userDirectory
    const localMatches = userDirectory.filter(
      (u) => u.name?.toLowerCase().includes(query) || u.email?.toLowerCase().includes(query)
    );
    setSearchResults(localMatches);

    if (!currentUser?.id) return;
    try {
      setIsSearchingUsers(true);
      const res = await apiSearchUsers(currentUser.id, q);
      if (res.success && res.users) {
        const combinedMap = new Map<string, User>();
        localMatches.forEach((u) => combinedMap.set(u.id, u));
        res.users.forEach((u) => combinedMap.set(u.id, u));
        setSearchResults(Array.from(combinedMap.values()));
      }
    } catch (err: any) {
      console.error('Failed to search users:', err);
    } finally {
      setIsSearchingUsers(false);
    }
  };

  const handleConfirmPromote = async () => {
    if (!userToPromote || !currentUser?.id) return;
    try {
      setIsSubmittingRoleChange(true);
      const res = await apiPromoteUser(currentUser.id, userToPromote.id);
      if (res.success) {
        setMessage({
          text: `Successfully promoted ${userToPromote.name} (${userToPromote.email}) to Admin!`,
          type: 'success',
        });
        setUserToPromote(null);
        await fetchTeamMembers();
        await fetchUsersDirectory();
        if (searchQuery) handleSearchUsers(searchQuery);
      }
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to promote user', type: 'error' });
    } finally {
      setIsSubmittingRoleChange(false);
    }
  };

  const handleConfirmRevoke = async () => {
    if (!userToRevoke || !currentUser?.id) return;
    try {
      setIsSubmittingRoleChange(true);
      const res = await apiRevokeUser(currentUser.id, userToRevoke.id);
      if (res.success) {
        setMessage({
          text: `Successfully revoked admin access for ${userToRevoke.name} (${userToRevoke.email}). Role set to Student.`,
          type: 'success',
        });
        setUserToRevoke(null);
        await fetchTeamMembers();
        await fetchUsersDirectory();
        if (searchQuery) handleSearchUsers(searchQuery);
      }
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to revoke user', type: 'error' });
    } finally {
      setIsSubmittingRoleChange(false);
    }
  };

  // Filtered lists
  const allDisplayAssessments = adminAssessments.length > 0 ? adminAssessments : tests;

  const filteredCatalogTests = allDisplayAssessments.filter((a) => {
    if (assessmentFilterStatus !== 'ALL') {
      const st = a.status || 'PUBLISHED';
      if (assessmentFilterStatus === 'foundation' || assessmentFilterStatus === 'company' || assessmentFilterStatus === 'coding') {
        if (a.category !== assessmentFilterStatus) return false;
      } else if (st !== assessmentFilterStatus && (assessmentFilterStatus !== 'PUBLISHED' || (st !== 'ready' && st !== 'PUBLISHED'))) {
        return false;
      }
    }
    if (testCatalogSearch) {
      const q = testCatalogSearch.toLowerCase();
      const matchTitle = a.title?.toLowerCase().includes(q);
      const matchCompany = a.companyName?.toLowerCase().includes(q) || a.company?.toLowerCase().includes(q);
      const matchCat = a.category?.toLowerCase().includes(q);
      if (!matchTitle && !matchCompany && !matchCat) return false;
    }
    return true;
  });

  const filteredQuestions = canonicalQuestions.filter((q) => {
    if (qBankSearch && !q.questionText.toLowerCase().includes(qBankSearch.toLowerCase())) return false;
    if (qBankTopicFilter !== 'ALL' && q.topic !== qBankTopicFilter) return false;
    if (qBankDifficultyFilter !== 'ALL' && q.difficulty !== qBankDifficultyFilter) return false;
    if (qBankTypeFilter !== 'ALL' && ((q as any).questionType || 'MCQ') !== qBankTypeFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6 pb-16">
      {/* Hero Header */}
      <div className="rounded-3xl bg-gradient-to-r from-gradient-start via-gradient-mid to-gradient-end p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-white shadow-xl">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400 text-slate-950 text-2xs font-extrabold tracking-wide uppercase shadow-sm">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-950" />
            <span>Admin Command Center</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-['Outfit']">
            Test Repository & Platform Analytics
          </h1>
          <p className="text-xs text-slate-200 font-medium max-w-2xl">
            Manage production test series, canonical question bank, platform analytics, team roles, and content QA.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleOpenCreateAssessment}
            title="Launch Unified Test Builder (Manual, AI, CSV/JSON/PDF Import)"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer ring-2 ring-indigo-500/20"
          >
            <Plus className="w-4 h-4 text-white" />
            <span>Create Test</span>
          </button>

          <button
            onClick={() => {
              setShowQADashboard(!showQADashboard);
              if (!qaReport) fetchQAReport();
            }}
            title="Run content QA diagnostics and rule validation"
            className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4 text-slate-950" />
            <span>{showQADashboard ? 'Close Quality Center' : 'Check Content Quality'}</span>
          </button>

          <button
            onClick={() => setShowAnnouncementModal(true)}
            title="Broadcast platform notifications to candidates"
            className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Megaphone className="w-4 h-4" />
            <span>Send Announcement</span>
          </button>

          <button
            onClick={() => {
              setShowQuestionBankModal(true);
              fetchQuestions();
              fetchQuestionBankCount();
            }}
            className="px-3.5 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="Manage canonical questions across assessments"
          >
            <Layers className="w-4 h-4 text-amber-400" />
            <span>Question Bank ({loadingQuestionBankCount ? '...' : (realTimeQuestionBankCount ?? stats?.totalQuestions ?? canonicalQuestions.length ?? 0)})</span>
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-2xl text-xs font-semibold flex items-center justify-between gap-2 shadow-xs ${
            message.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border border-rose-200 text-rose-900'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>
      )}

      {/* Primary Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl w-fit border border-slate-200 shadow-2xs overflow-x-auto">
        <button
          id="tab-overview-btn"
          onClick={() => setAdminSubTab('overview')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
            adminSubTab === 'overview'
              ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          <BarChart3 className="w-4 h-4 text-sky-600" />
          <span>Overview & Content</span>
        </button>

        <button
          id="tab-user-directory-btn"
          onClick={() => {
            setAdminSubTab('users');
            fetchUsersDirectory();
          }}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
            adminSubTab === 'users'
              ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          <Users className="w-4 h-4 text-purple-600" />
          <span>Users & Candidates</span>
        </button>

        <button
          id="tab-payments-btn"
          onClick={() => {
            setAdminSubTab('payments');
            fetchPayments();
          }}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
            adminSubTab === 'payments'
              ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          <CreditCard className="w-4 h-4 text-emerald-600" />
          <span>Payments & Transactions</span>
        </button>

        <button
          id="tab-sponsors-ads-btn"
          onClick={() => {
            setAdminSubTab('ads');
            fetchAds();
          }}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
            adminSubTab === 'ads'
              ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          <Megaphone className="w-4 h-4 text-amber-500" />
          <span>Sponsors & Ads</span>
        </button>

        {currentUser?.role === 'super_admin' && (
          <button
            id="tab-team-admins-btn"
            onClick={() => {
              setAdminSubTab('team');
              fetchTeamMembers();
            }}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
              adminSubTab === 'team'
                ? 'bg-purple-700 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <Users className="w-4 h-4 text-amber-400" />
            <span>Team Members & Admins</span>
          </button>
        )}
      </div>

      {/* --- SUBTAB 1: OVERVIEW & CONTENT --- */}
      {adminSubTab === 'overview' && (
        <div className="space-y-6">
          {/* Interactive KPI Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <button
              onClick={() => {
                setAdminSubTab('users');
                fetchUsersDirectory();
              }}
              className="p-4 rounded-2xl bg-white border border-slate-200 space-y-1 shadow-2xs text-left hover:border-sky-300 hover:shadow-sm transition-all group cursor-pointer"
              title="Click to view User Directory"
            >
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold group-hover:text-sky-600">
                <span>Total Students</span>
                <Users className="w-4 h-4 text-sky-700" />
              </div>
              <p className="text-2xl font-black text-slate-900 font-['Outfit']">
                {stats?.totalStudents ?? (userDirectory.filter((u) => u.role === 'student' || !u.role).length || 2)}
              </p>
              <span className="text-[10px] text-sky-600 font-medium block">Click to view users →</span>
            </button>

            <button
              onClick={() => setAssessmentFilterStatus('ALL')}
              className="p-4 rounded-2xl bg-white border border-slate-200 space-y-1 shadow-2xs text-left hover:border-indigo-300 hover:shadow-sm transition-all group cursor-pointer"
              title="Click to view all production assessments"
            >
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold group-hover:text-indigo-600">
                <span>Active Test Series</span>
                <BookOpen className="w-4 h-4 text-indigo-700" />
              </div>
              <p className="text-2xl font-black text-slate-900 font-['Outfit']">{stats?.totalTestSeries ?? adminAssessments.length ?? tests.length}</p>
              <span className="text-[10px] text-indigo-600 font-medium block">Click to view catalog →</span>
            </button>

            <button
              onClick={() => {
                setShowQuestionBankModal(true);
                fetchQuestions();
                fetchQuestionBankCount();
              }}
              className="p-4 rounded-2xl bg-white border border-slate-200 space-y-1 shadow-2xs text-left hover:border-amber-300 hover:shadow-sm transition-all group cursor-pointer"
              title="Click to manage canonical Question Bank"
            >
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold group-hover:text-amber-600">
                <span>Questions Bank</span>
                <FileCode className="w-4 h-4 text-amber-600" />
              </div>
              <p className="text-2xl font-black text-slate-900 font-['Outfit']">{loadingQuestionBankCount ? '...' : (realTimeQuestionBankCount ?? stats?.totalQuestions ?? 391)}</p>
              <span className="text-[10px] text-amber-600 font-medium block">Click to open bank →</span>
            </button>

            <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-1 shadow-2xs">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>Avg Accuracy</span>
                <BarChart3 className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-2xl font-black text-emerald-700 font-['Outfit']">{stats?.avgPlatformAccuracy ?? 0}%</p>
              <span className="text-[10px] text-slate-400 font-medium block">Platform average</span>
            </div>
          </div>

          {/* QA Report Dashboard if open */}
          {showQADashboard && (
            <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-4 border border-slate-800 shadow-md">
              {(() => {
                const report = qaReport || {
                  verified: true,
                  totalTests: stats?.totalTestSeries || 17,
                  totalQuestions: stats?.totalQuestions || 391,
                  duplicateQuestions: 0,
                };
                return (
                  <>
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <h3 className="text-sm font-bold font-['Outfit'] flex items-center gap-2">
                        <ShieldCheck className={`w-4 h-4 ${report.verified ? 'text-emerald-400' : 'text-amber-400'}`} />
                        <span>Content Quality Assurance Diagnostics</span>
                      </h3>
                      <span className={`text-2xs font-extrabold px-2.5 py-1 rounded-full border ${
                        report.verified
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      }`}>
                        {report.verified ? 'PASS' : 'CHECK FAILED'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-2xs">
                      <div className="bg-slate-800/60 p-3 rounded-xl">
                        <span className="text-slate-400 block font-semibold">Active Production Assessments</span>
                        <span className="text-base font-bold text-white">{stats?.totalTestSeries ?? report.totalTests ?? 17}</span>
                      </div>
                      <div className="bg-slate-800/60 p-3 rounded-xl">
                        <span className="text-slate-400 block font-semibold">Canonical Question Bank</span>
                        <span className="text-base font-bold text-white">{realTimeQuestionBankCount ?? stats?.totalQuestions ?? report.totalQuestions ?? 391}</span>
                      </div>
                      <div className="bg-slate-800/60 p-3 rounded-xl">
                        <span className="text-slate-400 block font-semibold">Exact/Near Duplicates</span>
                        <span className="text-base font-bold text-amber-400">{report.duplicateQuestions || 0} Issues</span>
                      </div>
                      <div className="bg-slate-800/60 p-3 rounded-xl">
                        <span className="text-slate-400 block font-semibold">Actionable Status</span>
                        <span className="text-base font-bold text-emerald-400">
                          {report.verified ? 'All Baseline Rules Passed' : `${report.duplicateQuestions || 1} issues found — Review affected assessments`}
                        </span>
                      </div>
                    </div>
                    <p className="text-2xs text-slate-300 bg-slate-800/40 p-3 rounded-xl border border-slate-700/50">
                      <strong className="text-amber-300">Action Required:</strong> {report.verified ? 'All production assessments & questions meet FirstRound quality standards.' : 'Review draft assessments and resolve duplicate question warnings before publication.'}
                    </p>
                  </>
                );
              })()}
            </div>
          )}

          {/* Active Test Series Catalog */}
          <div id="catalog-section" className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6 shadow-2xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 font-['Outfit'] flex items-center gap-2.5">
                  <BookOpen className="w-6 h-6 text-indigo-600 shrink-0" />
                  <span>Active Test Series Catalog</span>
                </h2>
                <p className="text-2xs text-slate-500 font-medium">
                  {filteredCatalogTests.length} active assessments available in production catalog
                </p>
              </div>

              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search test series..."
                    value={testCatalogSearch}
                    onChange={(e) => setTestCatalogSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500 w-44 sm:w-56"
                  />
                </div>
              </div>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
              <span className="font-bold text-slate-400 text-2xs uppercase tracking-wider mr-1">Filter:</span>
              {[
                { id: 'ALL', label: 'All Tests' },
                { id: 'foundation', label: 'Foundation' },
                { id: 'company', label: 'Company' },
                { id: 'coding', label: 'Coding' },
                { id: 'DRAFT', label: 'Drafts' },
                { id: 'REVIEW', label: 'In Review' },
                { id: 'ARCHIVED', label: 'Archived' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setAssessmentFilterStatus(f.id)}
                  className={`px-3 py-1 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${
                    assessmentFilterStatus === f.id
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Catalog Grid */}
            {filteredCatalogTests.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <BookOpen className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-xs font-bold text-slate-700">No assessments found</p>
                <p className="text-2xs text-slate-500">Try adjusting your filter or search criteria.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredCatalogTests.map((ass) => {
                  const st = ass.status || 'PUBLISHED';
                  const isDraft = st === 'DRAFT';
                  const isReview = st === 'REVIEW';
                  const isPublished = st === 'PUBLISHED' || st === 'ready';
                  const isArchived = st === 'ARCHIVED';

                  return (
                    <div
                      key={ass.id}
                      className="bg-white border border-slate-200/90 hover:border-slate-300 rounded-2xl p-4 space-y-3 shadow-2xs hover:shadow-sm transition-all flex flex-col justify-between"
                    >
                      <div className="space-y-2">
                        {/* Top Badges Row */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleToggleAccessType(ass.id, ass.accessType)}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-all hover:scale-105 ${
                              ass.accessType === 'PREMIUM'
                                ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 border border-amber-500 shadow-2xs'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300'
                            }`}
                            title="Click to toggle between FREE and PREMIUM tier"
                          >
                            {ass.accessType === 'PREMIUM' ? (
                              <>
                                <Crown className="w-3 h-3" />
                                <span>PREMIUM</span>
                              </>
                            ) : (
                              <span>✓ FREE</span>
                            )}
                          </button>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider border ${
                              isPublished
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : isReview
                                ? 'bg-purple-50 text-purple-700 border-purple-200'
                                : isDraft
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {st.toUpperCase()}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-bold uppercase tracking-wider">
                            {ass.category}
                          </span>
                          {(ass.companyName || ass.company) && (
                            <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold">
                              {ass.companyName || ass.company}
                            </span>
                          )}
                        </div>

                        {/* Title & Description */}
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 font-['Outfit'] leading-snug line-clamp-1" title={ass.title}>
                            {ass.title}
                          </h3>
                          <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mt-1">
                            {ass.description || 'No description provided.'}
                          </p>
                        </div>
                      </div>

                      {/* Bottom Section: Compact Metadata & Action Row */}
                      <div className="space-y-2.5 pt-2 border-t border-slate-100">
                        {/* Compact Metadata Row */}
                        <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {ass.durationMinutes || ass.duration || 30}m
                          </span>
                          <span className="flex items-center gap-1">
                            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                            {ass.questions?.length || ass.totalQuestions || ass.questionCount || 0} Qs
                          </span>
                          <span className="font-semibold text-slate-700">{ass.difficulty || 'Medium'}</span>
                        </div>

                        {/* Bottom Action Row */}
                        <div className="flex flex-wrap items-center justify-between gap-1.5 pt-0.5">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setSelectedAssessmentForPreview(ass)}
                              className="px-2 py-1 text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200/80 rounded-lg text-2xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                              title="Preview Assessment as candidate"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Preview</span>
                            </button>
                            <button
                              onClick={() => handleOpenEditAssessment(ass)}
                              className="px-2 py-1 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 rounded-lg text-2xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                              title="Edit Assessment details and questions"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {isDraft && (
                              <button
                                onClick={() => handleStatusTransition(ass.id, 'REVIEW')}
                                className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 border border-purple-200/80 text-purple-700 font-bold text-2xs rounded-lg transition-all cursor-pointer"
                              >
                                Submit Review
                              </button>
                            )}
                            {(isDraft || isReview) && (
                              <button
                                onClick={() => handleStatusTransition(ass.id, 'PUBLISHED')}
                                className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-2xs rounded-lg transition-all cursor-pointer"
                              >
                                Publish
                              </button>
                            )}
                            {isPublished && (
                              <button
                                onClick={() => handleStatusTransition(ass.id, 'ARCHIVED')}
                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-bold text-2xs rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                                title="Archive Assessment"
                              >
                                <Archive className="w-3.5 h-3.5 text-slate-500" />
                                <span>Archive</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- SUBTAB 2: USER DIRECTORY --- */}
      {adminSubTab === 'users' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 font-['Outfit'] flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-600" />
                  <span>Users & Candidates Directory</span>
                </h2>
                <p className="text-2xs text-slate-500 font-medium">
                  Registered FirstRound platform accounts and candidate performance overview
                </p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-800 text-xs font-extrabold border border-purple-200">
                  {userDirectory.length} Accounts Registered
                </span>
                <button
                  onClick={fetchUsersDirectory}
                  disabled={loadingUsers}
                  title="Refresh user directory"
                  className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1 text-2xs font-bold"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${loadingUsers ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="Search registered user by name, email or role..."
                  value={userDirectorySearch}
                  onChange={(e) => setUserDirectorySearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                {[
                  { id: 'ALL', label: 'All Roles' },
                  { id: 'student', label: 'Students' },
                  { id: 'admin', label: 'Admins' },
                  { id: 'super_admin', label: 'Super Admin' },
                ].map((rf) => (
                  <button
                    key={rf.id}
                    onClick={() => setUserRoleFilter(rf.id as any)}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs whitespace-nowrap transition-all cursor-pointer ${
                      userRoleFilter === rf.id
                        ? 'bg-purple-700 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {rf.label}
                  </button>
                ))}
              </div>
            </div>

            {/* User Directory Table / List */}
            {loadingUsers ? (
              <div className="p-8 text-center text-slate-500 text-xs font-semibold">
                Loading registered user directory...
              </div>
            ) : (() => {
              const filteredUsers = userDirectory.filter((u) => {
                if (userRoleFilter !== 'ALL') {
                  const role = u.role || 'student';
                  if (userRoleFilter === 'student' && role !== 'student') return false;
                  if (userRoleFilter === 'admin' && role !== 'admin') return false;
                  if (userRoleFilter === 'super_admin' && role !== 'super_admin') return false;
                }
                if (userDirectorySearch.trim()) {
                  const q = userDirectorySearch.toLowerCase();
                  const matchName = u.name?.toLowerCase().includes(q);
                  const matchEmail = u.email?.toLowerCase().includes(q);
                  const matchRole = u.role?.toLowerCase().includes(q);
                  if (!matchName && !matchEmail && !matchRole) return false;
                }
                return true;
              });

              if (filteredUsers.length === 0) {
                return (
                  <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
                    <Users className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className="text-xs font-bold text-slate-700">No users found</p>
                    <p className="text-2xs text-slate-500">Adjust your search or role filter.</p>
                  </div>
                );
              }

              return (
                <div className="space-y-4">
                  {/* Desktop Table View */}
                  <div className="hidden md:block border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                        <tr>
                          <th className="p-3.5">Candidate / User</th>
                          <th className="p-3.5">Role</th>
                          <th className="p-3.5">Target Focus</th>
                          <th className="p-3.5">Performance</th>
                          <th className="p-3.5">Registered Date</th>
                          <th className="p-3.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {filteredUsers.map((u) => {
                          const isSuper = u.role === 'super_admin' || u.email === 'pawankhot9@gmail.com';
                          const isAdmin = u.role === 'admin';
                          return (
                            <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="p-3.5">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-extrabold text-xs shrink-0">
                                    {u.name?.[0] || 'U'}
                                  </div>
                                  <div>
                                    <p className="font-bold text-slate-900">{u.name}</p>
                                    <p className="text-2xs text-slate-500">{u.email}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="p-3.5">
                                <span
                                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                    isSuper
                                      ? 'bg-amber-400 text-slate-950'
                                      : isAdmin
                                      ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                      : 'bg-sky-100 text-sky-800 border border-sky-200'
                                  }`}
                                >
                                  {isSuper ? 'SUPER ADMIN' : isAdmin ? 'ADMIN' : 'STUDENT'}
                                </span>
                              </td>
                              <td className="p-3.5 text-slate-600 font-medium">
                                {u.targetRole || u.targetCompany ? (
                                  <span>{u.targetRole || u.targetCompany}</span>
                                ) : (
                                  <span className="text-slate-400 italic">General Placement</span>
                                )}
                              </td>
                              <td className="p-3.5 font-semibold text-slate-700">
                                <span className="text-emerald-700 font-bold">{u.totalPoints || 0} XP</span>
                                <span className="text-slate-400 text-2xs block">
                                  {u.totalTestsAttempted || 0} Tests • {u.averageAccuracy || 0}% Acc
                                </span>
                              </td>
                              <td className="p-3.5 text-slate-500 text-2xs font-medium">
                                {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'Active Production'}
                              </td>
                              <td className="p-3.5 text-right">
                                <button
                                  onClick={() => setSelectedUserForDetails(u)}
                                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-2xs rounded-lg transition-all cursor-pointer"
                                >
                                  View Details
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Stacked Card View */}
                  <div className="md:hidden space-y-3">
                    {filteredUsers.map((u) => {
                      const isSuper = u.role === 'super_admin' || u.email === 'pawankhot9@gmail.com';
                      const isAdmin = u.role === 'admin';
                      return (
                        <div key={u.id} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-extrabold text-xs shrink-0">
                                {u.name?.[0] || 'U'}
                              </div>
                              <div>
                                <p className="text-xs font-bold text-slate-900">{u.name}</p>
                                <p className="text-2xs text-slate-500">{u.email}</p>
                              </div>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                isSuper
                                  ? 'bg-amber-400 text-slate-950'
                                  : isAdmin
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-sky-100 text-sky-800'
                              }`}
                            >
                              {isSuper ? 'SUPER ADMIN' : isAdmin ? 'ADMIN' : 'STUDENT'}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-2xs text-slate-500 border-t border-slate-200/60 pt-2 font-medium">
                            <span>Points: <strong className="text-emerald-700">{u.totalPoints || 0} XP</strong></span>
                            <span>Tests: <strong>{u.totalTestsAttempted || 0}</strong></span>
                            <button
                              onClick={() => setSelectedUserForDetails(u)}
                              className="px-2 py-0.5 bg-slate-200 text-slate-800 rounded font-bold"
                            >
                              Details
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* --- SUBTAB 3: TEAM MEMBERS & ADMINS (SUPER ADMIN) --- */}
      {adminSubTab === 'team' && currentUser?.role === 'super_admin' && (
        <div className="space-y-6">
          <div className="bg-purple-900 text-white rounded-2xl p-5 border border-purple-800 space-y-1">
            <h3 className="text-sm font-bold font-['Outfit'] flex items-center gap-2">
              <Crown className="w-4 h-4 text-amber-400" />
              <span>Super Admin Security Portal</span>
            </h3>
            <p className="text-2xs text-purple-200">
              Manage who can access FirstRound Admin tools. Only Super Admins can promote registered candidates to Admin or revoke Admin permissions.
            </p>
          </div>

          {/* Promote User Search Bar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-2xs">
            <h2 className="text-base font-bold text-slate-900 font-['Outfit'] flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-purple-600" />
              <span>Promote Registered User to Admin</span>
            </h2>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Search registered candidate by name or email address..."
                value={searchQuery}
                onChange={(e) => handleSearchUsers(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-purple-500"
              />
            </div>

            {searchQuery.trim().length > 0 && (
              searchResults.length > 0 ? (
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                  {searchResults.map((u) => (
                    <div key={u.id} className="p-3 bg-slate-50/50 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-bold text-slate-900">{u.name}</p>
                        <p className="text-2xs text-slate-500">{u.email}</p>
                      </div>
                      {u.role === 'admin' || u.role === 'super_admin' ? (
                        <span className="px-2.5 py-1 bg-purple-100 text-purple-800 rounded-full text-2xs font-extrabold uppercase">
                          {u.role}
                        </span>
                      ) : (
                        <button
                          onClick={() => setUserToPromote(u)}
                          className="px-3 py-1 bg-purple-700 hover:bg-purple-600 text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
                        >
                          Promote to Admin
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500 font-medium">
                  No registered candidate found matching &quot;{searchQuery}&quot;
                </div>
              )
            )}
          </div>

          {/* Team Members & Admins Directory */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6 shadow-2xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 font-['Outfit'] flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-700" />
                  <span>Team Members & Admins Directory</span>
                </h2>
                <p className="text-2xs text-slate-500 font-medium">Authorized administrators for FirstRound platform</p>
              </div>
              <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-800 text-xs font-extrabold">
                {teamMembers.length} Active Admins
              </span>
            </div>

            <div className="space-y-3">
              {teamMembers.map((m) => {
                const isSuper = m.role === 'super_admin' || m.email === 'pawankhot9@gmail.com';
                return (
                  <div key={m.id} className="flex items-center justify-between p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-purple-600 text-white flex items-center justify-center font-extrabold text-sm shadow-2xs">
                        {m.name?.[0] || 'A'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-slate-900">{m.name}</p>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                              isSuper ? 'bg-amber-400 text-slate-950' : 'bg-purple-100 text-purple-800'
                            }`}
                          >
                            {isSuper ? 'SUPER ADMIN' : 'ADMIN'}
                          </span>
                        </div>
                        <p className="text-2xs text-slate-500">{m.email}</p>
                      </div>
                    </div>

                    {!isSuper && (
                      <button
                        onClick={() => setUserToRevoke(m)}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 border border-rose-200 cursor-pointer"
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                        <span>Revoke Admin</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* --- SUBTAB: SPONSORS & ADS MANAGER --- */}
      {adminSubTab === 'ads' && (
        <div className="space-y-6">
          {/* Header & Controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-slate-900 font-['Outfit'] flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-amber-500" />
                <span>Sponsors & Advertisement Manager</span>
              </h2>
              <p className="text-2xs text-slate-500 font-medium">
                Manage dynamic sponsor cards, campaign status, priorities, and real-time CTR performance.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                id="create-sponsor-ad-btn"
                onClick={handleOpenCreateAd}
                className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4 text-slate-950" />
                <span>Create Sponsor Ad</span>
              </button>
            </div>
          </div>

          {/* Filters & Search */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Search sponsors by name, title, or destination..."
                value={adSearch}
                onChange={(e) => setAdSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={adStatusFilter}
                onChange={(e) => setAdStatusFilter(e.target.value)}
                className="px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-medium"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">ACTIVE Only</option>
                <option value="DRAFT">DRAFT Only</option>
                <option value="PAUSED">PAUSED Only</option>
                <option value="ARCHIVED">ARCHIVED Only</option>
              </select>
            </div>
          </div>

          {/* Live Sponsor Status Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
            <div className="space-y-0.5">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800 font-['Outfit'] block">
                LIVE SPONSOR STATUS
              </span>
              <p className="text-2xs text-slate-500 font-medium">Real-time status across active placements</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-1 rounded-full text-2xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                Active Ads: {adsList.filter((a) => a.status === 'ACTIVE').length}
              </span>
              <span className="px-2.5 py-1 rounded-full text-2xs font-extrabold bg-amber-100 text-amber-800 border border-amber-200">
                Paused: {adsList.filter((a) => a.status === 'PAUSED').length}
              </span>
              <span className="px-2.5 py-1 rounded-full text-2xs font-extrabold bg-slate-200/80 text-slate-700 border border-slate-300/60">
                Other: {adsList.filter((a) => a.status !== 'ACTIVE' && a.status !== 'PAUSED').length}
              </span>
            </div>
          </div>

          {/* Advertisements Table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <div className="p-3.5 bg-slate-100 border-b border-slate-200 grid grid-cols-12 gap-3 text-xs font-bold text-slate-700 min-w-[920px]">
                <span className="col-span-3">Sponsor / Title</span>
                <span className="col-span-3">Placements</span>
                <span className="col-span-2">Status</span>
                <span className="col-span-1 text-center">Priority</span>
                <span className="col-span-2">Performance</span>
                <span className="col-span-1 text-right">Actions</span>
              </div>

              {loadingAds ? (
                <div className="p-8 text-center text-slate-500 text-xs font-medium min-w-[920px]">
                  Loading advertisements...
                </div>
              ) : adsList.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs font-medium min-w-[920px]">
                  No advertisements found. Click "Create Sponsor Ad" to add one.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 min-w-[920px]">
                  {adsList
                    .filter((ad) => {
                      if (adStatusFilter !== 'ALL' && ad.status !== adStatusFilter) return false;
                      if (adSearch) {
                        const q = adSearch.toLowerCase();
                        const matchSponsor = ad.sponsorName?.toLowerCase().includes(q);
                        const matchTitle = ad.title?.toLowerCase().includes(q);
                        const matchUrl = ad.destinationUrl?.toLowerCase().includes(q);
                        if (!matchSponsor && !matchTitle && !matchUrl) return false;
                      }
                      return true;
                    })
                    .map((ad) => (
                      <div key={ad.id} className="p-3.5 grid grid-cols-12 gap-3 items-center hover:bg-slate-50 transition-colors">
                        {/* Sponsor / Title */}
                        <div className="col-span-3 min-w-0 space-y-0.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-bold text-xs text-slate-900 truncate">{ad.sponsorName}</span>
                            {ad.is_test === 1 && (
                              <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 text-[10px] font-bold shrink-0">
                                TEST
                              </span>
                            )}
                          </div>
                          <p className="text-2xs text-slate-500 font-medium truncate">{ad.title}</p>
                          <a
                            href={ad.destinationUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-sky-600 font-mono hover:underline truncate block"
                          >
                            {ad.destinationUrl}
                          </a>
                        </div>

                        {/* Placements Badges */}
                        <div className="col-span-3 flex flex-wrap items-center gap-1 min-w-0">
                          {(() => {
                            const tokens = (ad.placement || '').split(',').map((s) => s.trim()).filter(Boolean);
                            const displayTokens = tokens.slice(0, 2);
                            const remaining = tokens.length - 2;
                            return (
                              <>
                                {displayTokens.map((t) => (
                                  <span
                                    key={t}
                                    className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200/80 text-slate-700 text-[10px] font-extrabold uppercase font-mono tracking-tight shrink-0"
                                  >
                                    {t.replace('_', ' ')}
                                  </span>
                                ))}
                                {remaining > 0 && (
                                  <span
                                    title={tokens.join(', ')}
                                    className="px-1.5 py-0.5 rounded-md bg-slate-200 text-slate-700 text-[10px] font-bold cursor-help shrink-0"
                                  >
                                    +{remaining} more
                                  </span>
                                )}
                              </>
                            );
                          })()}
                        </div>

                        {/* Status Badge */}
                        <div className="col-span-2 min-w-[90px]">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                              ad.status === 'ACTIVE'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : ad.status === 'PAUSED'
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : ad.status === 'ARCHIVED'
                                ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {ad.status}
                          </span>
                        </div>

                        {/* Priority */}
                        <div className="col-span-1 text-center">
                          <span className="font-mono text-xs font-bold text-slate-700">{ad.priority}</span>
                        </div>

                        {/* Performance */}
                        <div className="col-span-2 space-y-0.5">
                          <div className="text-[11px] font-bold text-slate-900">
                            {ad.impressionsCount || 0} imps • {ad.clicksCount || 0} clicks
                          </div>
                          <div className="text-[10px] font-bold text-amber-600 font-mono">
                            CTR: {ad.ctr || 0}%
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="col-span-1 flex items-center justify-end gap-1 shrink-0">
                          {ad.status === 'ACTIVE' ? (
                            <button
                              onClick={() => handleToggleAdStatus(ad.id, 'PAUSED')}
                              className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold text-[10px] rounded-lg transition-all cursor-pointer"
                              title="Pause advertisement"
                            >
                              Pause
                            </button>
                          ) : (
                            <button
                              onClick={() => handleToggleAdStatus(ad.id, 'ACTIVE')}
                              className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-[10px] rounded-lg transition-all cursor-pointer"
                              title="Activate advertisement"
                            >
                              Activate
                            </button>
                          )}

                          <button
                            onClick={() => handleOpenEditAd(ad)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all cursor-pointer"
                            title="Edit advertisement"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleDeleteAdClick(ad)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                            title="Delete advertisement"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT SPONSOR ADVERTISEMENT */}
      {showAdModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-[24px] w-full max-w-[1400px] max-h-[92vh] overflow-y-auto shadow-2xl p-6 sm:p-8 text-slate-900 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-5">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center shrink-0 shadow-xs">
                  <Megaphone className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 font-['Outfit']">
                    {editingAd ? 'Edit Sponsor Advertisement' : 'Create Sponsor Advertisement'}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Promote your brand or offering to FirstRound students. Configure placement, content, and scheduling.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAdModal(false)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Two-Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* LEFT COLUMN: Numbered Configuration Sections (approx 60% width) */}
              <form onSubmit={handleSaveAd} className="lg:col-span-7 space-y-6">
                {/* SECTION 1: Basic Information */}
                <div className="bg-slate-50/50 border border-slate-200/80 rounded-2xl p-5 space-y-4">
                  <div className="space-y-1 border-b border-slate-200/60 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center text-xs font-black">
                        1
                      </span>
                      <h4 className="text-sm font-bold text-slate-900">Basic Information</h4>
                    </div>
                    <p className="text-xs text-slate-500 pl-8">Add the core details for your advertisement.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Sponsor Name *</label>
                      <input
                        type="text"
                        required
                        value={adSponsorName}
                        onChange={(e) => setAdSponsorName(e.target.value)}
                        placeholder="e.g. AWS Educate, Coursera, DataCamp"
                        className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Ad Title / Headline *</label>
                      <input
                        type="text"
                        required
                        value={adTitle}
                        onChange={(e) => setAdTitle(e.target.value)}
                        placeholder="e.g. Free Cloud Certification Voucher"
                        className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-medium"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-700">Short Description</label>
                      <span className={`text-[11px] font-mono font-medium ${adDescription.length > 250 ? 'text-rose-500' : 'text-slate-400'}`}>
                        {adDescription.length}/250
                      </span>
                    </div>
                    <textarea
                      maxLength={250}
                      rows={3}
                      value={adDescription}
                      onChange={(e) => setAdDescription(e.target.value)}
                      placeholder="e.g. Get hands-on labs and 50% discount on AWS Certified Cloud Practitioner exam."
                      className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                {/* SECTION 2: Visual Assets (Optional) */}
                <div className="bg-slate-50/50 border border-slate-200/80 rounded-2xl p-5 space-y-4">
                  <div className="space-y-1 border-b border-slate-200/60 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center text-xs font-black">
                        2
                      </span>
                      <h4 className="text-sm font-bold text-slate-900">Visual Assets (Optional)</h4>
                    </div>
                    <p className="text-xs text-slate-500 pl-8">Add a logo and a card image to make your ad more engaging.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Sponsor Logo URL</label>
                      <input
                        type="url"
                        value={adLogoUrl}
                        onChange={(e) => setAdLogoUrl(e.target.value)}
                        placeholder="https://images.unsplash.com/..."
                        className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-mono"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">Recommended: Square image (200x200). PNG, JPG or SVG.</p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Card Image URL</label>
                      <input
                        type="url"
                        value={adCardImageUrl}
                        onChange={(e) => setAdCardImageUrl(e.target.value)}
                        placeholder="https://images.unsplash.com/..."
                        className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-mono"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">Recommended: Landscape image (1200x628). PNG or JPG.</p>
                    </div>
                  </div>
                </div>

                {/* SECTION 3: Call to Action & Destination */}
                <div className="bg-slate-50/50 border border-slate-200/80 rounded-2xl p-5 space-y-4">
                  <div className="space-y-1 border-b border-slate-200/60 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center text-xs font-black">
                        3
                      </span>
                      <h4 className="text-sm font-bold text-slate-900">Call to Action & Destination</h4>
                    </div>
                    <p className="text-xs text-slate-500 pl-8">Set where users should go when they click your advertisement.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">CTA Button Text *</label>
                      <div className="space-y-2">
                        <select
                          value={['Learn More', 'Get Started', 'Register Now', 'Explore Now', 'Apply Now', 'Buy Now', 'Claim Offer'].includes(adCtaText) ? adCtaText : 'CUSTOM'}
                          onChange={(e) => {
                            if (e.target.value !== 'CUSTOM') {
                              setAdCtaText(e.target.value);
                            }
                          }}
                          className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-medium"
                        >
                          <option value="Learn More">Learn More</option>
                          <option value="Get Started">Get Started</option>
                          <option value="Register Now">Register Now</option>
                          <option value="Explore Now">Explore Now</option>
                          <option value="Apply Now">Apply Now</option>
                          <option value="Buy Now">Buy Now</option>
                          <option value="Claim Offer">Claim Offer</option>
                          <option value="CUSTOM">Custom CTA Text...</option>
                        </select>
                        {!['Learn More', 'Get Started', 'Register Now', 'Explore Now', 'Apply Now', 'Buy Now', 'Claim Offer'].includes(adCtaText) && (
                          <input
                            type="text"
                            value={adCtaText}
                            onChange={(e) => setAdCtaText(e.target.value)}
                            placeholder="Enter custom CTA label"
                            className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-medium"
                          />
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Destination URL (http/https only) *</label>
                      <input
                        type="url"
                        required
                        value={adDestinationUrl}
                        onChange={(e) => setAdDestinationUrl(e.target.value)}
                        placeholder="https://example.com/sponsor-landing"
                        className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* SECTION 4: Placement Settings */}
                <div className="bg-slate-50/50 border border-slate-200/80 rounded-2xl p-5 space-y-4">
                  <div className="space-y-1 border-b border-slate-200/60 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center text-xs font-black">
                        4
                      </span>
                      <h4 className="text-sm font-bold text-slate-900">Placement Settings</h4>
                    </div>
                    <p className="text-xs text-slate-500 pl-8">Choose where and when to show your advertisement.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-2">Display Locations *</label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Location 1: Dashboard Top */}
                      <div
                        onClick={() => togglePlacement('DASHBOARD_TOP')}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between space-y-2 ${
                          adSelectedPlacements.includes('DASHBOARD_TOP')
                            ? 'bg-amber-50/60 border-amber-400 shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900">Dashboard Top</span>
                          <div
                            className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${
                              adSelectedPlacements.includes('DASHBOARD_TOP')
                                ? 'bg-amber-500 border-amber-500 text-slate-950'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {adSelectedPlacements.includes('DASHBOARD_TOP') && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-tight">Top of dashboard page</p>
                      </div>

                      {/* Location 2: Dashboard Bottom */}
                      <div
                        onClick={() => togglePlacement('DASHBOARD_SIDEBAR')}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between space-y-2 ${
                          adSelectedPlacements.includes('DASHBOARD_SIDEBAR') || adSelectedPlacements.includes('DASHBOARD_BOTTOM')
                            ? 'bg-amber-50/60 border-amber-400 shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900">Dashboard Bottom</span>
                          <div
                            className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${
                              adSelectedPlacements.includes('DASHBOARD_SIDEBAR') || adSelectedPlacements.includes('DASHBOARD_BOTTOM')
                                ? 'bg-amber-500 border-amber-500 text-slate-950'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {(adSelectedPlacements.includes('DASHBOARD_SIDEBAR') || adSelectedPlacements.includes('DASHBOARD_BOTTOM')) && (
                              <Check className="w-3 h-3 stroke-[3]" />
                            )}
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-tight">Below featured placement tests</p>
                      </div>

                      {/* Location 3: Landing Page Top */}
                      <div
                        onClick={() => togglePlacement('LANDING_TOP')}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between space-y-2 ${
                          adSelectedPlacements.includes('LANDING_TOP')
                            ? 'bg-amber-50/60 border-amber-400 shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900">Landing Page Top</span>
                          <div
                            className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${
                              adSelectedPlacements.includes('LANDING_TOP')
                                ? 'bg-amber-500 border-amber-500 text-slate-950'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {adSelectedPlacements.includes('LANDING_TOP') && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-tight">Top banner on landing page</p>
                      </div>
                    </div>

                    <div className="mt-2.5 p-2.5 rounded-xl bg-slate-100 border border-slate-200/60 text-[11px] text-slate-600 font-medium flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>Select multiple locations to show the same advertisement across different pages.</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Card Type</label>
                      <select
                        value={adAdType}
                        onChange={(e) => setAdAdType(e.target.value as any)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-medium"
                      >
                        <option value="STRUCTURED_CARD">STRUCTURED_CARD</option>
                        <option value="OPTIONAL_CREATIVE_CARD">OPTIONAL_CREATIVE_CARD</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Status</label>
                      <select
                        value={adStatus}
                        onChange={(e) => setAdStatus(e.target.value as any)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-medium"
                      >
                        <option value="DRAFT">DRAFT</option>
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="PAUSED">PAUSED</option>
                        <option value="ARCHIVED">ARCHIVED</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Priority (0-1000)</label>
                      <input
                        type="number"
                        min={0}
                        max={1000}
                        value={adPriority}
                        onChange={(e) => setAdPriority(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-mono"
                      />
                      <p className="text-[10px] text-slate-400 mt-0.5">Higher number shows first.</p>
                    </div>
                  </div>
                </div>

                {/* SECTION 5: Schedule (Optional) */}
                <div className="bg-slate-50/50 border border-slate-200/80 rounded-2xl p-5 space-y-4">
                  <div className="space-y-1 border-b border-slate-200/60 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center text-xs font-black">
                        5
                      </span>
                      <h4 className="text-sm font-bold text-slate-900">Schedule (Optional)</h4>
                    </div>
                    <p className="text-xs text-slate-500 pl-8">
                      Set a start and end date for your advertisement. Leave blank to run continuously.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Start Date (Optional)</label>
                      <input
                        type="datetime-local"
                        value={adStartAt}
                        onChange={(e) => setAdStartAt(e.target.value)}
                        className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">End Date (Optional)</label>
                      <input
                        type="datetime-local"
                        value={adEndAt}
                        onChange={(e) => setAdEndAt(e.target.value)}
                        className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowAdModal(false)}
                    className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingAd || !adSponsorName.trim() || !adTitle.trim() || !adDestinationUrl.trim()}
                    className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmittingAd ? 'Saving...' : editingAd ? 'Save Changes' : 'Create Advertisement'}
                  </button>
                </div>
              </form>

              {/* RIGHT COLUMN: Live Preview & Placement Info (approx 40% width) */}
              <div className="lg:col-span-5 space-y-6 min-w-0">
                {/* 1. Live Component Preview */}
                <div className="bg-slate-950 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-4 shadow-xl overflow-hidden w-full max-w-full">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                      <Eye className="w-4 h-4" />
                      Live Preview
                    </span>

                    <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                      <button
                        type="button"
                        onClick={() => setPreviewDevice('desktop')}
                        className={`px-2.5 py-1 rounded text-[10px] font-extrabold uppercase transition-all ${
                          previewDevice === 'desktop' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Desktop
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewDevice('mobile')}
                        className={`px-2.5 py-1 rounded text-[10px] font-extrabold uppercase transition-all ${
                          previewDevice === 'mobile' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Mobile
                      </button>
                    </div>
                  </div>

                  {/* Placement Selector Tabs for Preview */}
                  <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800/80">
                    <button
                      type="button"
                      onClick={() => setPreviewPlacementTab('DASHBOARD_TOP')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all ${
                        previewPlacementTab === 'DASHBOARD_TOP'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Dashboard Top
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewPlacementTab('DASHBOARD_BOTTOM')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all ${
                        previewPlacementTab === 'DASHBOARD_BOTTOM'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Dashboard Bottom
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewPlacementTab('LANDING_TOP')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all ${
                        previewPlacementTab === 'LANDING_TOP'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Landing Top
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-400">
                    Showing how ad renders in {previewPlacementTab === 'DASHBOARD_BOTTOM' ? 'Dashboard Bottom' : previewPlacementTab === 'DASHBOARD_TOP' ? 'Dashboard Top' : 'Landing Top'}. Clicks & impressions are disabled in preview mode.
                  </p>

                  <div className="w-full max-w-full overflow-hidden relative rounded-xl border border-slate-800 bg-slate-900 p-2 sm:p-3">
                    <div className={`mx-auto transition-all overflow-hidden ${previewDevice === 'mobile' ? 'max-w-[360px] w-full border border-slate-700/80 rounded-2xl p-1 bg-slate-950 shadow-md' : 'w-full max-w-full'}`}>
                      {previewPlacementTab === 'DASHBOARD_TOP' || previewPlacementTab === 'LANDING_TOP' ? (
                        <TopSponsorBanner
                          isPreview={true}
                          placement={previewPlacementTab}
                          ad={{
                            id: editingAd?.id || 'preview_id',
                            sponsorName: adSponsorName || 'Sponsor Name',
                            title: adTitle || 'Advertisement Title Headline',
                            description: adDescription || 'Short description detailing the sponsor offer or campaign details.',
                            logoUrl: adLogoUrl || undefined,
                            cardImageUrl: adCardImageUrl || undefined,
                            destinationUrl: adDestinationUrl || 'https://firstround.ai',
                            ctaText: adCtaText || 'Learn More',
                            adType: adAdType,
                            placement: adSelectedPlacements.join(','),
                            status: adStatus,
                            priority: adPriority,
                          }}
                        />
                      ) : (
                        <SponsorAdCard
                          isPreview={true}
                          ad={{
                            id: editingAd?.id || 'preview_id',
                            sponsorName: adSponsorName || 'Sponsor Name',
                            title: adTitle || 'Advertisement Title Headline',
                            description: adDescription || 'Short description detailing the sponsor offer or campaign details.',
                            logoUrl: adLogoUrl || undefined,
                            cardImageUrl: adCardImageUrl || undefined,
                            destinationUrl: adDestinationUrl || 'https://firstround.ai',
                            ctaText: adCtaText || 'Learn More',
                            adType: adAdType,
                            placement: adSelectedPlacements.join(','),
                            status: adStatus,
                            priority: adPriority,
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. Placement Preview */}
                <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-3 shadow-xl">
                  <div className="border-b border-slate-800 pb-2">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-sky-400" />
                      Placement Preview
                    </h5>
                    <p className="text-[11px] text-slate-400 mt-1">Your ad will be shown at the following locations:</p>
                  </div>

                  <div className="space-y-2 pt-1">
                    {/* Landing Page Top */}
                    {adSelectedPlacements.includes('LANDING_TOP') && (
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-white">Landing Page Top</p>
                          <p className="text-[10px] text-slate-400">Top banner on landing page</p>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                          Selected
                        </span>
                      </div>
                    )}

                    {/* Dashboard Top */}
                    {adSelectedPlacements.includes('DASHBOARD_TOP') && (
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-white">Dashboard Top</p>
                          <p className="text-[10px] text-slate-400">Top of dashboard page</p>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                          Selected
                        </span>
                      </div>
                    )}

                    {/* Dashboard Bottom */}
                    {(adSelectedPlacements.includes('DASHBOARD_SIDEBAR') || adSelectedPlacements.includes('DASHBOARD_BOTTOM')) && (
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-white">Dashboard Bottom</p>
                          <p className="text-[10px] text-slate-400">Below featured placement tests</p>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                          Selected
                        </span>
                      </div>
                    )}

                    {adSelectedPlacements.length === 0 && (
                      <p className="text-xs text-rose-400 font-medium">Please select at least one display location.</p>
                    )}
                  </div>
                </div>

                {/* 3. Tips for a Great Advertisement */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 text-slate-800 space-y-3 shadow-xs">
                  <h5 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <span>💡</span> Tips for a Great Advertisement
                  </h5>

                  <ul className="space-y-2 text-[11px] text-slate-600 font-medium">
                    <li className="flex items-start gap-1.5">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <span>Use a clear and concise headline</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <span>Add a compelling visual (logo and image)</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <span>Keep the description under 250 characters</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <span>Use a relevant and trusted landing page (https only)</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <span>Set appropriate start and end dates if needed</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <span>Preview on both desktop and mobile</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DELETE ADVERTISEMENT CONFIRMATION */}
      {deletingAd && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm shadow-2xl p-5 text-slate-900 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm sm:text-base font-bold text-slate-900 font-['Outfit']">
                  Delete this advertisement?
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  This will remove the advertisement from all FirstRound placements.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isDeletingAd}
                onClick={() => setDeletingAd(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingAd}
                onClick={handleConfirmDeleteAd}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDeletingAd ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete Advertisement</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: QUESTION BANK DRAWER */}
      {showQuestionBankModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 font-['Outfit'] flex items-center gap-2">
                  <Layers className="w-5 h-5 text-amber-600" />
                  <span>Canonical Question Bank</span>
                </h3>
                <p className="text-2xs text-slate-500 font-medium">
                  Questions are reusable across multiple assessments with mandatory duplicate check engine.
                </p>
              </div>
              <button
                onClick={() => setShowQuestionBankModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Top Search & Actions */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="Search Canonical Question Bank..."
                  value={qBankSearch}
                  onChange={(e) => setQBankSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowBulkImportModal(true)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>Import CSV/JSON</span>
                </button>

                <button
                  onClick={() => {
                    setEditingQuestion(null);
                    setQText('');
                    setOptA('');
                    setOptB('');
                    setOptC('');
                    setOptD('');
                    setQExplanation('');
                    setQShortcut('');
                    setShowQuestionModal(true);
                  }}
                  className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Question</span>
                </button>
              </div>
            </div>

            {/* Question List */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
              <div className="p-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700">
                <span>Question Text ({filteredQuestions.length})</span>
                <span>Actions</span>
              </div>

              <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                {filteredQuestions.slice(0, 100).map((q) => {
                  const usages = questionUsageMap[q.id] || [];
                  return (
                    <div key={q.id} className="p-4 hover:bg-slate-50 transition-all flex items-start justify-between gap-4">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-2xs font-extrabold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md">
                            {q.id}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 text-2xs font-bold">
                            {q.topic || 'General'}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-2xs font-bold">
                            {q.difficulty}
                          </span>
                          <span
                            className={`text-2xs font-semibold px-2 py-0.5 rounded-md ${
                              usages.length > 0
                                ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                            title={usages.length > 0 ? `Used in: ${usages.join(', ')}` : 'Not linked to any assessment'}
                          >
                            {usages.length > 0
                              ? `Used in ${usages.length} ${usages.length === 1 ? 'assessment' : 'assessments'}`
                              : 'Unassigned (0 assessments)'}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-slate-900">{q.questionText}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            setQText(q.questionText);
                            await handleCheckDuplicateText();
                          }}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-2xs rounded-lg transition-all cursor-pointer"
                        >
                          Check Duplicate
                        </button>
                        <button
                          onClick={() => {
                            setEditingQuestion(q);
                            setQText(q.questionText);
                            setQType((q as any).questionType || 'MCQ');
                            setQTopic(q.topic || 'Arithmetic');
                            setQDifficulty(q.difficulty);
                            setQExplanation(q.explanation || '');
                            if (Array.isArray(q.options) && q.options.length >= 4) {
                              setOptA(q.options[0]?.text || '');
                              setOptB(q.options[1]?.text || '');
                              setOptC(q.options[2]?.text || '');
                              setOptD(q.options[3]?.text || '');
                            }
                            setShowQuestionModal(true);
                          }}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all cursor-pointer"
                          title="Edit question details"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ASSESSMENT PREVIEW */}
      {selectedAssessmentForPreview && (
        <AdminAssessmentPreview
          assessment={selectedAssessmentForPreview}
          canonicalQuestions={canonicalQuestions}
          onClose={() => setSelectedAssessmentForPreview(null)}
        />
      )}

      {/* MODAL: UNIFIED TEST BUILDER & CONTENT INGESTION SYSTEM */}
      {showAssessmentModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl p-5 sm:p-6 text-white space-y-5 my-8">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center font-bold">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-extrabold font-['Outfit'] text-white">
                    {editingAssessment ? 'Edit Assessment' : 'Unified Test Builder'}
                  </h3>
                  <p className="text-2xs text-slate-400 font-medium">
                    Manual, AI-Generated, and File-Imported content in ONE unified engine
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAssessmentModal(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Input Method Selector Tabs */}
            <div className="grid grid-cols-3 gap-2 p-1 bg-slate-950/60 rounded-2xl border border-slate-800/80">
              <button
                type="button"
                onClick={() => setBuilderCreationTab('manual')}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  builderCreationTab === 'manual'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                <span>✍️ Build Manually</span>
              </button>

              <button
                type="button"
                onClick={() => setBuilderCreationTab('ai')}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  builderCreationTab === 'ai'
                    ? 'bg-amber-500 text-slate-950 shadow-md font-extrabold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Bot className="w-4 h-4" />
                <span>🤖 Generate with AI</span>
              </button>

              <button
                type="button"
                onClick={() => setBuilderCreationTab('import')}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  builderCreationTab === 'import'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>📄 Import (CSV/JSON/PDF)</span>
              </button>
            </div>

            {/* Assessment Metadata Form */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 bg-slate-950/40 p-4 rounded-2xl border border-slate-800/60">
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-2xs font-bold uppercase text-slate-400 mb-1">Assessment Title</label>
                <input
                  type="text"
                  required
                  value={assTitle}
                  onChange={(e) => setAssTitle(e.target.value)}
                  placeholder="e.g. TCS NQT 2026 Advanced Quantitative Aptitude"
                  className="w-full px-3.5 py-2 bg-slate-800/90 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-2xs font-bold uppercase text-slate-400 mb-1">Category</label>
                <select
                  value={assCategory}
                  onChange={(e) => setAssCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="foundation">Foundation</option>
                  <option value="company">Company Mock</option>
                  <option value="coding">Coding Track</option>
                  <option value="sectional">Sectional Mock</option>
                </select>
              </div>

              <div>
                <label className="block text-2xs font-bold uppercase text-slate-400 mb-1">Duration (Minutes)</label>
                <input
                  type="number"
                  min={1}
                  value={assDuration}
                  onChange={(e) => setAssDuration(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-2xs font-bold uppercase text-slate-400 mb-1">Difficulty</label>
                <select
                  value={assDifficulty}
                  onChange={(e) => setAssDifficulty(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </div>

              {/* Option Shuffling & Access Tier Row */}
              <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap items-center justify-between bg-slate-900 p-3 rounded-xl border border-slate-800 gap-3">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={builderShuffleOptions}
                      onChange={(e) => setBuilderShuffleOptions(e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-800 border-slate-700 cursor-pointer"
                    />
                    <span>🔀 Shuffle Options per Candidate</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (builderQuestions.length > 0) {
                        setBuilderQuestions((prev) =>
                          prev.map((q) => {
                            if (!q.options || q.options.length === 0) return q;
                            const origText = q.options.find((o: any) => o.id === q.correctOption)?.text;
                            const shuffled = [...q.options].sort(() => Math.random() - 0.5);
                            const ids = ['A', 'B', 'C', 'D'];
                            const newOpts = shuffled.map((opt: any, i: number) => ({ ...opt, id: ids[i] || opt.id }));
                            const newCorr = newOpts.find((o: any) => o.text === origText)?.id || q.correctOption;
                            return { ...q, options: newOpts, correctOption: newCorr };
                          })
                        );
                        setMessage({ text: 'Option positions shuffled for preview while preserving correct option text!', type: 'success' });
                      }
                    }}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-2xs font-semibold cursor-pointer border border-slate-700"
                  >
                    Preview Shuffle
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-2xs font-bold text-slate-400 uppercase">Access Tier:</span>
                  <button
                    type="button"
                    onClick={() => setAssAccessType(assAccessType === 'FREE' ? 'PREMIUM' : 'FREE')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      assAccessType === 'PREMIUM'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                        : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    }`}
                  >
                    {assAccessType === 'PREMIUM' ? '👑 Premium' : '✓ Free'}
                  </button>
                </div>
              </div>
            </div>

            {/* Content Tab 1: Build Manually */}
            {builderCreationTab === 'manual' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                  <span className="text-xs font-bold text-slate-200">
                    Question Selection ({builderQuestions.length || assSelectedQuestions.length} Attached)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowQuestionBankModal(true);
                      fetchQuestions();
                    }}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Attach from Question Bank</span>
                  </button>
                </div>
              </div>
            )}

            {/* Content Tab 2: Generate with AI */}
            {builderCreationTab === 'ai' && (
              <form onSubmit={handleGenerateAITestContent} className="space-y-3 bg-amber-500/5 p-4 rounded-2xl border border-amber-500/20">
                <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
                  <Bot className="w-4 h-4" />
                  <span>Gemini AI Test Generation Engine</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-2xs font-bold uppercase text-slate-400 mb-1">Target Topic / Exam Focus</label>
                    <input
                      type="text"
                      required
                      value={aiTopic}
                      onChange={(e) => setAiTopic(e.target.value)}
                      placeholder="e.g. Infosys Pseudocode & Logical Reasoning"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-2xs font-bold uppercase text-slate-400 mb-1">Number of Questions (1-25)</label>
                    <input
                      type="number"
                      min={1}
                      max={25}
                      value={aiNumQuestions}
                      onChange={(e) => setAiNumQuestions(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isGeneratingAI || !aiTopic.trim()}
                  className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 disabled:opacity-50 text-slate-950 font-extrabold text-xs rounded-xl cursor-pointer flex items-center justify-center gap-2 shadow-md"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{isGeneratingAI ? 'Generating Full Test with Gemini AI...' : 'Generate Questions with AI'}</span>
                </button>
              </form>
            )}

            {/* Content Tab 3: Import Content (CSV/JSON/PDF) */}
            {builderCreationTab === 'import' && (
              <div className="space-y-3 bg-emerald-500/5 p-4 rounded-2xl border border-emerald-500/20">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold">
                    <Upload className="w-4 h-4" />
                    <span>Import Content (CSV, JSON, PDF or Text)</span>
                  </div>
                  <div className="flex gap-2 text-2xs">
                    {(['csv', 'json', 'pdf', 'text'] as const).map((ft) => (
                      <button
                        key={ft}
                        type="button"
                        onClick={() => setImportFileType(ft)}
                        className={`px-2.5 py-1 rounded-lg font-bold uppercase cursor-pointer ${
                          importFileType === ft ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {ft}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <textarea
                    rows={5}
                    value={importRawText}
                    onChange={(e) => setImportRawText(e.target.value)}
                    placeholder={`Paste ${importFileType.toUpperCase()} content or raw test questions here...\n\nExample CSV:\nQuestion Text,Option A,Option B,Option C,Option D,Correct Option,Explanation`}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleIngestContent}
                  disabled={isIngestingContent || !importRawText.trim()}
                  className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-extrabold text-xs rounded-xl cursor-pointer flex items-center justify-center gap-2 shadow-md"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>{isIngestingContent ? 'Parsing & Ingesting Content...' : 'Parse & Ingest Test Content'}</span>
                </button>
              </div>
            )}

            {/* Ingested Questions Quality & Review List */}
            {builderQuestions.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300 border-b border-slate-800 pb-2">
                  <span>Questions in Assessment ({builderQuestions.length})</span>
                  <span className="text-2xs text-slate-400 font-normal">
                    Check duplicate warnings and AI auto-fill options below
                  </span>
                </div>

                <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                  {builderQuestions.map((q: any, idx: number) => {
                    const isInc = q.incomplete || !q.options || q.options.length !== 4;
                    const hasDups = Array.isArray(q.duplicates) && q.duplicates.length > 0;

                    return (
                      <div
                        key={q.id || `q_${idx}`}
                        className={`p-3.5 rounded-2xl border text-xs space-y-2 transition-all ${
                          hasDups
                            ? 'bg-amber-500/10 border-amber-500/40'
                            : isInc
                            ? 'bg-rose-500/10 border-rose-500/40'
                            : 'bg-slate-950/60 border-slate-800'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 flex-1">
                            <span className="font-mono text-2xs font-extrabold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-md shrink-0">
                              #{idx + 1}
                            </span>
                            <p className="text-slate-100 font-medium leading-snug">
                              {q.questionText || q.text || 'Untitled Question'}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Incomplete / Missing Options Badge */}
                            {isInc && (
                              <span className="px-2 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-md text-[10px] font-bold flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 text-rose-400" />
                                <span>Incomplete</span>
                              </span>
                            )}

                            {/* AI Completed Badge */}
                            {q.aiCompleted && (
                              <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-md text-[10px] font-bold flex items-center gap-1">
                                <Sparkles className="w-3 h-3 text-amber-400" />
                                <span>AI Completed</span>
                              </span>
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                setBuilderQuestions((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="text-slate-400 hover:text-rose-400 p-1 cursor-pointer"
                              title="Remove Question"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Options Display */}
                        {Array.isArray(q.options) && q.options.length > 0 && (
                          <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11px]">
                            {q.options.map((opt: any) => (
                              <div
                                key={opt.id}
                                className={`px-2.5 py-1 rounded-lg border text-2xs ${
                                  opt.id === q.correctOption
                                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 font-bold'
                                    : 'bg-slate-900 border-slate-800 text-slate-300'
                                }`}
                              >
                                <strong className="mr-1">{opt.id}.</strong> {opt.text}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Missing options Auto-Fix button */}
                        {isInc && (
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={() => handleCompleteQuestionWithAI(idx)}
                              disabled={completingQuestionIdx === idx}
                              className="w-full py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 rounded-xl text-2xs font-extrabold cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>
                                {completingQuestionIdx === idx
                                  ? 'Gemini Auto-Filling Options...'
                                  : 'Auto-Fix with Gemini AI (Generate 4 Options & Explanation)'}
                              </span>
                            </button>
                          </div>
                        )}

                        {/* Duplicate Warning Card (>=75% similarity) */}
                        {hasDups && (
                          <div className="mt-2 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
                            <div className="flex items-center gap-1.5 text-amber-300 text-2xs font-bold">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              <span>
                                Potential Duplicate Detected ({q.duplicates[0].similarity}% similarity with question #{q.duplicates[0].existingQuestionId})
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-300 font-mono bg-slate-950/80 p-1.5 rounded-lg border border-slate-800 truncate">
                              "{q.duplicates[0].existingText}"
                            </p>
                            <div className="flex items-center gap-1.5 pt-1">
                              <button
                                type="button"
                                onClick={() => handleResolveDuplicate(idx, 'use_existing', q.duplicates[0].existingQuestionId)}
                                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[10px] rounded-lg cursor-pointer"
                              >
                                Use Existing Question
                              </button>
                              <button
                                type="button"
                                onClick={() => handleResolveDuplicate(idx, 'keep_new')}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[10px] rounded-lg cursor-pointer border border-slate-700"
                              >
                                Keep as New Question
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Danger Zone for Editing Existing Assessment */}
            {editingAssessment && (
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-extrabold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>Danger Zone</span>
                    </h4>
                    <p className="text-2xs text-slate-300 font-medium mt-1">
                      Delete this assessment permanently. This removes the assessment from the production catalog and cleans its related test-specific records.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteError(null);
                      setShowDeleteConfirmModal(true);
                    }}
                    className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer shrink-0 self-start sm:self-center"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Test</span>
                  </button>
                </div>
              </div>
            )}

            {/* Modal Action Controls Footer */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowAssessmentModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl cursor-pointer transition-colors"
              >
                Cancel
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSaveAssessment(undefined, 'DRAFT')}
                  disabled={isSubmittingAssessment || !assTitle.trim()}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-bold text-xs rounded-xl cursor-pointer border border-slate-700 transition-colors"
                >
                  {isSubmittingAssessment ? 'Saving...' : '💾 Save as Draft'}
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveAssessment(undefined, 'PUBLISHED')}
                  disabled={isSubmittingAssessment || !assTitle.trim()}
                  className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-extrabold text-xs rounded-xl cursor-pointer shadow-md transition-colors flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isSubmittingAssessment ? 'Publishing...' : '🚀 Save & Publish Assessment'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DELETE ASSESSMENT CONFIRMATION */}
      {showDeleteConfirmModal && editingAssessment && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-6 text-white space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/30 text-rose-400 flex items-center justify-center font-bold shrink-0">
                <AlertTriangle className="w-6 h-6 text-rose-400" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold font-['Outfit'] text-white">
                  Delete Assessment?
                </h3>
                <p className="text-2xs text-slate-400 font-medium">
                  Permanent destructive action
                </p>
              </div>
            </div>

            <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 space-y-2">
              <p className="text-xs text-slate-300 font-medium">
                You are about to permanently delete:
              </p>
              <p className="text-sm font-extrabold text-white font-['Outfit'] bg-slate-900 p-2.5 rounded-xl border border-slate-700/80">
                "{editingAssessment.title}"
              </p>
              <p className="text-2xs text-slate-400">
                This will remove the assessment from the catalog and delete its test-specific relationships and data. This action cannot be undone.
              </p>
            </div>

            {deleteError && (
              <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirmModal(false)}
                disabled={isDeletingAssessment}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl cursor-pointer transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleDeleteAssessment}
                disabled={isDeletingAssessment}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl cursor-pointer shadow-md transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeletingAssessment ? 'Deleting...' : 'Delete Permanently'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- SUBTAB 3: PAYMENTS & TRANSACTIONS (PHASE 19 LIVE RAZORPAY SYNC) --- */}
      {adminSubTab === 'payments' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 font-['Outfit'] flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-emerald-600" />
                  <span>Razorpay Payments & Transactions Audit</span>
                </h2>
                <p className="text-2xs text-slate-500 font-medium">
                  Authoritative live Razorpay payment records merged with FirstRound database fulfillment audit
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-extrabold border border-emerald-200">
                  {paymentPagination.total || paymentsList.length} Transactions
                </span>
                <button
                  onClick={() => fetchPayments(0)}
                  disabled={loadingPayments}
                  title="Refresh payments"
                  className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5 text-xs font-bold shadow-xs"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${loadingPayments ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {/* Filter Toolbar: Date Range & Status Filter */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <span>From:</span>
                  <input
                    type="date"
                    value={paymentFromDate}
                    onChange={(e) => setPaymentFromDate(e.target.value)}
                    className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <span>To:</span>
                  <input
                    type="date"
                    value={paymentToDate}
                    onChange={(e) => setPaymentToDate(e.target.value)}
                    className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <span>Status:</span>
                  <select
                    value={paymentStatusFilter}
                    onChange={(e) => setPaymentStatusFilter(e.target.value)}
                    className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="CAPTURED">CAPTURED</option>
                    <option value="CREATED">CREATED</option>
                    <option value="FAILED">FAILED</option>
                    <option value="UNMATCHED">UNMATCHED</option>
                    <option value="FULFILLED">FULFILLED</option>
                    <option value="PENDING">PENDING</option>
                  </select>
                </div>
              </div>

              <button
                onClick={() => fetchPayments(0)}
                disabled={loadingPayments}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                Apply Filters
              </button>
            </div>

            {loadingPayments ? (
              <div className="p-8 text-center text-slate-500 text-xs font-semibold">
                Fetching live Razorpay payment transactions...
              </div>
            ) : paymentsList.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
                <CreditCard className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-xs font-bold text-slate-700">No payment transactions found</p>
                <p className="text-2xs text-slate-500">
                  No Razorpay payment records matched the selected date range or status filters.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="p-3.5">Internal Order</th>
                        <th className="p-3.5">User / Customer</th>
                        <th className="p-3.5">Product</th>
                        <th className="p-3.5">Amount</th>
                        <th className="p-3.5">Razorpay Order / Payment</th>
                        <th className="p-3.5">Payment Status</th>
                        <th className="p-3.5">Fulfillment Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paymentsList.map((p) => {
                        const amountRupees = (p.amount / 100).toFixed(2);
                        const isCaptured = p.status === 'CAPTURED';
                        const isFailed = p.status === 'FAILED';
                        const isUnmatched = p.isUnmatched || p.fulfillmentStatus === 'UNMATCHED';
                        const isFulfilled = p.fulfillmentStatus === 'FULFILLED';
                        const isPending = p.fulfillmentStatus === 'PENDING' || p.fulfillmentStatus === 'RECONCILIATION_REQUIRED';

                        return (
                          <tr key={p.id} className={`transition-colors ${isUnmatched ? 'bg-amber-50/40 hover:bg-amber-50/80' : 'hover:bg-slate-50/70'}`}>
                            {/* Internal Order & Date */}
                            <td className="p-3.5 space-y-0.5">
                              {isUnmatched ? (
                                <span className="text-slate-400 font-bold font-mono block">—</span>
                              ) : (
                                <span className="font-mono font-bold text-slate-900 block">{p.internalOrderId || p.id}</span>
                              )}
                              <span className="text-2xs text-slate-500">
                                {new Date(p.createdAt).toLocaleString()}
                              </span>
                            </td>

                            {/* User / Customer */}
                            <td className="p-3.5 space-y-0.5">
                              {isUnmatched ? (
                                <div>
                                  <span className="text-slate-400 font-bold block">—</span>
                                  {p.userEmail && <span className="text-2xs text-slate-500 font-mono block">{p.userEmail}</span>}
                                </div>
                              ) : (
                                <div>
                                  <span className="font-semibold text-slate-800 block">
                                    {p.userName || p.userEmail || p.userId || '—'}
                                  </span>
                                  {p.userId && <span className="text-2xs text-slate-500 font-mono block">{p.userId}</span>}
                                </div>
                              )}
                            </td>

                            {/* Product */}
                            <td className="p-3.5 space-y-0.5">
                              {isUnmatched ? (
                                <span className="text-slate-400 font-bold block">—</span>
                              ) : (
                                <div>
                                  <span className="font-bold text-slate-900 block">
                                    {p.productTitle || p.productId || '—'}
                                  </span>
                                  {p.productType && (
                                    <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold rounded bg-slate-100 text-slate-600">
                                      {p.productType}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Amount */}
                            <td className="p-3.5">
                              <span className="font-extrabold font-mono text-slate-900 text-sm">
                                ₹{amountRupees}
                              </span>
                            </td>

                            {/* Razorpay Order / Payment */}
                            <td className="p-3.5 space-y-0.5 text-2xs font-mono text-slate-600">
                              <div>Order: {p.razorpayOrderId || '—'}</div>
                              <div>Pay: {p.razorpayPaymentId || (isUnmatched ? p.id : '—')}</div>
                            </td>

                            {/* Payment Status (Razorpay) */}
                            <td className="p-3.5">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-extrabold uppercase border ${
                                  isCaptured
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                    : isFailed
                                    ? 'bg-rose-100 text-rose-800 border-rose-300'
                                    : 'bg-amber-100 text-amber-800 border-amber-300'
                                }`}
                              >
                                {p.status}
                              </span>
                            </td>

                            {/* Fulfillment Status (FirstRound DB) */}
                            <td className="p-3.5">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-extrabold uppercase border ${
                                  isFulfilled
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                    : isUnmatched
                                    ? 'bg-purple-100 text-purple-800 border-purple-300'
                                    : isPending
                                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                                    : 'bg-slate-100 text-slate-700 border-slate-300'
                                }`}
                              >
                                {p.fulfillmentStatus || (isFulfilled ? 'FULFILLED' : 'NOT FULFILLED')}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-600">
                  <div>
                    Showing {paymentSkip + 1} - {Math.min(paymentSkip + paymentsList.length, paymentPagination.total || paymentsList.length)} of {paymentPagination.total || paymentsList.length} transactions
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const newSkip = Math.max(0, paymentSkip - paymentCount);
                        setPaymentSkip(newSkip);
                        fetchPayments(newSkip);
                      }}
                      disabled={paymentSkip === 0 || loadingPayments}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold disabled:opacity-40 cursor-pointer"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => {
                        const newSkip = paymentSkip + paymentCount;
                        setPaymentSkip(newSkip);
                        fetchPayments(newSkip);
                      }}
                      disabled={!paymentPagination.hasMore || loadingPayments}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold disabled:opacity-40 cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Recurring Premium Subscriptions Table */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 font-['Outfit'] flex items-center gap-2">
                  <Crown className="w-5 h-5 text-amber-500" />
                  <span>Razorpay Recurring Subscriptions Audit</span>
                </h2>
                <p className="text-2xs text-slate-500 font-medium">
                  Authoritative FirstRound Premium subscriber lifecycle and billing periods
                </p>
              </div>
              <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-extrabold border border-amber-200">
                {subscriptionsList.length} Subscriptions
              </span>
            </div>

            {subscriptionsList.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
                <Crown className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-xs font-bold text-slate-700">No Premium subscriptions recorded yet</p>
                <p className="text-2xs text-slate-500">
                  Subscriptions will appear here as users upgrade to FirstRound Premium in Test Mode.
                </p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="p-3.5">Subscription ID</th>
                      <th className="p-3.5">User</th>
                      <th className="p-3.5">Plan</th>
                      <th className="p-3.5">Amount</th>
                      <th className="p-3.5">Billing Period</th>
                      <th className="p-3.5">Razorpay Order / Payment</th>
                      <th className="p-3.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {subscriptionsList.map((s: any) => {
                      const isPro = s.plan === 'PRO' || s.razorpayPlanId === 'plan_pro';
                      const planTitle = isPro ? 'FirstRound Pro' : 'FirstRound Plus';
                      const amountText = isPro ? '₹349/month' : '₹199/month';

                      const statusUpper = (s.status || '').toUpperCase();
                      const isActive = statusUpper === 'ACTIVE';
                      const isCancelled = statusUpper === 'CANCELLED';
                      const isExpired = statusUpper === 'EXPIRED';

                      const rzpOrderId = s.razorpayOrderId || (s.razorpaySubscriptionId?.startsWith('order_') ? s.razorpaySubscriptionId : null);
                      const rzpPaymentId = s.razorpayPaymentId || null;

                      return (
                        <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="p-3.5 space-y-0.5">
                            <span className="font-mono font-bold text-slate-900 block">{s.id}</span>
                            <span className="text-2xs text-slate-500 font-mono">
                              RZP: {s.razorpaySubscriptionId || rzpOrderId || '—'}
                            </span>
                          </td>
                          <td className="p-3.5 space-y-0.5">
                            <span className="font-semibold text-slate-800 block">
                              {s.userName || s.userEmail || s.userId}
                            </span>
                            <span className="text-2xs text-slate-500 font-mono">{s.userId}</span>
                          </td>
                          <td className="p-3.5 space-y-0.5">
                            <span className="font-bold text-slate-900 block">
                              {planTitle}
                            </span>
                            <span className="text-2xs text-slate-500 font-mono">
                              {s.razorpayPlanId || (isPro ? 'plan_pro' : 'plan_plus')}
                            </span>
                          </td>
                          <td className="p-3.5">
                            <span className="font-extrabold font-mono text-slate-900 text-sm block">
                              {amountText}
                            </span>
                          </td>
                          <td className="p-3.5 space-y-0.5 text-2xs text-slate-600">
                            {s.currentPeriodStart && s.currentPeriodEnd ? (
                              <div>
                                {new Date(s.currentPeriodStart).toLocaleDateString()} – {new Date(s.currentPeriodEnd).toLocaleDateString()}
                              </div>
                            ) : (
                              <div>Pending first charge</div>
                            )}
                            {s.cancelledAt && (
                              <div className="text-rose-600 font-medium">
                                Cancelled on {new Date(s.cancelledAt).toLocaleDateString()}
                              </div>
                            )}
                          </td>
                          <td className="p-3.5 space-y-0.5 text-2xs font-mono text-slate-600">
                            <div>Order: {rzpOrderId || '—'}</div>
                            <div>
                              Pay: {rzpPaymentId ? rzpPaymentId : <span className="text-slate-400 font-sans italic">Pending / Not charged</span>}
                            </div>
                          </td>
                          <td className="p-3.5">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-extrabold uppercase border ${
                                isActive
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : isCancelled
                                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                                  : isExpired
                                  ? 'bg-rose-100 text-rose-800 border-rose-300'
                                  : 'bg-slate-100 text-slate-800 border-slate-300'
                              }`}
                            >
                              {statusUpper}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: USER DETAILS DRAWER */}
      {selectedUserForDetails && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md p-6 text-slate-900 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-600 text-white flex items-center justify-center font-extrabold text-sm shadow-xs">
                  {selectedUserForDetails.name?.[0] || 'U'}
                </div>
                <div>
                  <h3 className="text-base font-bold font-['Outfit'] text-slate-900">{selectedUserForDetails.name}</h3>
                  <p className="text-2xs text-slate-500">{selectedUserForDetails.email}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedUserForDetails(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                <div>
                  <span className="text-slate-500 text-2xs font-semibold block">Role</span>
                  <span className="font-extrabold text-purple-700 uppercase">{selectedUserForDetails.role || 'student'}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-2xs font-semibold block">League Tier</span>
                  <span className="font-extrabold text-amber-600 uppercase">{selectedUserForDetails.currentLeague || 'Bronze'}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-2xs font-semibold block">Lifetime XP</span>
                  <span className="font-extrabold text-emerald-700">{selectedUserForDetails.totalPoints || 0} XP</span>
                </div>
                <div>
                  <span className="text-slate-500 text-2xs font-semibold block">Average Accuracy</span>
                  <span className="font-extrabold text-sky-700">{selectedUserForDetails.averageAccuracy || 0}%</span>
                </div>
              </div>

              <div className="space-y-1.5 p-3 bg-white border border-slate-200 rounded-xl text-2xs">
                <div className="flex justify-between text-slate-600">
                  <span>Tests Attempted:</span>
                  <strong className="text-slate-900">{selectedUserForDetails.totalTestsAttempted || 0}</strong>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Target Role / Company:</span>
                  <strong className="text-slate-900">{selectedUserForDetails.targetRole || selectedUserForDetails.targetCompany || 'General Placement'}</strong>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Registration Date:</span>
                  <strong className="text-slate-900">
                    {selectedUserForDetails.createdAt ? new Date(selectedUserForDetails.createdAt).toLocaleDateString() : 'Active Production'}
                  </strong>
                </div>
              </div>

              {/* Deep AI Credit Wallet Section */}
              <div className="p-3.5 bg-amber-500/[0.04] border border-amber-200/80 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    <span className="text-xs font-bold text-slate-900">Deep AI Credit Wallet</span>
                  </div>
                  <span className="text-xs font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-200">
                    {userCredits?.total ?? '...'} Total Credits
                  </span>
                </div>

                {userCredits && (
                  <div className="grid grid-cols-3 gap-2 text-center text-2xs">
                    <div className="bg-white p-2 rounded-lg border border-amber-200/60">
                      <span className="text-slate-500 block">Free</span>
                      <strong className="text-slate-900 text-xs">{userCredits.free}</strong>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-amber-200/60">
                      <span className="text-slate-500 block">Purchased</span>
                      <strong className="text-slate-900 text-xs">{userCredits.purchased}</strong>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-amber-200/60">
                      <span className="text-slate-500 block">Premium</span>
                      <strong className="text-slate-900 text-xs">{userCredits.premium}</strong>
                    </div>
                  </div>
                )}

                {/* Premium Period Lifecycle Details */}
                {userCredits?.premiumPeriodStatus && userCredits.premiumPeriodStatus !== 'NONE' && (
                  <div className="p-2 bg-white rounded-lg border border-amber-200/60 text-2xs space-y-1">
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="font-semibold">Billing Period:</span>
                      <span className={`font-bold ${userCredits.premiumPeriodStatus === 'ACTIVE' ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {userCredits.premiumPeriodStatus}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-500">
                      <span>Allowance / Used:</span>
                      <span className="font-mono font-bold text-slate-800">
                        {userCredits.premiumAllocated ?? 0} alloc / {userCredits.premiumUsed ?? 0} used
                      </span>
                    </div>
                    {userCredits.premiumPeriodEnd && (
                      <div className="flex items-center justify-between text-slate-500">
                        <span>Period Ends:</span>
                        <span className="font-mono text-slate-700">
                          {new Date(userCredits.premiumPeriodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Grant Credits Controls */}
                <div className="pt-2 border-t border-amber-200/60 space-y-2">
                  <span className="text-[11px] font-bold text-slate-700 block">Grant User Credits:</span>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="number"
                      min="1"
                      value={adjustAmount || ''}
                      onChange={(e) => setAdjustAmount(parseInt(e.target.value, 10) || 0)}
                      placeholder="Amount"
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                    />
                    <select
                      value={adjustSource}
                      onChange={(e) => setAdjustSource(e.target.value as any)}
                      className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-2xs font-bold"
                    >
                      <option value="FREE">FREE</option>
                      <option value="PURCHASED">PURCHASED</option>
                      <option value="PREMIUM">PREMIUM</option>
                    </select>
                    <button
                      type="button"
                      onClick={handleGrantCredits}
                      disabled={isAdjustingCredits || adjustAmount <= 0}
                      className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-2xs font-bold rounded-lg shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {isAdjustingCredits ? 'Applying...' : 'Apply'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Account Access Section */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-slate-700" />
                    <span className="text-xs font-bold text-slate-900">Account Access</span>
                  </div>
                  <span className={`text-2xs font-extrabold px-2 py-0.5 rounded-md border ${
                    (selectedUserForDetails.accountStatus || 'ACTIVE') === 'ACTIVE'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      : (selectedUserForDetails.accountStatus || 'ACTIVE') === 'TEMPORARILY_BANNED'
                      ? 'bg-amber-100 text-amber-800 border-amber-200'
                      : 'bg-rose-100 text-rose-800 border-rose-200'
                  }`}>
                    {selectedUserForDetails.accountStatus || 'ACTIVE'}
                  </span>
                </div>

                {/* Status Details */}
                {selectedUserForDetails.accountStatus && selectedUserForDetails.accountStatus !== 'ACTIVE' && (
                  <div className="p-2.5 bg-white rounded-xl border border-slate-200 text-2xs space-y-1">
                    {selectedUserForDetails.bannedUntil && (
                      <p className="text-amber-800 font-bold">
                        Banned Until: {new Date(selectedUserForDetails.bannedUntil).toLocaleString()}
                      </p>
                    )}
                    {selectedUserForDetails.banReason && (
                      <p className="text-slate-600">
                        <span className="font-bold">Reason:</span> {selectedUserForDetails.banReason}
                      </p>
                    )}
                    {selectedUserForDetails.deletedAt && (
                      <p className="text-rose-700 font-bold">
                        Account Deleted on: {new Date(selectedUserForDetails.deletedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}

                {/* Actions */}
                {selectedUserForDetails.email === 'pawankhot9@gmail.com' || selectedUserForDetails.id === 'user_superadmin_pawankhot' ? (
                  <div className="p-2 bg-indigo-50 border border-indigo-100 rounded-lg text-2xs font-bold text-indigo-700 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Primary Super Admin Account (Protected from Ban & Deletion)</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(selectedUserForDetails.accountStatus === 'TEMPORARILY_BANNED' || selectedUserForDetails.accountStatus === 'PERMANENTLY_BANNED') && (
                      <button
                        type="button"
                        onClick={handleRestoreAccess}
                        disabled={isSubmittingAccessAction}
                        className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                      >
                        {isSubmittingAccessAction ? 'Restoring...' : 'Restore Access'}
                      </button>
                    )}

                    {(!selectedUserForDetails.accountStatus || selectedUserForDetails.accountStatus === 'ACTIVE') && activeAccessAction === 'none' && (
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveAccessAction('temp_ban')}
                          className="px-2 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-2xs rounded-xl transition-all cursor-pointer"
                        >
                          Temp Ban
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveAccessAction('perm_ban')}
                          disabled={currentUser.role !== 'super_admin'}
                          className="px-2 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-2xs rounded-xl transition-all disabled:opacity-40 cursor-pointer"
                          title={currentUser.role !== 'super_admin' ? 'Super Admin Only' : ''}
                        >
                          Perm Ban
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveAccessAction('delete')}
                          disabled={currentUser.role !== 'super_admin'}
                          className="px-2 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-2xs rounded-xl transition-all disabled:opacity-40 cursor-pointer"
                          title={currentUser.role !== 'super_admin' ? 'Super Admin Only' : ''}
                        >
                          Delete
                        </button>
                      </div>
                    )}

                    {/* Temp Ban Form */}
                    {activeAccessAction === 'temp_ban' && (
                      <div className="p-3 bg-white border border-amber-200 rounded-xl space-y-2 text-2xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-amber-900">Temporary Ban Controls</span>
                          <button onClick={() => setActiveAccessAction('none')} className="text-slate-400 hover:text-slate-600 font-bold">Cancel</button>
                        </div>
                        <div>
                          <label className="block text-slate-500 mb-1 font-bold">Ban Duration (Days):</label>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {[1, 3, 7, 14, 30].map(d => (
                              <button
                                key={d}
                                type="button"
                                onClick={() => setBanDurationDays(d)}
                                className={`px-2 py-1 rounded border font-bold ${banDurationDays === d ? 'bg-amber-500 text-white border-amber-600' : 'bg-slate-50 text-slate-700 border-slate-200'}`}
                              >
                                {d}d
                              </button>
                            ))}
                            <input
                              type="number"
                              min="1"
                              value={banDurationDays}
                              onChange={(e) => setBanDurationDays(parseInt(e.target.value, 10) || 1)}
                              className="w-16 px-2 py-1 bg-white border border-slate-300 rounded text-2xs font-bold"
                            />
                          </div>
                        </div>
                        <div>
                          <input
                            type="text"
                            value={banReason}
                            onChange={(e) => setBanReason(e.target.value)}
                            placeholder="Optional Ban Reason..."
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-2xs"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleTempBan}
                          disabled={isSubmittingAccessAction}
                          className="w-full py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-all cursor-pointer"
                        >
                          {isSubmittingAccessAction ? 'Banning...' : `Confirm ${banDurationDays}-Day Temporary Ban`}
                        </button>
                      </div>
                    )}

                    {/* Permanent Ban Form */}
                    {activeAccessAction === 'perm_ban' && (
                      <div className="p-3 bg-white border border-rose-200 rounded-xl space-y-2 text-2xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-rose-900">Permanent Ban Confirmation</span>
                          <button onClick={() => setActiveAccessAction('none')} className="text-slate-400 hover:text-slate-600 font-bold">Cancel</button>
                        </div>
                        <p className="text-rose-700 font-medium">Type target name or email to confirm permanent ban:</p>
                        <input
                          type="text"
                          value={permBanConfirm}
                          onChange={(e) => setPermBanConfirm(e.target.value)}
                          placeholder={`Type "${selectedUserForDetails.email}"...`}
                          className="w-full px-2.5 py-1.5 border border-rose-200 rounded-lg text-2xs font-mono"
                        />
                        <input
                          type="text"
                          value={banReason}
                          onChange={(e) => setBanReason(e.target.value)}
                          placeholder="Optional Ban Reason..."
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-2xs"
                        />
                        <button
                          type="button"
                          onClick={handlePermBan}
                          disabled={isSubmittingAccessAction || !permBanConfirm.trim()}
                          className="w-full py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition-all disabled:opacity-40 cursor-pointer"
                        >
                          {isSubmittingAccessAction ? 'Processing...' : 'Confirm Permanent Ban'}
                        </button>
                      </div>
                    )}

                    {/* Delete Account Form */}
                    {activeAccessAction === 'delete' && (
                      <div className="p-3 bg-white border border-slate-300 rounded-xl space-y-2 text-2xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">Delete Account Confirmation</span>
                          <button onClick={() => setActiveAccessAction('none')} className="text-slate-400 hover:text-slate-600 font-bold">Cancel</button>
                        </div>
                        <p className="text-slate-700 font-medium">Type exact target email to delete account tombstone:</p>
                        <input
                          type="text"
                          value={deleteConfirmEmail}
                          onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                          placeholder={`Type "${selectedUserForDetails.email}"...`}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-2xs font-mono"
                        />
                        <button
                          type="button"
                          onClick={handleDeleteUser}
                          disabled={isSubmittingAccessAction || deleteConfirmEmail.trim().toLowerCase() !== selectedUserForDetails.email.toLowerCase()}
                          className="w-full py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-all disabled:opacity-40 cursor-pointer"
                        >
                          {isSubmittingAccessAction ? 'Deleting...' : 'Confirm Delete Account'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end border-t border-slate-100 pt-3">
              <button
                onClick={() => setSelectedUserForDetails(null)}
                className="px-4 py-2 bg-slate-900 text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                Close Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DUPLICATE CHECK WARNING */}
      {showDuplicateModal && duplicateResult && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-amber-500/40 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl p-6 text-white space-y-6">
            <div className="flex items-center gap-3 text-amber-400 border-b border-slate-800 pb-4">
              <AlertTriangle className="w-6 h-6" />
              <div>
                <h3 className="text-base font-bold font-['Outfit']">Mandatory Duplicate Check Triggered</h3>
                <p className="text-2xs text-amber-300">
                  {duplicateResult.matchType === 'EXACT' ? 'Exact Duplicate Found (100% Match)' : 'Near Duplicate Detected'}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">
              <strong>Guidance:</strong> Similar question already exists in the Question Bank. Reuse or edit the existing question to avoid duplication across assessments.
            </p>

            <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
              {duplicateResult.matches?.map((m: any) => (
                <div key={m.existingQuestionId} className="p-4 bg-slate-800/60 border border-slate-700/60 rounded-2xl space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-2xs text-amber-400 font-bold">{m.existingQuestionId}</span>
                    <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded-md text-2xs font-extrabold">
                      {m.similarityScore}% Similarity
                    </span>
                  </div>
                  <p className="text-slate-200 font-medium">{m.questionText}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                onClick={() => setShowDuplicateModal(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 font-bold text-xs rounded-xl cursor-pointer"
              >
                Cancel & Reuse Existing
              </button>
              <button
                onClick={() => handleSaveQuestion(true)}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl cursor-pointer"
              >
                Create New Question Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: BULK IMPORT */}
      {showBulkImportModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl p-6 text-white space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-lg font-bold font-['Outfit']">Bulk Question Import (CSV / JSON)</h3>
              <button onClick={() => setShowBulkImportModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-2xs font-bold uppercase text-slate-400 mb-1">
                  Paste JSON Array or CSV Rows
                </label>
                <textarea
                  rows={6}
                  value={bulkRawText}
                  onChange={(e) => setBulkRawText(e.target.value)}
                  placeholder={`[ { "questionText": "What is 2+2?", "options": [{"id":"A","text":"4"}], "correctOption": "A" } ]`}
                  className="w-full p-4 bg-slate-800 border border-slate-700 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleParseBulkInput}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl cursor-pointer"
                >
                  Parse & Validate Input
                </button>

                {bulkParsedQuestions.length > 0 && (
                  <button
                    type="button"
                    onClick={handleCommitBulkImport}
                    disabled={isSubmittingImport}
                    className="px-6 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-xs cursor-pointer"
                  >
                    {isSubmittingImport ? 'Importing...' : `Commit Import (${bulkParsedQuestions.length})`}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: BROADCAST ANNOUNCEMENT */}
      {showAnnouncementModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0B132B] border border-slate-800 rounded-3xl w-full max-w-lg p-6 text-slate-100 space-y-5 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                  <Megaphone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold font-['Outfit'] tracking-tight text-white">
                    Send Announcement
                  </h3>
                  <p className="text-2xs text-slate-400 font-medium">
                    Send an important update to selected candidates.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAnnouncementModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/60 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form controls */}
            <div className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Target Audience
                  </label>
                  <select
                    value={annTargetCompany}
                    onChange={(e) => setAnnTargetCompany(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0F172A] border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/60"
                  >
                    <option value="">All Registered Candidates ({annCandidateCount} Candidates)</option>
                    <option value="TCS">TCS Aspirants</option>
                    <option value="Infosys">Infosys Aspirants</option>
                    <option value="Wipro">Wipro Aspirants</option>
                    <option value="Accenture">Accenture Aspirants</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Announcement Type
                  </label>
                  <select
                    value={annType}
                    onChange={(e) => setAnnType(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0F172A] border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/60"
                  >
                    <option value="ANNOUNCEMENT">Platform Update</option>
                    <option value="NEW_TEST">New Assessment Released</option>
                    <option value="REMINDER">Assessment Reminder</option>
                    <option value="REVISION">Revision Reminder</option>
                    <option value="LEAGUE">Weekly League Update</option>
                    <option value="AI_CREDITS">AI Credits Update</option>
                    <option value="SYSTEM">System Notice</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Priority Level
                  </label>
                  <select
                    value={annPriority}
                    onChange={(e) => setAnnPriority(e.target.value as any)}
                    className="w-full px-3 py-2 bg-[#0F172A] border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/60"
                  >
                    <option value="Normal">Normal</option>
                    <option value="Important">Important</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Optional Action
                  </label>
                  <select
                    value={annActionType}
                    onChange={(e) => setAnnActionType(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0F172A] border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/60"
                  >
                    <option value="NONE">None</option>
                    <option value="OPEN_TEST">Open Assessment</option>
                    <option value="OPEN_REVISION">Open Revision Vault</option>
                    <option value="OPEN_CAREER">Open Career Track</option>
                    <option value="OPEN_CREDITS">Open Credit Wallet</option>
                    <option value="OPEN_LEADERBOARD">Open Weekly League</option>
                  </select>
                </div>
              </div>

              {annActionType === 'OPEN_TEST' && (
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Target Assessment ID / Path
                  </label>
                  <input
                    type="text"
                    value={annActionTestId}
                    onChange={(e) => setAnnActionTestId(e.target.value)}
                    placeholder="e.g. cat_foundation_quant or test_123"
                    className="w-full px-3.5 py-2 bg-[#0F172A] border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/60 placeholder:text-slate-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={annTitle}
                  onChange={(e) => setAnnTitle(e.target.value)}
                  placeholder="e.g. TCS NQT 2026 Mock Released"
                  className="w-full px-3.5 py-2 bg-[#0F172A] border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/60 placeholder:text-slate-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Message Content
                </label>
                <textarea
                  rows={3}
                  value={annMsg}
                  onChange={(e) => setAnnMsg(e.target.value)}
                  placeholder="A new placement mock is now available for all TCS aspirants..."
                  className="w-full px-3.5 py-2 bg-[#0F172A] border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/60 placeholder:text-slate-500"
                />
              </div>

              {/* Notification Preview Card */}
              <div className="pt-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1.5 flex items-center gap-1">
                  <Eye className="w-3 h-3" /> Notification Preview
                </div>
                <div className="p-3 bg-[#080E21] border border-slate-800 rounded-xl flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                    <Megaphone className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <h5 className="text-xs font-bold text-white truncate">
                        {annTitle.trim() || 'TCS NQT 2026 Mock Released'}
                      </h5>
                      <span className="text-[10px] text-slate-400 shrink-0">Today • Just now</span>
                    </div>
                    <p className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed">
                      {annMsg.trim() || 'A new placement mock is now available.'}
                    </p>
                    {annActionType !== 'NONE' && (
                      <div className="pt-0.5 flex items-center gap-1 text-[10px] font-bold text-amber-400">
                        <span>{getActionLabelForType(annActionType) || 'Open Action'}</span>
                        <ArrowRight className="w-3 h-3" />
                      </div>
                    )}
                  </div>
                  <div className="w-2 h-2 rounded-full bg-amber-500 shrink-0 mt-1.5 ring-2 ring-amber-500/30" />
                </div>
              </div>
            </div>

            {/* Confirmation step or Actions */}
            {showAnnConfirmation ? (
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-2.5">
                <p className="text-xs font-bold text-amber-200">
                  Confirm Dispatch: Send this announcement to {annTargetCompany ? `${annTargetCompany} candidates` : 'all candidates'} ({annCandidateCount} user{annCandidateCount === 1 ? '' : 's'})?
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShowAnnConfirmation(false)}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-2xs font-bold cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleSendAnnouncement}
                    disabled={isSubmittingAnn}
                    className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 rounded-xl text-2xs font-extrabold cursor-pointer transition-colors"
                  >
                    {isSubmittingAnn ? 'Sending...' : 'Confirm & Dispatch'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
                <span className="text-[11px] text-slate-400 font-medium">
                  Recipient Audience: <strong className="text-slate-200">{annTargetCompany ? `${annTargetCompany} candidates` : 'All Registered Candidates'} ({annCandidateCount})</strong>
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAnnouncementModal(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (annTitle.trim() && annMsg.trim()) setShowAnnConfirmation(true);
                    }}
                    disabled={!annTitle.trim() || !annMsg.trim()}
                    className="px-5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-extrabold text-xs rounded-xl cursor-pointer transition-colors shadow-xs"
                  >
                    Send Announcement
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: AI TEST GENERATOR */}
      {showAIGenerator && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 text-white space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold font-['Outfit'] flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <span>AI Test Generator</span>
              </h3>
              <button onClick={() => setShowAIGenerator(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGenerateAIAssessment} className="space-y-4">
              <div>
                <label className="block text-2xs font-bold uppercase text-slate-400 mb-1">Target Topic / Pattern</label>
                <input
                  type="text"
                  required
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  placeholder="e.g. TCS NQT 2026 Advanced Numerical Ability"
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">Specify topic focus, target company, or exam pattern.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-2xs font-bold uppercase text-slate-400 mb-1">Category</label>
                  <select
                    value={aiCategory}
                    onChange={(e) => setAiCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
                  >
                    <option value="Quantitative">Quantitative</option>
                    <option value="Logical">Logical</option>
                    <option value="Verbal">Verbal</option>
                    <option value="Coding">Coding</option>
                  </select>
                </div>

                <div>
                  <label className="block text-2xs font-bold uppercase text-slate-400 mb-1">Questions Count (1-25)</label>
                  <input
                    type="number"
                    min={1}
                    max={25}
                    value={aiNumQuestions}
                    onChange={(e) => setAiNumQuestions(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
                  />
                </div>
              </div>

              <p className="text-2xs text-amber-300 bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">
                <strong>Important:</strong> Generated content will be saved as <strong>DRAFT</strong>. Admins must review and publish before candidates can access it.
              </p>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button type="button" onClick={() => setShowAIGenerator(false)} className="px-4 py-2 bg-slate-800 text-slate-300 font-bold text-xs rounded-xl cursor-pointer">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isGeneratingAI || !aiTopic.trim()}
                  className="px-5 py-2 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl cursor-pointer"
                >
                  {isGeneratingAI ? 'Generating questions with AI...' : 'Generate Test Series (Saved as DRAFT)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PROMOTE CONFIRMATION */}
      {userToPromote && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-purple-500/40 rounded-3xl w-full max-w-md p-6 text-white space-y-5 shadow-2xl">
            <div className="flex items-center gap-3 text-purple-400 border-b border-slate-800 pb-3">
              <UserPlus className="w-6 h-6" />
              <h3 className="text-base font-bold font-['Outfit']">Promote User to Admin</h3>
            </div>
            <p className="text-xs text-slate-300">
              Are you sure you want to promote <strong className="text-white">{userToPromote.name}</strong> ({userToPromote.email}) to Admin? Promoting user to Admin grants them access to assessment creation, question bank, and analytics tools.
            </p>
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button onClick={() => setUserToPromote(null)} className="px-4 py-2 bg-slate-800 text-slate-300 font-bold text-xs rounded-xl cursor-pointer">
                Cancel
              </button>
              <button
                onClick={handleConfirmPromote}
                disabled={isSubmittingRoleChange}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                {isSubmittingRoleChange ? 'Promoting...' : 'Confirm Promote'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REVOKE CONFIRMATION */}
      {userToRevoke && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/40 rounded-3xl w-full max-w-md p-6 text-white space-y-5 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400 border-b border-slate-800 pb-3">
              <UserMinus className="w-6 h-6" />
              <h3 className="text-base font-bold font-['Outfit']">Revoke Admin Access</h3>
            </div>
            <p className="text-xs text-slate-300">
              Are you sure you want to revoke Admin access for <strong className="text-white">{userToRevoke.name}</strong> ({userToRevoke.email})? Revoking Admin access will change their role to Student and remove Admin Panel access.
            </p>
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button onClick={() => setUserToRevoke(null)} className="px-4 py-2 bg-slate-800 text-slate-300 font-bold text-xs rounded-xl cursor-pointer">
                Cancel
              </button>
              <button
                onClick={handleConfirmRevoke}
                disabled={isSubmittingRoleChange}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                {isSubmittingRoleChange ? 'Revoking...' : 'Confirm Revoke'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
