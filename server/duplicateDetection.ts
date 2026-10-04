/**
 * FIRSTROUND — CANONICAL QUESTION DUPLICATE DETECTION ENGINE
 * ==========================================================
 * Performs text normalization, exact match detection, near-duplicate detection
 * using Jaccard word-token overlap and Levenshtein similarity.
 */

export interface QuestionMatch {
  existingQuestionId: string;
  questionText: string;
  similarityScore: number; // 0 to 100
  matchType: 'EXACT' | 'NEAR';
  reason: string;
  existingOptions?: any[];
  correctOption?: string;
  usageCount: number;
  assessmentsUsedIn: string[];
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  matchType: 'EXACT' | 'NEAR' | 'NONE';
  highestSimilarityScore: number;
  matches: QuestionMatch[];
}

/**
 * Normalizes question text for robust comparison.
 * Lowercases, removes HTML tags, removes punctuation except basic operators (+ - * / =), collapses whitespace.
 */
export function normalizeQuestionText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, '') // remove HTML
    .replace(/[^a-z0-9\s+\-*\/=]/g, ' ') // keep alphanumerics and basic operators
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tokenizes text into unique words for Jaccard similarity computation.
 */
function getWordTokens(text: string): Set<string> {
  const normalized = normalizeQuestionText(text);
  const words = normalized.split(/\s+/).filter((w) => w.length > 1);
  return new Set(words);
}

/**
 * Calculates Jaccard Similarity Coefficient between two text strings (0.0 to 1.0).
 */
export function calculateJaccardSimilarity(textA: string, textB: string): number {
  const tokensA = getWordTokens(textA);
  const tokensB = getWordTokens(textB);

  if (tokensA.size === 0 && tokensB.size === 0) return 1.0;
  if (tokensA.size === 0 || tokensB.size === 0) return 0.0;

  let intersectionSize = 0;
  tokensA.forEach((token) => {
    if (tokensB.has(token)) {
      intersectionSize++;
    }
  });

  const unionSize = tokensA.size + tokensB.size - intersectionSize;
  return unionSize > 0 ? intersectionSize / unionSize : 0.0;
}

/**
 * Calculates Levenshtein Distance similarity for short text comparisons.
 */
export function calculateLevenshteinSimilarity(str1: string, str2: string): number {
  const norm1 = normalizeQuestionText(str1);
  const norm2 = normalizeQuestionText(str2);

  if (norm1 === norm2) return 1.0;
  if (!norm1.length || !norm2.length) return 0.0;

  const len1 = norm1.length;
  const len2 = norm2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = norm1[i - 1] === norm2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  return 1 - distance / maxLen;
}

/**
 * Detects whether a candidate question text duplicates any existing canonical questions.
 */
export function checkDuplicateQuestion(
  newQuestionText: string,
  existingQuestions: any[],
  questionUsageMap: Record<string, string[]> = {}
): DuplicateCheckResult {
  const normalizedNew = normalizeQuestionText(newQuestionText);
  if (!normalizedNew) {
    return {
      isDuplicate: false,
      matchType: 'NONE',
      highestSimilarityScore: 0,
      matches: [],
    };
  }

  const matches: QuestionMatch[] = [];
  let highestScore = 0;
  let overallMatchType: 'EXACT' | 'NEAR' | 'NONE' = 'NONE';

  for (const existing of existingQuestions) {
    const normalizedExisting = normalizeQuestionText(existing.questionText || '');
    if (!normalizedExisting) continue;

    let score = 0;
    let matchType: 'EXACT' | 'NEAR' | 'NONE' = 'NONE';
    let reason = '';

    // 1. Exact string or normalized string match
    if (newQuestionText.trim() === existing.questionText?.trim() || normalizedNew === normalizedExisting) {
      score = 100;
      matchType = 'EXACT';
      reason = 'Exact duplicate (100% text match)';
    } else {
      // 2. Token Jaccard similarity & Levenshtein similarity
      const jaccardScore = Math.round(calculateJaccardSimilarity(newQuestionText, existing.questionText) * 100);
      const levScore = Math.round(calculateLevenshteinSimilarity(newQuestionText, existing.questionText) * 100);
      score = Math.max(jaccardScore, levScore);

      if (score >= 85) {
        matchType = 'NEAR';
        reason = `Near duplicate (high wording similarity: ${score}%)`;
      } else if (score >= 75) {
        matchType = 'NEAR';
        reason = `Possible wording variation (${score}% similarity)`;
      }
    }

    if (matchType !== 'NONE') {
      if (score > highestScore) highestScore = score;
      if (matchType === 'EXACT') overallMatchType = 'EXACT';
      else if (overallMatchType !== 'EXACT') overallMatchType = 'NEAR';

      const assessmentsUsedIn = questionUsageMap[existing.id] || [];

      matches.push({
        existingQuestionId: existing.id,
        questionText: existing.questionText,
        similarityScore: score,
        matchType,
        reason,
        existingOptions: existing.options,
        correctOption: existing.correctOption || existing.correctAnswer,
        usageCount: assessmentsUsedIn.length,
        assessmentsUsedIn,
      });
    }
  }

  // Sort matches by highest similarity score
  matches.sort((a, b) => b.similarityScore - a.similarityScore);

  return {
    isDuplicate: matches.length > 0,
    matchType: overallMatchType,
    highestSimilarityScore: highestScore,
    matches,
  };
}
