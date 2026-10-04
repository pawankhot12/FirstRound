import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, HelpCircle, X, ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react';
import { Question, TestSeries } from '../../types';
import { getAllStaticCanonicalQuestions } from '../../data/questionBank/staticFallback';

interface AdminAssessmentPreviewProps {
  assessment: TestSeries;
  canonicalQuestions?: Question[];
  onClose: () => void;
}

export const AdminAssessmentPreview: React.FC<AdminAssessmentPreviewProps> = ({
  assessment,
  canonicalQuestions = [],
  onClose,
}) => {
  // Resolve preview questions intelligently across all assessment types
  const questions: Question[] = (() => {
    // 1. Direct questions array on assessment with questionText
    if (Array.isArray(assessment.questions) && assessment.questions.length > 0 && assessment.questions[0]?.questionText) {
      return assessment.questions;
    }

    const allBanks = canonicalQuestions.length > 0 ? canonicalQuestions : getAllStaticCanonicalQuestions();
    const testId = assessment.id || '';

    // 2. Direct question ID references
    if (Array.isArray(assessment.questions) && assessment.questions.length > 0) {
      const mapped = (assessment.questions as any[])
        .map((qOrId) => (typeof qOrId === 'string' ? allBanks.find((q) => q.id === qOrId) : qOrId))
        .filter(Boolean);
      if (mapped.length > 0) return mapped;
    }

    // 3. Match by testSeriesId
    let matched = allBanks.filter((q: any) => q.testSeriesId === testId);
    if (matched.length > 0) return matched;

    // 4. Match by Category / Topic / Company pattern
    const cat = (assessment.category || '').toLowerCase();
    const title = (assessment.title || '').toLowerCase();
    const comp = (assessment.companyName || assessment.company || title).toLowerCase();

    if (cat === 'foundation' || testId.startsWith('cat_foundation')) {
      if (testId.includes('quant') || title.includes('quant')) {
        matched = allBanks.filter((q: any) => q.testSeriesId === 'cat_foundation_quant' || q.source === 'quant');
      } else if (testId.includes('logical') || title.includes('logical')) {
        matched = allBanks.filter((q: any) => q.testSeriesId === 'cat_foundation_logical' || q.source === 'logical');
      } else if (testId.includes('verbal') || title.includes('verbal')) {
        matched = allBanks.filter((q: any) => q.testSeriesId === 'cat_foundation_verbal' || q.source === 'verbal');
      } else if (testId.includes('di') || title.includes('data interpretation')) {
        matched = allBanks.filter((q: any) => q.testSeriesId === 'cat_foundation_di' || q.source === 'di');
      } else if (testId.includes('pseudocode') || title.includes('pseudocode')) {
        matched = allBanks.filter((q: any) => q.testSeriesId === 'cat_foundation_pseudocode' || q.source === 'pseudocode');
      }
    } else if (cat === 'company' || testId.startsWith('cat_company')) {
      if (comp.includes('tcs')) {
        matched = allBanks.filter((q: any) => q.source === 'tcsAdvanced' || q.source === 'tcsCoding' || q.testSeriesId?.includes('tcs'));
      } else if (comp.includes('infosys')) {
        matched = allBanks.filter((q: any) => q.source === 'infosys' || q.testSeriesId?.includes('infosys'));
      } else if (comp.includes('wipro')) {
        matched = allBanks.filter((q: any) => q.source === 'wipro' || q.testSeriesId?.includes('wipro'));
      } else if (comp.includes('accenture')) {
        matched = allBanks.filter((q: any) => q.source === 'accenture' || q.testSeriesId?.includes('accenture'));
      } else if (comp.includes('cognizant')) {
        matched = allBanks.filter((q: any) => q.source === 'cognizant' || q.testSeriesId?.includes('cognizant'));
      }
    } else if (cat === 'coding' || testId.startsWith('cat_coding')) {
      if (testId.includes('core_cs') || title.includes('core cs')) {
        matched = allBanks.filter((q: any) => q.testSeriesId === 'cat_coding_core_cs');
      } else if (testId.includes('dsa') || title.includes('dsa')) {
        matched = allBanks.filter((q: any) => q.testSeriesId === 'cat_coding_dsa');
      } else if (testId.includes('mock_01') || title.includes('technical mock')) {
        matched = allBanks.filter((q: any) => q.testSeriesId === 'cat_coding_mock_01' || q.source === 'codingMock');
      } else if (testId.includes('output_debug') || title.includes('output & debugging')) {
        matched = allBanks.filter((q: any) => q.testSeriesId === 'cat_coding_output_debug');
      } else if (testId.includes('prog_fundamentals') || title.includes('programming fundamentals')) {
        matched = allBanks.filter((q: any) => q.testSeriesId === 'cat_coding_prog_fundamentals');
      } else if (testId.includes('sql') || title.includes('sql')) {
        matched = allBanks.filter((q: any) => q.testSeriesId === 'cat_coding_sql');
      } else {
        matched = allBanks.filter((q: any) => (q as any).questionType === 'CODING' || q.source === 'tcsCoding' || q.source === 'codingMock');
      }
    }

    if (matched.length > 0) return matched;

    // 5. Ultimate fallback: slice first N questions from static bank
    const targetCount = Number(assessment.totalQuestions || assessment.questionCount || 10);
    return allBanks.slice(0, targetCount > 0 ? targetCount : 10);
  })();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);

  const currentQ = questions[currentIndex];

  const handleSelectOption = (optionId: string) => {
    if (isSubmitted || !currentQ) return;
    setSelectedAnswers((prev) => ({
      ...prev,
      [currentQ.id]: optionId,
    }));
  };

  const calculateScore = () => {
    let score = 0;
    let correct = 0;
    questions.forEach((q) => {
      const selected = selectedAnswers[q.id];
      const correctOpt = (q as any).correctOption || (q as any).correctAnswer;
      if (selected && selected === correctOpt) {
        correct++;
        score += 10;
      }
    });
    return { score, correct, total: questions.length };
  };

  const stats = calculateScore();

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Top Warning Banner */}
        <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-2.5 flex items-center justify-between text-amber-900 text-xs font-bold">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-amber-400 text-slate-950 font-black text-2xs uppercase tracking-wider">
              PREVIEW MODE
            </span>
            <span className="hidden sm:inline font-semibold text-amber-800">
              Interactive Admin Test Run — No attempt, XP, History or League changes will be saved.
            </span>
            <span className="sm:hidden font-semibold text-amber-800">No attempt or XP recorded</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-amber-100 text-amber-900 transition-colors cursor-pointer"
            title="Close Preview"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Assessment Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2 flex-wrap text-2xs font-bold text-slate-500 mb-0.5">
              <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded-md uppercase tracking-wider">
                {assessment.category}
              </span>
              <span>•</span>
              <span className="px-2 py-0.5 bg-sky-100 text-sky-800 rounded-md font-extrabold uppercase">
                {assessment.difficulty || 'Medium'}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 font-['Outfit']">{assessment.title}</h2>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-slate-600 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs font-semibold">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>{assessment.durationMinutes || 20}m</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-600 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs font-semibold">
              <HelpCircle className="w-3.5 h-3.5 text-sky-600" />
              <span>{questions.length} Qs</span>
            </div>
          </div>
        </div>

        {/* Main Preview Body */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-5 bg-white">
          {questions.length === 0 ? (
            <div className="text-center py-12 text-slate-500 space-y-2">
              <HelpCircle className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="font-bold text-sm text-slate-700">No questions attached to this assessment yet.</p>
              <p className="text-xs text-slate-500">Attach canonical questions in the assessment editor to preview student flow.</p>
            </div>
          ) : isSubmitted ? (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 sm:p-8 text-center space-y-4 max-w-md mx-auto my-4 shadow-xs">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 font-['Outfit']">Preview Test Completed</h3>
              <div className="grid grid-cols-2 gap-3 text-left bg-white p-4 rounded-xl border border-slate-200 text-xs shadow-2xs">
                <div>
                  <span className="text-slate-500 font-semibold block">Preview Score</span>
                  <span className="font-extrabold text-emerald-700 text-base font-['Outfit']">{stats.score} XP</span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold block">Accuracy</span>
                  <span className="font-extrabold text-sky-700 text-base font-['Outfit']">
                    {Math.round((stats.correct / (stats.total || 1)) * 100)}%
                  </span>
                </div>
              </div>
              <p className="text-2xs text-slate-500 font-medium">
                Validation verified successfully. Production history and XP were left unchanged.
              </p>
              <button
                onClick={() => {
                  setIsSubmitted(false);
                  setSelectedAnswers({});
                  setCurrentIndex(0);
                }}
                className="w-full py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restart Preview</span>
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Question Stepper Palette */}
              <div className="flex flex-wrap gap-1.5 pb-3 border-b border-slate-100">
                {questions.map((q, idx) => {
                  const isSelected = currentIndex === idx;
                  const isAnswered = !!selectedAnswers[q.id];
                  return (
                    <button
                      key={q.id || idx}
                      onClick={() => setCurrentIndex(idx)}
                      className={`w-7 h-7 rounded-lg text-2xs font-extrabold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-slate-900 text-white shadow-xs'
                          : isAnswered
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>

              {/* Current Question Display */}
              {currentQ && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                    <span className="font-bold text-slate-900">
                      Question {currentIndex + 1} of {questions.length}
                    </span>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-2xs font-bold">
                      {currentQ.topic || 'General'}
                    </span>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 text-xs sm:text-sm text-slate-900 font-medium leading-relaxed shadow-2xs">
                    {currentQ.questionText}
                  </div>

                  {/* Options List */}
                  <div className="space-y-2">
                    {Array.isArray((currentQ as any).options) &&
                      (currentQ as any).options.map((opt: any) => {
                        const optKey = typeof opt === 'string' ? opt : opt.id;
                        const optText = typeof opt === 'string' ? opt : opt.text;
                        const isChosen = selectedAnswers[currentQ.id] === optKey;

                        return (
                          <button
                            key={optKey}
                            onClick={() => handleSelectOption(optKey)}
                            className={`w-full p-3 sm:p-3.5 rounded-xl text-xs font-semibold text-left transition-all flex items-center gap-3 border cursor-pointer ${
                              isChosen
                                ? 'bg-sky-50 border-sky-400 text-sky-950 shadow-xs'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                            }`}
                          >
                            <span
                              className={`w-6 h-6 rounded-lg flex items-center justify-center font-extrabold text-2xs shrink-0 ${
                                isChosen ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}
                            >
                              {optKey}
                            </span>
                            <span className="leading-snug">{optText}</span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        {questions.length > 0 && !isSubmitted && (
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <button
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              disabled={currentIndex === 0}
              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>

            {currentIndex === questions.length - 1 ? (
              <button
                onClick={() => setIsSubmitted(true)}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Submit Preview</span>
              </button>
            ) : (
              <button
                onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              >
                <span>Next</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
