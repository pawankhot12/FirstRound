import { GoogleGenAI } from '@google/genai';
import {
  AIDoubtResponse,
  Question,
  TestSeries,
  AICopilotMode,
  AICopilotUserContext,
  AICopilotResponse,
  PlacementStrategyState,
  PlacementPriority,
  PlacementStrategy,
  AIRecommendedAction,
} from '../src/types';

let genAIClient: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI | null {
  if (!genAIClient && process.env.GEMINI_API_KEY) {
    genAIClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return genAIClient;
}

export interface PlacementIntelligence {
  profile: {
    name: string;
    targetCompany: string | null;
    targetRole: string | null;
  };
  progress: {
    lifetimeXp: number;
    level: number;
    weeklyXp: number;
    leagueTier: string;
    leagueRank: number | null;
  };
  topicClassifications: {
    critical: string[];
    needsWork: string[];
    strong: string[];
  };
  performanceTrend: 'IMPROVING' | 'DECLINING' | 'STABLE' | 'INSUFFICIENT_DATA';
  assessmentSummary: {
    totalExamsCompleted: number;
    strongestTopic: string | null;
    weakestTopic: string | null;
  };
  revisionSummary: {
    bookmarkedCount: number;
    weakQuestionsCount: number;
  };
  recommendedActions: AIRecommendedAction[];
}

export function derivePlacementIntelligence(ctx: any): PlacementIntelligence {
  const profile = ctx.profile || {};
  const progress = ctx.progress || {};
  const assessments = ctx.assessments || {};
  const revision = ctx.revision || {};
  const available = ctx.availableAssessments || [];
  const topicStats = ctx.topicStats || {};

  const critical: string[] = [];
  const needsWork: string[] = [];
  const strong: string[] = [];

  Object.entries(topicStats).forEach(([topic, s]: [string, any]) => {
    const total = s.total || 0;
    const correct = s.correct || 0;
    if (total === 0) return;

    const accuracy = Math.round((correct / total) * 100);
    const incorrect = total - correct;

    if (accuracy < 50 || (accuracy < 65 && incorrect >= 2)) {
      critical.push(topic);
    } else if (accuracy < 70) {
      needsWork.push(topic);
    } else {
      strong.push(topic);
    }
  });

  const recentAttempts = (assessments.recentAttempts || []).filter(
    (a: any) => a.mode === 'exam' || !a.mode
  );
  let performanceTrend: PlacementIntelligence['performanceTrend'] = 'INSUFFICIENT_DATA';

  if (recentAttempts.length >= 2) {
    const acc1 = recentAttempts[0]?.accuracyPercentage ?? 0;
    const acc2 = recentAttempts[1]?.accuracyPercentage ?? 0;
    const diff = acc1 - acc2;
    if (diff >= 5) {
      performanceTrend = 'IMPROVING';
    } else if (diff <= -5) {
      performanceTrend = 'DECLINING';
    } else {
      performanceTrend = 'STABLE';
    }
  }

  const recommendedActions: AIRecommendedAction[] = [];

  if (critical.length > 0) {
    const topic = critical[0];
    const match = available.find(
      (a: any) => a.title.toLowerCase().includes(topic.toLowerCase()) || a.category === 'foundation'
    );
    const targetId = match ? match.id : 'cat_foundation';
    recommendedActions.push({
      label: `Practice ${topic}`,
      actionType: 'OPEN_PRACTICE',
      payload: targetId,
    });
  }

  if (profile.targetCompany && profile.targetRole) {
    const compLower = profile.targetCompany.toLowerCase();
    const compMatch = available.find(
      (a: any) => a.id.toLowerCase().includes(compLower) || a.title.toLowerCase().includes(compLower)
    );
    if (compMatch) {
      recommendedActions.push({
        label: `Take ${compMatch.title}`,
        actionType: 'OPEN_TEST',
        payload: compMatch.id,
      });
    } else {
      recommendedActions.push({
        label: 'Explore Assessment Hub',
        actionType: 'NAVIGATE_TAB',
        payload: 'tests',
      });
    }
  } else {
    recommendedActions.push({
      label: 'Set Profile Target',
      actionType: 'NAVIGATE_TAB',
      payload: 'home',
    });
  }

  if ((revision.bookmarkedCount || 0) > 0 || (revision.weakQuestionsCount || 0) > 0) {
    recommendedActions.push({
      label: `Review Revision Vault (${revision.bookmarkedCount || 0} items)`,
      actionType: 'OPEN_REVISION',
      payload: 'vault',
    });
  }

  if ((assessments.totalExamsCompleted || 0) === 0 && recommendedActions.length < 3) {
    const baseId = available[0]?.id || 'cat_foundation';
    recommendedActions.push({
      label: 'Take Baseline Foundation Exam',
      actionType: 'OPEN_TEST',
      payload: baseId,
    });
  }

  return {
    profile: {
      name: profile.name || '',
      targetCompany: profile.targetCompany || null,
      targetRole: profile.targetRole || null,
    },
    progress: {
      lifetimeXp: progress.lifetimeXp ?? 0,
      level: progress.level ?? 1,
      weeklyXp: progress.weeklyXp ?? 0,
      leagueTier: progress.leagueTier || 'Bronze',
      leagueRank: progress.leagueRank || null,
    },
    topicClassifications: {
      critical,
      needsWork,
      strong,
    },
    performanceTrend,
    assessmentSummary: {
      totalExamsCompleted: assessments.totalExamsCompleted ?? 0,
      strongestTopic: assessments.strongestTopic || null,
      weakestTopic: assessments.weakestTopic || null,
    },
    revisionSummary: {
      bookmarkedCount: revision.bookmarkedCount ?? 0,
      weakQuestionsCount: revision.weakQuestionsCount ?? 0,
    },
    recommendedActions: recommendedActions.slice(0, 3),
  };
}

export function buildPlacementStrategy(ctx: any): PlacementStrategy {
  const intel = derivePlacementIntelligence(ctx);
  const available = ctx.availableAssessments || [];
  const profile = intel.profile;
  const progress = intel.progress;
  const critical = intel.topicClassifications.critical;
  const needsWork = intel.topicClassifications.needsWork;
  const revisionCount = (intel.revisionSummary.bookmarkedCount || 0) + (intel.revisionSummary.weakQuestionsCount || 0);
  const totalExams = intel.assessmentSummary.totalExamsCompleted;
  const trend = intel.performanceTrend;

  const targetRoleText = profile.targetRole ? ` for ${profile.targetRole}` : '';
  const targetCompanyText = profile.targetCompany ? ` at ${profile.targetCompany}` : '';

  const findMatchingTest = (searchTerm: string): { id: string; title: string } => {
    const term = searchTerm.toLowerCase();
    const match = available.find(
      (a: any) => a.id.toLowerCase().includes(term) || a.title.toLowerCase().includes(term)
    );
    if (match) return { id: match.id, title: match.title };
    const defaultTest = available[0] || { id: 'cat_foundation', title: 'Foundation Placement Mock' };
    return { id: defaultTest.id, title: defaultTest.title };
  };

  let state: PlacementStrategyState = 'NEW_CANDIDATE';
  let stateBadgeLabel = 'New Candidate';
  let priorityTitle = '';
  let priorityReason = '';
  let priorityAction: AIRecommendedAction = {
    label: 'Take Baseline Assessment',
    actionType: 'OPEN_TEST',
    payload: available[0]?.id || 'cat_foundation',
  };

  const supportingActions: AIRecommendedAction[] = [];

  // P0 — No official Exam completed
  if (totalExams === 0) {
    state = 'NEW_CANDIDATE';
    stateBadgeLabel = 'New Candidate';
    priorityTitle = 'Complete Baseline Placement Exam';
    priorityReason = `${profile.name}, complete your first official placement assessment to evaluate your baseline readiness${targetRoleText}${targetCompanyText}.`;
    const baseTest = available[0] || { id: 'cat_foundation', title: 'Baseline Foundation Exam' };
    priorityAction = {
      label: `Take ${baseTest.title}`,
      actionType: 'OPEN_TEST',
      payload: baseTest.id,
    };

    if (!profile.targetCompany || !profile.targetRole) {
      supportingActions.push({
        label: 'Set Profile Target Company & Role',
        actionType: 'NAVIGATE_TAB',
        payload: 'home',
      });
    }
    supportingActions.push({
      label: 'Explore Assessment Catalogue',
      actionType: 'NAVIGATE_TAB',
      payload: 'tests',
    });
  }
  // P1 — Critical weakness exists
  else if (critical.length > 0) {
    state = 'FIXING_WEAKNESS';
    stateBadgeLabel = 'Fixing Critical Gap';
    const topWeak = critical[0];
    priorityTitle = `Fix ${topWeak}`;
    
    let leagueNote = '';
    if (progress.leagueTier && progress.leagueTier !== 'Bronze') {
      leagueNote = `Your League progress in ${progress.leagueTier} tier is good, but ${topWeak} remains your highest-priority preparation gap. `;
    }

    priorityReason = `${leagueNote}Your recent attempts show ${topWeak} is your highest-priority gap${targetRoleText}${targetCompanyText}. Improving this before your next company mock will give you the highest preparation value.`;

    const matchTest = findMatchingTest(topWeak);
    priorityAction = {
      label: `Practice ${topWeak}`,
      actionType: 'OPEN_PRACTICE',
      payload: matchTest.id,
    };

    // Supporting 1: Target company mock if set
    if (profile.targetCompany) {
      const compLower = profile.targetCompany.toLowerCase();
      const compMatch = available.find(
        (a: any) => a.id.toLowerCase().includes(compLower) || a.title.toLowerCase().includes(compLower)
      );
      if (compMatch) {
        supportingActions.push({
          label: `Take ${compMatch.title}`,
          actionType: 'OPEN_TEST',
          payload: compMatch.id,
        });
      }
    } else {
      supportingActions.push({
        label: 'Set Target Company & Role',
        actionType: 'NAVIGATE_TAB',
        payload: 'home',
      });
    }

    // Supporting 2: Revision Vault if items exist
    if (revisionCount > 0) {
      supportingActions.push({
        label: `Review Revision Vault (${revisionCount} items)`,
        actionType: 'OPEN_REVISION',
        payload: 'vault',
      });
    }
  }
  // P2 — Target company assessment pending (Target company set & matching test in catalogue)
  else if (profile.targetCompany && available.some((a: any) => a.id.toLowerCase().includes(profile.targetCompany!.toLowerCase()) || a.title.toLowerCase().includes(profile.targetCompany!.toLowerCase()))) {
    const compLower = profile.targetCompany.toLowerCase();
    const compMatch = available.find(
      (a: any) => a.id.toLowerCase().includes(compLower) || a.title.toLowerCase().includes(compLower)
    )!;

    state = 'COMPANY_READYING';
    stateBadgeLabel = 'Company Mock Ready';
    priorityTitle = `Target Mock: ${compMatch.title}`;
    priorityReason = `You have set ${profile.targetCompany}${targetRoleText} as your target. Taking ${compMatch.title} will benchmark your readiness against official company patterns.`;
    priorityAction = {
      label: `Take ${compMatch.title}`,
      actionType: 'OPEN_TEST',
      payload: compMatch.id,
    };

    if (revisionCount > 0) {
      supportingActions.push({
        label: `Review Revision Vault (${revisionCount} items)`,
        actionType: 'OPEN_REVISION',
        payload: 'vault',
      });
    }
    supportingActions.push({
      label: 'View Career Track',
      actionType: 'OPEN_CAREER_TRACK',
      payload: 'career',
    });
  }
  // P3 — Revision backlog exists
  else if (revisionCount > 0) {
    state = 'REVISION_REQUIRED';
    stateBadgeLabel = 'Revision Backlog';
    priorityTitle = `Clear Revision Backlog (${revisionCount} items)`;
    priorityReason = `You have ${revisionCount} bookmarked or weak questions waiting in your Revision Vault. Clearing these reinforces your concepts and prevents recurring mistakes.`;
    priorityAction = {
      label: `Review Revision Vault (${revisionCount} items)`,
      actionType: 'OPEN_REVISION',
      payload: 'vault',
    };

    if (!profile.targetCompany || !profile.targetRole) {
      supportingActions.push({
        label: 'Set Target Company & Role',
        actionType: 'NAVIGATE_TAB',
        payload: 'home',
      });
    }
    supportingActions.push({
      label: 'Explore Assessment Hub',
      actionType: 'NAVIGATE_TAB',
      payload: 'tests',
    });
  }
  // P4 — Recent performance declining
  else if (trend === 'DECLINING') {
    state = 'PERFORMANCE_RECOVERY';
    stateBadgeLabel = 'Performance Recovery';
    const weak = intel.assessmentSummary.weakestTopic || (needsWork.length > 0 ? needsWork[0] : 'core problem solving');
    priorityTitle = `Performance Recovery: ${weak}`;
    priorityReason = `Your recent assessment scores show a declining trend. Focused practice on ${weak} will help stabilize your performance score before taking another major mock.`;

    const matchTest = findMatchingTest(weak);
    priorityAction = {
      label: `Practice ${weak}`,
      actionType: 'OPEN_PRACTICE',
      payload: matchTest.id,
    };

    supportingActions.push({
      label: 'Explore Assessment Hub',
      actionType: 'NAVIGATE_TAB',
      payload: 'tests',
    });
  }
  // P5 — Maintaining / Building Foundation
  else {
    if (trend === 'IMPROVING') {
      state = 'MAINTAINING';
      stateBadgeLabel = 'Maintaining Growth';
      priorityTitle = 'Continue Skill Progression';
      priorityReason = `Your assessment scores are steadily improving. Keep up your momentum with advanced practice assessments${targetRoleText}.`;
    } else {
      state = 'BUILDING_FOUNDATION';
      stateBadgeLabel = 'Building Foundation';
      priorityTitle = 'Expand Assessment Coverage';
      priorityReason = `Your performance is stable. Broaden your topic mastery across Quantitative, Logical, and Verbal modules.`;
    }

    const nextTest = available[0] || { id: 'cat_foundation', title: 'Placement Practice Mock' };
    priorityAction = {
      label: `Take ${nextTest.title}`,
      actionType: 'OPEN_TEST',
      payload: nextTest.id,
    };

    if (!profile.targetCompany) {
      supportingActions.push({
        label: 'Set Target Company & Role',
        actionType: 'NAVIGATE_TAB',
        payload: 'home',
      });
    } else {
      supportingActions.push({
        label: 'Explore Career Track',
        actionType: 'OPEN_CAREER_TRACK',
        payload: 'career',
      });
    }
  }

  const finalSupportingActions = supportingActions.slice(0, 2);

  return {
    state,
    stateBadgeLabel,
    priority: {
      title: priorityTitle,
      reason: priorityReason,
      action: priorityAction,
    },
    supportingActions: finalSupportingActions,
    contextSummary: {
      targetCompany: profile.targetCompany || null,
      targetRole: profile.targetRole || null,
      performanceTrend: intel.performanceTrend,
      criticalWeakness: critical.length > 0 ? critical[0] : null,
      leagueTier: progress.leagueTier || 'Bronze',
    },
  };
}

export type UserIntent =
  | 'CASUAL_GREETING'
  | 'GENERAL_CONVERSATION'
  | 'PERFORMANCE'
  | 'PLACEMENT'
  | 'LEARNING'
  | 'DOUBT'
  | 'STUDY_PLANNING'
  | 'NEXT_ACTION'
  | 'FOLLOW_UP';

export function detectUserIntent(message: string, history?: any[]): UserIntent {
  const clean = (message || '').trim().toLowerCase();

  if (/^(hi|hello|hey|greetings|good morning|good afternoon|good evening|yo|sup|hlo|hi there|hey there)[\s!.]*$/i.test(clean)) {
    return 'CASUAL_GREETING';
  }

  if (
    clean.includes('what should i work on') ||
    clean.includes('what should i do') ||
    clean.includes('what to do today') ||
    clean.includes('what next') ||
    clean.includes('what\'s next') ||
    clean.includes('next step') ||
    clean.includes('where to start')
  ) {
    return 'NEXT_ACTION';
  }

  if (
    clean.includes('performance') ||
    clean.includes('how am i doing') ||
    clean.includes('analyze my') ||
    clean.includes('my score') ||
    clean.includes('my accuracy') ||
    clean.includes('my progress') ||
    clean.includes('my stats') ||
    clean.includes('recent test')
  ) {
    return 'PERFORMANCE';
  }

  if (
    clean.includes('study plan') ||
    clean.includes('schedule') ||
    clean.includes('7-day') ||
    clean.includes('7 day') ||
    clean.includes('timetable') ||
    clean.includes('roadmap') ||
    clean.includes('routine')
  ) {
    return 'STUDY_PLANNING';
  }

  if (
    clean.startsWith('explain ') ||
    clean.startsWith('what is ') ||
    clean.startsWith('teach me') ||
    clean.includes('concept') ||
    clean.includes('how to solve') ||
    clean.includes('formula for') ||
    clean.includes('difference between') ||
    clean.includes('normalization') ||
    clean.includes('polymorphism')
  ) {
    return 'LEARNING';
  }

  if (
    clean.includes('why is this wrong') ||
    clean.includes('why is option') ||
    clean.includes('doubt') ||
    clean.includes('incorrect answer') ||
    clean.includes('wrong answer')
  ) {
    return 'DOUBT';
  }

  if (
    clean.includes('prepare for') ||
    clean.includes('target company') ||
    clean.includes('target role') ||
    clean.includes('tcs') ||
    clean.includes('infosys') ||
    clean.includes('wipro') ||
    clean.includes('accenture') ||
    clean.includes('cognizant') ||
    clean.includes('cutoff') ||
    clean.includes('campus hiring') ||
    clean.includes('placement')
  ) {
    return 'PLACEMENT';
  }

  if (Array.isArray(history) && history.length > 0 && clean.split(' ').length <= 4) {
    return 'FOLLOW_UP';
  }

  return 'GENERAL_CONVERSATION';
}

export async function askAICopilot(params: {
  message: string;
  mode?: AICopilotMode;
  userContext?: AICopilotUserContext;
  verifiedContext?: any;
  history?: Array<{ sender: 'user' | 'assistant'; text: string }>;
}): Promise<AICopilotResponse> {
  const mode = params.mode || 'PLACEMENT_COACH';
  const ai = getAIClient();
  const ctx = params.verifiedContext || {};
  const availableAssessments = ctx.availableAssessments || [];

  const intel = derivePlacementIntelligence(ctx);
  const revCount = (intel.revisionSummary.bookmarkedCount || 0) + (intel.revisionSummary.weakQuestionsCount || 0);

  const intent = detectUserIntent(params.message, params.history);

  // 1. Natural Greeting Behavior
  if (intent === 'CASUAL_GREETING') {
    const firstName = intel.profile.name ? intel.profile.name.split(' ')[0] : '';
    const name = firstName ? ` ${firstName}` : '';
    let targetDesc = '';
    if (intel.profile.targetCompany && intel.profile.targetRole) {
      targetDesc = `You're currently preparing for ${intel.profile.targetRole} at ${intel.profile.targetCompany}. `;
    } else if (intel.profile.targetCompany) {
      targetDesc = `You're currently targeting ${intel.profile.targetCompany}. `;
    }

    const greetingText = (intel.profile.targetCompany || intel.profile.targetRole)
      ? `Hey${name} 👋 Good to see you! ${targetDesc}Want to work on your weak areas, review your latest test, or plan today's prep?`
      : `Hey${name} 👋 What are we working on today? I can help with practice, concepts, tests, or a study plan.`;

    const filteredActions = intel.recommendedActions.filter(a => {
      if (a.actionType === 'OPEN_REVISION' && revCount === 0) return false;
      return true;
    });

    return {
      text: greetingText,
      mode: 'PLACEMENT_COACH',
      actions: filteredActions.slice(0, 2),
    };
  }

  const contextStr = [
    `Candidate Name: ${intel.profile.name}`,
    `Target Company: ${intel.profile.targetCompany || 'NOT SET'}`,
    `Target Role: ${intel.profile.targetRole || 'NOT SET'}`,
    `Lifetime XP: ${intel.progress.lifetimeXp} XP (Level ${intel.progress.level})`,
    `Weekly XP: ${intel.progress.weeklyXp} XP (${intel.progress.leagueTier} League${intel.progress.leagueRank ? `, Rank #${intel.progress.leagueRank}` : ''})`,
    `Official Exams Completed: ${intel.assessmentSummary.totalExamsCompleted}`,
    `Performance Trend: ${intel.performanceTrend}`,
    `Strongest Topic: ${intel.assessmentSummary.strongestTopic || 'Insufficient attempt data'}`,
    `Weakest Topic: ${intel.assessmentSummary.weakestTopic || 'Insufficient attempt data'}`,
    `Critical Weak Topics: ${intel.topicClassifications.critical.join(', ') || 'None identified'}`,
    `Needs Work Topics: ${intel.topicClassifications.needsWork.join(', ') || 'None identified'}`,
    `Strong Topics: ${intel.topicClassifications.strong.join(', ') || 'None identified'}`,
    `Bookmarked Questions: ${intel.revisionSummary.bookmarkedCount}`,
    `Recommended Deterministic Actions: ${JSON.stringify(intel.recommendedActions)}`,
    // Compact format: saves ~400-800 tokens vs full JSON for 17+ assessments
    `Available Assessments: ${availableAssessments.map((a: any) => `${a.id}|${a.title}|${a.category}`).join('; ')}`,
  ].join('\n');

  const historySnippet = Array.isArray(params.history) && params.history.length > 0
    // Trim each history message to 300 chars to cap input token growth on long conversations
    ? `Recent Conversation History:\n${params.history.slice(-6).map((h) => `${h.sender === 'user' ? 'Candidate' : 'FirstRound AI'}: ${h.text.slice(0, 300)}`).join('\n')}\n`
    : '';

  const systemPrompt = `You are FirstRound AI — a conversational placement copilot. Speak naturally like a helpful mentor, NOT like a report generator.

Rules:
1. For casual messages (greetings, small talk), respond casually in 1–3 natural sentences. Do NOT dump stats or metrics.
2. For performance questions, mention only the specific metrics relevant to the question. Do NOT list every stat.
3. For placement/company questions, give focused company-specific guidance.
4. For learning/doubt questions, explain the concept clearly.
5. For study planning, provide a structured but friendly plan.
6. For follow-ups, use the conversation history to maintain context. Do NOT repeat your previous answer.
7. Ask a useful follow-up question when it feels natural — but don't force one every time.
8. NEVER fabricate metrics, company cutoffs, or data not present in the verified context.
9. NEVER use rigid template headers like "Completed Exams:", "Biggest Gap:", "Next Best Action:" unless the candidate explicitly asks for a formal report.
10. Do NOT repeat the candidate's XP, level, league tier, or exam count unless they specifically asked about it.
11. Keep actions relevant. If you suggest an action, it must match the conversation topic. Omit actions for casual/greeting messages unless directly useful.
12. Detected Intent: ${intent}

Return JSON with keys:
{
  "text": "Your conversational response (plain text with minimal markdown — avoid ### headers)",
  "actions": [
    {
      "label": "Short Button Label",
      "actionType": "OPEN_TEST | OPEN_PRACTICE | OPEN_REVISION | OPEN_HISTORY | NAVIGATE_TAB",
      "target": "target_id_or_tab"
    }
  ]
}

Verified Candidate Context:
${contextStr}

${historySnippet}`;

  if (!ai) {
    return getFallbackCopilotResponse(params.message, mode, ctx, intent);
  }

  try {
    const fullPrompt = `${systemPrompt}\n\nCandidate Request: "${params.message}"`;

    const response = await ai.models.generateContent({
      model: 'gemini-flash-lite-latest',
      contents: fullPrompt,
      config: {
        responseMimeType: 'application/json',
        maxOutputTokens: 500,
      },
    });

    const rawText = response.text || '';
    let parsed: any = {};
    try {
      parsed = JSON.parse(rawText);
    } catch (e) {
      parsed = { text: rawText };
    }

    let text = parsed.text || getFallbackCopilotResponse(params.message, mode, ctx).text;

    const rawActions = Array.isArray(parsed.actions) ? parsed.actions : [];
    let validActions = sanitizeActions(rawActions, availableAssessments, revCount);

    if (validActions.length === 0) {
      validActions = intel.recommendedActions.filter(a => {
        if (a.actionType === 'OPEN_REVISION' && revCount === 0) return false;
        return true;
      });
    }

    return {
      text,
      mode,
      actions: validActions,
    };
  } catch (err: any) {
    console.error('Gemini Copilot Error:', err?.message || err);
    return getFallbackCopilotResponse(params.message, mode, ctx);
  }
}

const ALLOWED_ACTION_TYPES = new Set([
  'OPEN_TEST',
  'OPEN_PRACTICE',
  'OPEN_REVISION',
  'OPEN_HISTORY',
  'OPEN_CAREER_TRACK',
  'NAVIGATE_TAB',
]);

const ALLOWED_TABS = new Set(['home', 'tests', 'explore', 'vault', 'revision', 'leaderboard', 'career', 'admin']);

function sanitizeActions(
  actions: any[],
  availableAssessments: any[],
  revisionCount: number = 0
): AIRecommendedAction[] {
  const validTestIds = new Set(availableAssessments.map((a) => a.id));

  return actions
    .filter((act) => act && typeof act === 'object')
    .filter((act) => ALLOWED_ACTION_TYPES.has(act.actionType))
    .filter((act) => {
      const type = act.actionType;
      const target = act.target || act.payload;
      if (!target || typeof target !== 'string') return false;

      // Rule 9: Never show revision action if revision count is 0
      if (type === 'OPEN_REVISION') {
        if (revisionCount === 0 || (act.label && act.label.includes('0 items'))) {
          return false;
        }
      }

      if (type === 'OPEN_TEST' || type === 'OPEN_PRACTICE') {
        return validTestIds.has(target) || target.startsWith('cat_') || target.startsWith('test_');
      }
      if (type === 'NAVIGATE_TAB') {
        return ALLOWED_TABS.has(target);
      }
      return true;
    })
    .map((act) => ({
      label: String(act.label || 'View Recommendation')
        .replace(/\s*\(\s*0\s*items?\s*\)/gi, '')
        .substring(0, 50),
      actionType: act.actionType as any,
      payload: act.target || act.payload,
    }));
}

function getFallbackCopilotResponse(
  message: string,
  mode: AICopilotMode,
  ctx: any,
  intent?: UserIntent
): AICopilotResponse {
  const intel = derivePlacementIntelligence(ctx);
  const profile = intel.profile;
  const revCount = (intel.revisionSummary.bookmarkedCount || 0) + (intel.revisionSummary.weakQuestionsCount || 0);

  const filterActions = (actions: AIRecommendedAction[]) =>
    actions.filter(a => {
      if (a.actionType === 'OPEN_REVISION' && revCount === 0) return false;
      if (a.label && /\(\s*0\s*items?\s*\)/i.test(a.label)) return false;
      return true;
    });

  const name = profile.name || '';
  const firstName = name.split(' ')[0] || '';

  if (intent === 'CASUAL_GREETING') {
    const greetingText = firstName
      ? `Hey ${firstName} 👋 Good to see you. What are we working on today?`
      : `Hey 👋 What are we working on today? I can help with practice, concepts, tests, or a study plan.`;

    return {
      text: greetingText,
      mode: 'PLACEMENT_COACH',
      actions: filterActions(intel.recommendedActions).slice(0, 2),
    };
  }

  if (intent === 'GENERAL_CONVERSATION') {
    return {
      text: firstName
        ? `Sure ${firstName}, I'm here to help! You can ask me about your performance, get a study plan, prepare for a company, or learn a concept. What would you like to do?`
        : `I'm here to help! You can ask me about your performance, get a study plan, prepare for a company, or learn a concept. What's on your mind?`,
      mode: 'PLACEMENT_COACH',
      actions: filterActions(intel.recommendedActions).slice(0, 2),
    };
  }

  if (intent === 'FOLLOW_UP') {
    return {
      text: `Could you tell me a bit more about what you'd like help with? I can assist with performance analysis, test prep, study planning, or explaining concepts.`,
      mode: 'PLACEMENT_COACH',
      actions: filterActions(intel.recommendedActions).slice(0, 2),
    };
  }

  if (intent === 'NEXT_ACTION') {
    const gap = intel.topicClassifications.critical[0] || intel.topicClassifications.needsWork[0];
    if (gap) {
      return {
        text: `${firstName ? firstName + ', your' : 'Your'} biggest gap right now is ${gap}. I'd suggest doing a focused practice session on that before your next mock. Want me to set one up?`,
        mode: 'PLACEMENT_COACH',
        actions: filterActions(intel.recommendedActions).slice(0, 2),
      };
    }
    return {
      text: `${firstName ? firstName + ', you\'re' : 'You\'re'} in good shape! I'd recommend taking another full mock to keep your momentum going. Which company are you targeting?`,
      mode: 'PLACEMENT_COACH',
      actions: filterActions(intel.recommendedActions).slice(0, 2),
    };
  }

  const target = profile.targetCompany ? `for ${profile.targetCompany}` : 'for your target drive';

  switch (mode) {
    case 'PLACEMENT_COACH': {
      if (!profile.targetCompany || !profile.targetRole) {
        return {
          text: `To give you the best guidance, I need to know your target company and role. Set them in your profile and I'll tailor everything — mock tests, study plans, and gap analysis — specifically for your drive.`,
          mode,
          actions: filterActions(intel.recommendedActions),
        };
      }

      const gap = intel.topicClassifications.critical[0] || intel.topicClassifications.needsWork[0] || 'Full Mock Practice';
      return {
        text: `You're preparing for ${profile.targetRole} at ${profile.targetCompany}. Your biggest focus area right now is ${gap} — I'd recommend some targeted practice there before your next company mock.`,
        mode,
        actions: filterActions(intel.recommendedActions),
      };
    }
    case 'PERFORMANCE_COACH': {
      const strongest = intel.assessmentSummary.strongestTopic;
      const weakest = intel.assessmentSummary.weakestTopic;
      if (!strongest && !weakest) {
        return {
          text: `You haven't completed any official exams yet, so I don't have performance data to analyze. Take a baseline assessment first and I'll give you a detailed breakdown!`,
          mode,
          actions: filterActions(intel.recommendedActions),
        };
      }
      return {
        text: `Your performance trend is ${intel.performanceTrend.toLowerCase().replace('_', ' ')}. ${strongest ? `You're strongest in ${strongest}` : ''}${weakest ? ` and need the most work on ${weakest}` : ''}. Want me to create a targeted drill for your weak areas?`,
        mode,
        actions: filterActions(intel.recommendedActions),
      };
    }
    case 'LEARNING_ASSISTANT': {
      return {
        text: `I'd be happy to explain that! For placement aptitude, the key is breaking problems into smaller parts and using elimination tricks for timed rounds. What specific topic or concept would you like me to cover?`,
        mode,
        actions: filterActions(intel.recommendedActions),
      };
    }
    case 'STUDY_PLANNER': {
      const weakTopic = intel.topicClassifications.critical[0] || intel.topicClassifications.needsWork[0] || 'Quantitative Aptitude';
      return {
        text: `Here's a quick 7-day plan ${target}:\n\n- Days 1–2: Focused ${weakTopic} drills\n- Days 3–4: Logical reasoning & puzzles\n- Days 5–6: Full-length company mock test\n- Day 7: Revision and error analysis\n\nWant me to customize this further based on your performance data?`,
        mode,
        actions: filterActions(intel.recommendedActions),
      };
    }
    default:
      return {
        text: `I'm FirstRound AI, your placement copilot! I'm here to help you navigate assessment prep, analyze scores, and build your study routine.`,
        mode,
        actions: filterActions(intel.recommendedActions),
      };
  }
}

export async function askAIDoubt(params: {
  question: Question;
  userSelectedOption?: string | null;
  studentQuestion?: string;
}): Promise<AIDoubtResponse> {
  const { question, userSelectedOption, studentQuestion } = params;
  const ai = getAIClient();

  if (!ai) {
    // High-quality fallback explanation if API key is not configured
    return {
      answer: `The correct option is (${question.correctOption}). ${question.explanation}`,
      stepByStepSolution: [
        'Identify the given parameters and target variable.',
        'Apply the standard placement formula or logical relationship.',
        `Compute the result to match option (${question.correctOption}).`,
      ],
      keyFormulaOrConcept: question.shortcutFormula || 'Standard Aptitude Formula & Logic Rules',
      shortcutTrick: 'Eliminate options with incompatible parity, units, or boundary conditions before calculating.',
      commonTrapToAvoid: 'Watch out for mixed units (e.g. km/h vs m/s or days vs hours) and negative signs.',
    };
  }

  try {
    const prompt = `You are FirstRound's expert campus placement aptitude tutor for top IT firms (TCS, Infosys, Wipro, Accenture, Cognizant).
Break down this question in an encouraging, crisp, structured format for placement students.

Question:
${question.questionText}
${question.codeSnippet ? `Code:\n${question.codeSnippet}\n` : ''}

Options:
${question.options.map((o) => `(${o.id}) ${o.text}`).join('\n')}

Correct Option: (${question.correctOption})
${userSelectedOption ? `Student selected: (${userSelectedOption})` : ''}
${studentQuestion ? `Student's specific doubt: "${studentQuestion}"` : ''}
Original Explanation:
${question.explanation}

Respond in strict JSON with these keys:
{
  "answer": "Clear summary of why option ${question.correctOption} is correct",
  "stepByStepSolution": ["Step 1 explanation", "Step 2 explanation", "Step 3 explanation"],
  "keyFormulaOrConcept": "Key formula or rule used",
  "shortcutTrick": "10-second speed math shortcut or elimination trick for exam",
  "commonTrapToAvoid": "The exact mistake candidates make in this problem"
}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-flash-lite-latest',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        maxOutputTokens: 500,
      },
    });

    const text = response.text;
    if (text) {
      const parsed = JSON.parse(text);
      return {
        answer: parsed.answer || `Correct Option is (${question.correctOption})`,
        stepByStepSolution: Array.isArray(parsed.stepByStepSolution) ? parsed.stepByStepSolution : [question.explanation],
        keyFormulaOrConcept: parsed.keyFormulaOrConcept || question.shortcutFormula || 'Key Placement Concept',
        shortcutTrick: parsed.shortcutTrick || 'Use option elimination and units check.',
        commonTrapToAvoid: parsed.commonTrapToAvoid || 'Be careful of unit conversions.',
      };
    }
  } catch (error) {
    console.error('Error generating AI doubt answer:', error);
  }

  return {
    answer: `The correct option is (${question.correctOption}). ${question.explanation}`,
    stepByStepSolution: [
      'Understand the problem statement and given values.',
      'Apply formula / deduction step-by-step.',
      `Verify result matches option (${question.correctOption}).`,
    ],
    keyFormulaOrConcept: question.shortcutFormula || 'Placement Aptitude Core Principle',
    shortcutTrick: 'Look for symmetry or plug in simple numbers (0, 1, 100) to check options fast.',
    commonTrapToAvoid: 'Misinterpreting the question condition.',
  };
}

export async function generateAITestSeries(params: {
  topicOrCompany: string;
  category: string;
  difficulty: string;
  numQuestions: number;
}): Promise<{ test: Omit<TestSeries, 'id' | 'attemptsCount'>; questions: Omit<Question, 'id' | 'testSeriesId'>[] }> {
  const { topicOrCompany, category, difficulty, numQuestions } = params;
  const ai = getAIClient();

  if (!ai) {
    // Return sample seeded test if AI key not present
    return {
      test: {
        title: `${topicOrCompany} Placement Sprint (${category})`,
        description: `High-frequency placement questions on ${topicOrCompany} calibrated for campus hiring rounds.`,
        companyName: topicOrCompany,
        category: category as any,
        difficulty: difficulty as any,
        durationMinutes: Math.max(10, numQuestions * 2.5),
        totalQuestions: numQuestions,
        passingPercentage: 65,
        tags: [topicOrCompany, category, 'AI Generated', 'Campus Prep'],
      },
      questions: [
        {
          questionText: `If 12 men can complete a project in 20 days working 8 hours a day, how many days will 16 men take to complete the same project working 6 hours a day?`,
          options: [
            { id: 'A', text: '20 days' },
            { id: 'B', text: '24 days' },
            { id: 'C', text: '18 days' },
            { id: 'D', text: '16 days' },
          ],
          correctOption: 'A',
          topic: 'Time and Work',
          subTopic: 'Man-Days-Hours Formula',
          difficulty: 'Medium',
          companyTag: topicOrCompany,
          yearTag: '2025 Mock',
          explanation: 'Using M1*D1*H1 = M2*D2*H2 => 12*20*8 = 16*D2*6 => 1920 = 96*D2 => D2 = 20 days.',
          shortcutFormula: 'M1*D1*H1 / W1 = M2*D2*H2 / W2',
        },
      ],
    };
  }

  const prompt = `You are a Senior Placement Test Architect for TCS NQT, Infosys, Wipro NLTH, and Accenture.
Create a high-quality ${numQuestions}-question Aptitude Mock Test on: "${topicOrCompany}"
Category: ${category}
Difficulty: ${difficulty}

Respond in strict JSON with the following structure:
{
  "test": {
    "title": "Title of the test series",
    "description": "Short 1-2 sentence description",
    "companyName": "${topicOrCompany}",
    "category": "${category}",
    "difficulty": "${difficulty}",
    "durationMinutes": ${Math.max(10, numQuestions * 2)},
    "totalQuestions": ${numQuestions},
    "passingPercentage": 65,
    "tags": ["${topicOrCompany}", "${category}", "PYQ 2025"]
  },
  "questions": [
    {
      "questionText": "Clear problem statement",
      "options": [
        {"id": "A", "text": "Option A"},
        {"id": "B", "text": "Option B"},
        {"id": "C", "text": "Option C"},
        {"id": "D", "text": "Option D"}
      ],
      "correctOption": "A",
      "topic": "${category}",
      "subTopic": "Specific sub-topic",
      "difficulty": "${difficulty}",
      "companyTag": "${topicOrCompany}",
      "yearTag": "2025 PYQ",
      "explanation": "Detailed step-by-step solution showing mathematical/logical working",
      "shortcutFormula": "Exam shortcut or formula"
    }
  ]
}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-flash-lite-latest',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        maxOutputTokens: 1200,
      },
    });

    let text = response.text;
    if (text) {
      try {
        const parsed = JSON.parse(text);
        return parsed;
      } catch (e) {
        const cleaned = text
          .replace(/\\([^"\\\/bfnrtu])/g, '$1')
          .replace(/[\u0000-\u001F]+/g, ' ');
        const parsed = JSON.parse(cleaned);
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to generate AI test:', err);
  }

  // Fallback
  return {
    test: {
      title: `${topicOrCompany} Practice Challenge`,
      description: `Comprehensive mock test on ${topicOrCompany}.`,
      companyName: topicOrCompany,
      category: category as any,
      difficulty: difficulty as any,
      durationMinutes: numQuestions * 2,
      totalQuestions: numQuestions,
      passingPercentage: 65,
      tags: [topicOrCompany, category],
    },
    questions: [],
  };
}

export interface DeepAIHelpResponse {
  explanation: string;
  hints: string[];
  stepByStep: string[];
  conceptualBreakdown?: string;
  modelUsed: string;
}

export async function askDeepAIHelp(params: {
  question: Question;
  userSelectedOption?: string | null;
  studentQuestion?: string;
  currentStep?: number;
  requestType?: 'hint' | 'solution' | 'chat';
}): Promise<DeepAIHelpResponse> {
  const { question, userSelectedOption, studentQuestion, currentStep = 1, requestType } = params;
  const ai = getAIClient();

  if (!ai) {
    return {
      explanation: `Detailed conceptual breakdown for question: ${question.questionText}\n\nCorrect answer is (${question.correctOption}). ${question.explanation}`,
      hints: [
        'Break down the core mathematical or algorithmic relationship.',
        'Eliminate options that contradict invariant bounds.',
        question.shortcutFormula ? `Remember: ${question.shortcutFormula}` : 'Verify intermediate calculations carefully.'
      ],
      stepByStep: [
        'Understand the initial conditions and domain constraints.',
        'Formulate the governing algebraic / logical relation.',
        'Execute the substitution or state transitions step-by-step.',
        `Confirm that the final derived value aligns with option (${question.correctOption}).`
      ],
      conceptualBreakdown: `Topic: ${question.topic || 'General Aptitude'} | Difficulty: ${question.difficulty || 'Medium'} | Method: Analytical placement-level deduction.`,
      modelUsed: 'firstround-deep-ai-v1-structured',
    };
  }

  try {
    let modeGuidance = "Your goal is to guide the student through deep conceptual understanding, step-by-step reasoning, and diagnostic hints for this campus placement question.";
    if (requestType === 'hint') {
      modeGuidance = "CRITICAL INSTRUCTION FOR HINT MODE: The student requested a SOCRATIC HINT. Provide ONLY a concise diagnostic clue or conceptual setup to help them think. DO NOT reveal the correct option choice, final answer, or complete calculation result in your hint!";
    } else if (requestType === 'solution') {
      modeGuidance = "The student explicitly requested the FULL STEP-BY-STEP SOLUTION. Provide a complete, clear breakdown of the approach, steps, and final verification leading to option (" + question.correctOption + ").";
    } else if (requestType === 'chat' && studentQuestion) {
      modeGuidance = `The student asked a follow-up query: "${studentQuestion}". Answer concisely and Socratically to guide their understanding of this question.`;
    }

    const optionsArray = Array.isArray(question.options)
      ? question.options
      : typeof question.options === 'string'
      ? (() => { try { return JSON.parse(question.options); } catch { return []; } })()
      : [];

    const prompt = `You are FirstRound's Premium Deep AI Socratic Tutor.
${modeGuidance}

Question:
${question.questionText}
${question.codeSnippet ? `Code:\n${question.codeSnippet}\n` : ''}

Options:
${optionsArray.map((o: any) => `(${o.id}) ${o.text}`).join('\n')}

Correct Option: (${question.correctOption})
${userSelectedOption ? `Candidate's selection: (${userSelectedOption})` : ''}
${studentQuestion ? `Student query: "${studentQuestion}"` : ''}
Current guidance step requested: ${currentStep}

Respond in strict JSON with these keys:
{
  "explanation": "Thorough, clear deep explanation of the underlying concepts",
  "hints": ["Hint 1: Conceptual nudge", "Hint 2: Mathematical / logic setup", "Hint 3: Verification clue"],
  "stepByStep": ["Step 1 explanation", "Step 2 explanation", "Step 3 explanation", "Step 4 verification"],
  "conceptualBreakdown": "Deep analysis of why distractor options fail and how this pattern appears in campus placements"
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-flash-lite-latest',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        maxOutputTokens: 800,
      },
    });

    const text = response.text;
    if (text) {
      const parsed = JSON.parse(text);
      return {
        explanation: parsed.explanation || question.explanation,
        hints: Array.isArray(parsed.hints) ? parsed.hints : ['Review problem constraints carefully.'],
        stepByStep: Array.isArray(parsed.stepByStep) ? parsed.stepByStep : [question.explanation],
        conceptualBreakdown: parsed.conceptualBreakdown,
        modelUsed: 'gemini-flash-lite-latest',
      };
    }
  } catch (err) {
    console.error('Error generating Deep AI Help:', err);
  }

  return {
    explanation: `Deep AI Analysis: Correct Option is (${question.correctOption}). ${question.explanation}`,
    hints: [
      'Focus on the invariant properties in the problem.',
      'Check for boundary conditions and scale factors.'
    ],
    stepByStep: [
      'Parse the premise and extract variables.',
      'Apply formula or deductive steps systematically.',
      `Verify match with (${question.correctOption}).`
    ],
    conceptualBreakdown: `Topic: ${question.topic || 'Aptitude'} | Target Pattern: Campus Recruitment Assessments.`,
    modelUsed: 'firstround-deep-ai-v1-fallback',
  };
}

const FORBIDDEN_GENERIC_PATTERNS = [
  /focus on the core concept/i,
  /identify the core concept/i,
  /identify the key concept/i,
  /identify the core formula/i,
  /think carefully/i,
  /consider the underlying principle/i,
  /focus on the underlying/i,
  /governing .* before evaluating/i,
  /before comparing options/i,
  /before evaluating the choices/i,
  /concept governing/i,
  /evaluate choices carefully/i,
  /read the question carefully/i,
  /analyze the choices carefully/i,
];

export function validateAiHint(hint: string | null | undefined, question?: Question): boolean {
  if (!hint || typeof hint !== 'string') return false;
  const trimmed = hint.trim();
  if (trimmed.length < 20 || trimmed.length > 320) return false;

  for (const pattern of FORBIDDEN_GENERIC_PATTERNS) {
    if (pattern.test(trimmed)) {
      return false;
    }
  }

  if (question) {
    if (question.questionText && trimmed.toLowerCase().includes(question.questionText.trim().toLowerCase())) {
      return false;
    }
    if (/option\s*\([A-D]\)/i.test(trimmed) || /option\s+[A-D]\s+is/i.test(trimmed) || /choice\s+[A-D]\s+is/i.test(trimmed)) {
      return false;
    }
  }

  return true;
}

export function getQuestionAwareFallbackHint(question: Question): string {
  if (question.hint && validateAiHint(question.hint, question)) {
    return question.hint.trim();
  }
  if (question.shortcutFormula && validateAiHint(question.shortcutFormula, question)) {
    return question.shortcutFormula.trim();
  }

  const cleanQ = (question.questionText || '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = cleanQ.split(' ').filter((w) => w.length > 3);
  const keywords = words.slice(0, 5).join(' ');

  const topicName = question.topic || 'problem';
  const subtopicName = question.subtopic || question.subTopic || '';

  if (subtopicName) {
    return `For this ${topicName} question on ${subtopicName}, analyze how ${keywords || 'the stated parameters'} interact.`;
  }
  return `For this ${topicName} question, analyze how ${keywords || 'the given operational rules'} determine the outcome.`;
}

export async function generateQuestionAiHint(question: Question, userSelectedOption?: string | null): Promise<string> {
  const ai = getAIClient();

  if (!ai) {
    return getQuestionAwareFallbackHint(question);
  }

  const optionsText = (question.options || []).map((o) => `(${o.id}) ${o.text}`).join('\n');
  const selectedText = userSelectedOption ? `Candidate's Incorrect Selection: Option (${userSelectedOption})` : '';

  const prompt = `You are FirstRound's AI Tutor for placement preparation.
Create a hint specifically about THIS question and its tested concept. Mention the relevant concept, operation, relationship, formula, rule, or reasoning direction from the question.

CONTEXT:
Question: ${question.questionText}
${question.codeSnippet ? `Code Snippet:\n${question.codeSnippet}\n` : ''}
Options:
${optionsText}
Topic: ${question.topic || 'Aptitude'} | Subtopic: ${question.subtopic || question.subTopic || ''} | Difficulty: ${question.difficulty || 'Medium'} | Question Type: ${question.questionType || 'MCQ'}
${question.explanation ? `Internal Explanation Reference: ${question.explanation}\n` : ''}
${question.correctAnswer ? `Internal Correct Answer Reference (DO NOT REVEAL THIS): Option (${question.correctAnswer})\n` : ''}
${selectedText}

CRITICAL RULES FOR HINT GENERATION:
1. Write a short 1-2 sentence conceptual hint specific to THIS question.
2. Direct the candidate to think about the key mechanism, rule, formula, or relationship in this specific problem (e.g. for SQL CASCADE, mention parent-child deletion behavior; for time & work, mention cycle work efficiency).
3. DO NOT use generic filler like "Focus on the core concept", "Identify the key concept", "Think carefully", or "Consider the underlying principle".
4. NEVER reveal the correct answer, option letter (e.g. Option B), final numerical result, or complete step-by-step solution.
5. ${selectedText ? `Address why option (${userSelectedOption}) is a common misconception without revealing the right choice.` : ''}

Respond STRICTLY in JSON format:
{
  "hint": "1-2 sentence question-specific conceptual hint"
}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-flash-lite-latest',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        maxOutputTokens: 250,
      },
    });

    const text = response.text;
    if (text) {
      const parsed = JSON.parse(text);
      if (parsed.hint && typeof parsed.hint === 'string' && validateAiHint(parsed.hint, question)) {
        return parsed.hint.trim();
      }
    }
  } catch (err) {
    console.error('Error generating AI hint:', err);
  }

  // Retry once with stricter prompt if initial attempt failed validation
  try {
    const retryResponse = await ai.models.generateContent({
      model: 'gemini-flash-lite-latest',
      contents: `The previous hint was rejected as generic. Write a SPECIFIC hint for this problem:\n\n${prompt}`,
      config: {
        responseMimeType: 'application/json',
        maxOutputTokens: 250,
      },
    });

    const retryText = retryResponse.text;
    if (retryText) {
      const parsed = JSON.parse(retryText);
      if (parsed.hint && typeof parsed.hint === 'string' && validateAiHint(parsed.hint, question)) {
        return parsed.hint.trim();
      }
    }
  } catch (e) {}

  return getQuestionAwareFallbackHint(question);
}

/**
 * AI Completion & Validation of Incomplete Questions
 * Fills missing options (ensuring exactly 4), correct answer, explanation, and classification.
 * Flags unrecoverable questions for admin review.
 */
export async function completeAndValidateIncompleteQuestion(rawQuestion: any): Promise<{
  question: any;
  needsReview: boolean;
  reviewReason?: string;
  aiCompleted: boolean;
}> {
  const ai = getAIClient();
  const qText = rawQuestion.questionText || rawQuestion.question || rawQuestion.text || '';
  
  if (!qText.trim()) {
    return {
      question: {
        questionText: 'Corrupted or Empty Question',
        options: [
          { id: 'A', text: 'Option A' },
          { id: 'B', text: 'Option B' },
          { id: 'C', text: 'Option C' },
          { id: 'D', text: 'Option D' },
        ],
        correctOption: 'A',
        topic: 'General',
        subTopic: 'General',
        difficulty: 'Medium',
        explanation: 'Question text was empty or corrupted during import.',
      },
      needsReview: true,
      reviewReason: 'Question text was empty or corrupted in imported file.',
      aiCompleted: false,
    };
  }

  // Check if question is already complete
  const options = Array.isArray(rawQuestion.options) ? rawQuestion.options : [];
  const has4Options = options.length === 4 && options.every((o: any) => o && (o.text || typeof o === 'string'));
  const hasCorrectAnswer = !!rawQuestion.correctOption && ['A', 'B', 'C', 'D'].includes(String(rawQuestion.correctOption).toUpperCase());
  const hasExplanation = !!rawQuestion.explanation && String(rawQuestion.explanation).trim().length > 5;
  const hasTopic = !!rawQuestion.topic;

  if (has4Options && hasCorrectAnswer && hasExplanation && hasTopic) {
    const formattedOpts = options.map((o: any, idx: number) => {
      const id = String.fromCharCode(65 + idx);
      const text = typeof o === 'string' ? o : o.text || o.option || '';
      return { id, text };
    });
    return {
      question: {
        ...rawQuestion,
        questionText: qText.trim(),
        options: formattedOpts,
        correctOption: String(rawQuestion.correctOption).toUpperCase(),
        topic: rawQuestion.topic || 'Quantitative',
        subTopic: rawQuestion.subTopic || 'General',
        difficulty: rawQuestion.difficulty || 'Medium',
        explanation: rawQuestion.explanation.trim(),
      },
      needsReview: false,
      aiCompleted: false,
    };
  }

  if (!ai) {
    // Fallback completion when AI key not configured
    const normalizedOptions = [
      { id: 'A', text: options[0]?.text || options[0] || 'Correct Option' },
      { id: 'B', text: options[1]?.text || options[1] || 'Distractor Option 1' },
      { id: 'C', text: options[2]?.text || options[2] || 'Distractor Option 2' },
      { id: 'D', text: options[3]?.text || options[3] || 'Distractor Option 3' },
    ];
    return {
      question: {
        ...rawQuestion,
        questionText: qText.trim(),
        options: normalizedOptions,
        correctOption: rawQuestion.correctOption ? String(rawQuestion.correctOption).toUpperCase() : 'A',
        topic: rawQuestion.topic || 'General',
        subTopic: rawQuestion.subTopic || 'General',
        difficulty: rawQuestion.difficulty || 'Medium',
        explanation: rawQuestion.explanation || 'Solution generated from available problem statements.',
      },
      needsReview: !has4Options || !hasCorrectAnswer,
      reviewReason: !hasCorrectAnswer ? 'Correct answer was missing; set to Option A by default.' : 'Options were auto-generated.',
      aiCompleted: true,
    };
  }

  const prompt = `You are a Senior Placement Test Architect for FirstRound.
Analyze and complete this test question for a placement exam:
Question Input: ${JSON.stringify(rawQuestion)}

Your Goal:
1. Ensure questionText is clear, precise, and complete.
2. Provide EXACTLY 4 distinct, plausible, relevant, and non-duplicate options (A, B, C, D).
3. Validate and determine the exact correctOption ('A', 'B', 'C', or 'D').
4. Provide a clear, step-by-step explanation for the correct answer.
5. Classify topic, subTopic, and difficulty ('Easy', 'Medium', 'Hard').
6. If the input question is corrupted, unanswerable, or impossible to reconstruct confidently, set "needsReview": true and explain why in "reviewReason".

Respond in strict JSON with schema:
{
  "questionText": "Problem statement",
  "options": [
    {"id": "A", "text": "Option A text"},
    {"id": "B", "text": "Option B text"},
    {"id": "C", "text": "Option C text"},
    {"id": "D", "text": "Option D text"}
  ],
  "correctOption": "A",
  "topic": "Quantitative",
  "subTopic": "Topic Name",
  "difficulty": "Medium",
  "explanation": "Step-by-step solution",
  "needsReview": false,
  "reviewReason": ""
}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-flash-lite-latest',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        maxOutputTokens: 650,
      },
    });

    const text = response.text;
    if (text) {
      const parsed = JSON.parse(text);
      if (parsed.options && parsed.options.length === 4 && parsed.correctOption) {
        return {
          question: {
            ...rawQuestion,
            questionText: parsed.questionText || qText,
            options: parsed.options,
            correctOption: String(parsed.correctOption).toUpperCase(),
            topic: parsed.topic || rawQuestion.topic || 'Quantitative',
            subTopic: parsed.subTopic || rawQuestion.subTopic || 'General',
            difficulty: parsed.difficulty || rawQuestion.difficulty || 'Medium',
            explanation: parsed.explanation || 'Step-by-step solution.',
          },
          needsReview: !!parsed.needsReview,
          reviewReason: parsed.reviewReason || undefined,
          aiCompleted: true,
        };
      }
    }
  } catch (err) {
    console.error('AI question completion error:', err);
  }

  return {
    question: {
      ...rawQuestion,
      questionText: qText,
      options: [
        { id: 'A', text: options[0]?.text || options[0] || 'Option A' },
        { id: 'B', text: options[1]?.text || options[1] || 'Option B' },
        { id: 'C', text: options[2]?.text || options[2] || 'Option C' },
        { id: 'D', text: options[3]?.text || options[3] || 'Option D' },
      ],
      correctOption: 'A',
      topic: rawQuestion.topic || 'General',
      subTopic: 'General',
      difficulty: 'Medium',
      explanation: 'Extracted question requiring admin review.',
    },
    needsReview: true,
    reviewReason: 'AI processing timeout; please review options and correct answer.',
    aiCompleted: false,
  };
}

/**
 * Parses and normalizes uploaded documents (CSV, JSON, PDF text) into standard FirstRound questions.
 */
export async function parseAndNormalizeImportedDocument(
  contentString: string,
  format: 'csv' | 'json' | 'pdf'
): Promise<any[]> {
  // 1. JSON handling
  if (format === 'json') {
    try {
      const parsed = JSON.parse(contentString);
      const items = Array.isArray(parsed) ? parsed : parsed.questions || parsed.data || [parsed];
      return items;
    } catch (e) {
      console.warn('JSON direct parse failed, falling back to AI extraction:', e);
    }
  }

  // 2. CSV handling
  if (format === 'csv') {
    const lines = contentString.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length > 1) {
      const header = lines[0].toLowerCase();
      if (header.includes('question') || header.includes('option')) {
        const rows: any[] = [];
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map((p) => p.replace(/^"|"$/g, '').trim());
          if (parts.length >= 2) {
            rows.push({
              questionText: parts[0],
              options: parts.slice(1, 5).map((t, idx) => ({ id: String.fromCharCode(65 + idx), text: t || `Option ${String.fromCharCode(65 + idx)}` })),
              correctOption: (parts[5] || 'A').toUpperCase().charAt(0),
              explanation: parts[6] || '',
              topic: parts[7] || 'General',
            });
          }
        }
        if (rows.length > 0) return rows;
      }
    }
  }

  // 3. AI extraction for unstructured text, complex CSV, or PDF content
  const ai = getAIClient();
  if (!ai) {
    return [
      {
        questionText: 'Imported Question 1',
        options: [
          { id: 'A', text: 'Option A' },
          { id: 'B', text: 'Option B' },
          { id: 'C', text: 'Option C' },
          { id: 'D', text: 'Option D' },
        ],
        correctOption: 'A',
        explanation: 'Parsed from imported document.',
        topic: 'Quantitative',
        difficulty: 'Medium',
      },
    ];
  }

  const prompt = `You are a Senior Exam Content Parser for FirstRound placement portal.
Extract all test questions from the following imported ${format.toUpperCase()} document content.

Document Content:
"""
${contentString.slice(0, 10000)}
"""

Extract as many valid questions as possible.
Return a strict JSON array of objects with the structure:
[
  {
    "questionText": "Clear problem statement",
    "options": [
      {"id": "A", "text": "Option A"},
      {"id": "B", "text": "Option B"},
      {"id": "C", "text": "Option C"},
      {"id": "D", "text": "Option D"}
    ],
    "correctOption": "A",
    "topic": "Quantitative",
    "subTopic": "Topic Name",
    "difficulty": "Medium",
    "explanation": "Explanation for answer"
  }
]`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-flash-lite-latest',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        maxOutputTokens: 2500,
      },
    });

    const text = response.text;
    if (text) {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed;
      if (parsed.questions && Array.isArray(parsed.questions)) return parsed.questions;
    }
  } catch (err) {
    console.error('Failed to extract questions from document:', err);
  }

  return [];
}

export function validateAINotificationOutput(parsed: any): { valid: boolean; title?: string; message?: string } {
  if (!parsed || typeof parsed !== 'object') return { valid: false };
  const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
  const message = typeof parsed.message === 'string' ? parsed.message.trim() : '';

  if (!title || !message) return { valid: false };
  if (title.length > 60) return { valid: false };
  if (message.length > 220) return { valid: false };

  // Emoji count check: maximum 2 emojis allowed across title and message
  const combined = `${title} ${message}`;
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]/gu;
  const emojis = combined.match(emojiRegex) || [];
  if (emojis.length > 2) {
    return { valid: false };
  }

  return { valid: true, title, message };
}

export async function generateAIPurchaseNotification(
  context: {
    productType: string;
    productName: string;
    quantity?: number;
    plan?: string;
    userFirstName?: string;
  }
): Promise<{ title: string; message: string }> {
  // Inline fallback helper to ensure zero circular dependency issues
  const normType = (context.productType || '').toUpperCase();
  const normPlan = (context.plan || '').toUpperCase();

  let fallback = {
    title: 'Purchase Successful 🎉',
    message: 'Your order on FirstRound was successful. Thanks for choosing FirstRound — happy learning! 💛',
  };

  if (normType === 'AI_CREDIT_PACK') {
    fallback = {
      title: 'AI Credits Added ✨',
      message: 'Your purchased AI Credits are now in your wallet. Thanks for choosing FirstRound — happy learning! 💛',
    };
  } else if (normType === 'ASSESSMENT') {
    fallback = {
      title: 'Assessment Unlocked 🎯',
      message: 'Your purchased assessment is now unlocked. Take the challenge, learn from every question, and keep moving forward! 🚀',
    };
  } else if (normType === 'SUBSCRIPTION' || normType === 'PREMIUM') {
    if (normPlan === 'PRO') {
      fallback = {
        title: 'FirstRound Pro Activated 🚀',
        message: 'Your FirstRound Pro subscription is now active. Your full FirstRound experience is ready — let\'s get started! 💙',
      };
    } else {
      fallback = {
        title: 'FirstRound Plus Activated 👑',
        message: 'Your FirstRound Plus subscription is now active. Thanks for being part of FirstRound — enjoy the journey! 💛',
      };
    }
  }

  const ai = getAIClient();
  if (!ai) {
    return fallback;
  }

  try {
    const systemPrompt = `You write short FirstRound purchase appreciation notifications for students. Be warm, concise, encouraging, and natural. Never invent facts. Only mention the supplied product information. Do not mention internal IDs, payment IDs, balances, prices, private information, or technical details. Return JSON with title and message only.

Strict output requirements:
- JSON with title and message fields only.
- title must be maximum 60 characters.
- message must be maximum 220 characters.
- Maximum 2 emojis total across title and message.`;

    const promptText = `${systemPrompt}\n\nProduct Context:\n${JSON.stringify(context, null, 2)}`;

    const aiPromise = ai.models.generateContent({
      model: 'gemini-flash-lite-latest',
      contents: promptText,
      config: {
        responseMimeType: 'application/json',
        maxOutputTokens: 300,
      },
    });

    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));

    const response = await Promise.race([aiPromise, timeoutPromise]);
    if (!response || !response.text) {
      return fallback;
    }

    let parsed: any = null;
    try {
      parsed = JSON.parse(response.text);
    } catch (e) {
      return fallback;
    }

    const validation = validateAINotificationOutput(parsed);
    if (!validation.valid || !validation.title || !validation.message) {
      return fallback;
    }

    return { title: validation.title, message: validation.message };
  } catch (err) {
    console.warn('[AI Purchase Notification Warning] Falling back to deterministic notification:', err);
    return fallback;
  }
}




