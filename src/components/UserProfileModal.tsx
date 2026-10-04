import React, { useState } from 'react';
import {
  Briefcase,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Sparkles,
  Target,
  User,
  X,
  Zap,
} from 'lucide-react';
import { TestAttempt, UserProfile } from '../types';

export const TARGET_COMPANIES = [
  'TCS',
  'Infosys',
  'Accenture',
  'Wipro',
  'Cognizant',
  'Capgemini',
  'Amazon',
  'Deloitte',
  'IBM',
  'Microsoft',
  'Google',
  'Other',
];

export const TARGET_ROLES = [
  'Software Developer',
  'Data Analyst',
  'Data Engineer',
  'Cloud Engineer',
  'QA / Testing',
  'Cybersecurity',
  'Other',
];

interface UserProfileModalProps {
  user: UserProfile;
  attempts: TestAttempt[];
  onClose: () => void;
  onUpdateUser: (data: Partial<UserProfile>) => Promise<void>;
  onViewAttemptReport: (attempt: TestAttempt) => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  user,
  attempts,
  onClose,
  onUpdateUser,
  onViewAttemptReport,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user.name || '');
  const [targetCompany, setTargetCompany] = useState(user.targetCompany || '');
  const [targetRole, setTargetRole] = useState(user.targetRole || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  React.useEffect(() => {
    setName(user.name || '');
    setTargetCompany(user.targetCompany || '');
    setTargetRole(user.targetRole || '');
  }, [user.name, user.targetCompany, user.targetRole]);

  // Derive initial values on cancel
  const handleCancel = () => {
    setName(user.name || '');
    setTargetCompany(user.targetCompany || '');
    setTargetRole(user.targetRole || '');
    setIsEditing(false);
    setSaveSuccess(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSaving(true);
    try {
      await onUpdateUser({
        name: name.trim(),
        targetCompany: targetCompany.trim(),
        targetRole: targetRole.trim(),
      });
      setSaveSuccess(true);
      setIsEditing(false);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      console.error('Failed to update candidate profile:', e);
    } finally {
      setIsSaving(false);
    }
  };

  const initial = (user.name || 'C').charAt(0).toUpperCase();
  const completedMocksCount = attempts.length;
  const avgAccuracyDisplay =
    completedMocksCount > 0
      ? `${user.averageAccuracyPercentage ?? user.averageAccuracy ?? 0}%`
      : 'N/A';

  return (
    <div
      id="candidate-profile-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in"
    >
      <div
        id="candidate-profile-modal"
        className="bg-surface border border-border w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-text-primary"
      >
        {/* Profile Header Banner */}
        <div className="p-6 bg-primary border-b border-primary-dark text-white flex items-start justify-between relative overflow-hidden">
          <div className="flex items-center gap-4 relative z-10">
            {/* Avatar */}
            <div className="w-14 h-14 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center text-xl font-extrabold shadow-md shrink-0 overflow-hidden">
              {(user.avatarUrl || user.avatar) ? (
                <img src={user.avatarUrl || user.avatar} alt={user.name || 'Candidate'} className="w-full h-full object-cover" />
              ) : (
                <span>{initial}</span>
              )}
            </div>

            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white tracking-tight truncate">
                  {user.name || 'Candidate'}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-surface/15 border border-white/20 text-amber-300 text-[10px] font-extrabold uppercase tracking-wider">
                  CANDIDATE
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-300">
                <p className="flex items-center gap-1.5 truncate">
                  <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className={user.targetCompany ? 'text-slate-200 font-medium' : 'text-slate-400 italic'}>
                    {user.targetCompany ? `Target: ${user.targetCompany}` : 'Target company not set'}
                  </span>
                </p>

                {user.targetRole && (
                  <>
                    <span className="text-text-secondary hidden sm:inline">•</span>
                    <p className="flex items-center gap-1.5 truncate">
                      <Briefcase className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="text-slate-200 font-medium">{user.targetRole}</span>
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            id="close-profile-modal-btn"
            onClick={onClose}
            className="p-2 text-slate-300 hover:text-white hover:bg-surface/10 rounded-xl transition-colors relative z-10"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Subtle Saved Success Notice */}
          {saveSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Profile updated successfully.</span>
            </div>
          )}

          {/* Profile Statistics Cards */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200">
              <p className="text-[10px] uppercase font-bold tracking-wider text-amber-800">
                TOTAL POINTS
              </p>
              <p className="text-xl font-extrabold text-amber-950 mt-0.5">
                {(user.totalPoints ?? 0).toLocaleString()}
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-app-bg border border-border">
              <p className="text-[10px] uppercase font-bold tracking-wider text-text-muted">
                MOCKS TAKEN
              </p>
              <p className="text-xl font-extrabold text-text-primary mt-0.5">
                {completedMocksCount}
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200">
              <p className="text-[10px] uppercase font-bold tracking-wider text-emerald-800">
                AVG ACCURACY
              </p>
              <p className="text-xl font-extrabold text-emerald-950 mt-0.5">
                {avgAccuracyDisplay}
              </p>
            </div>
          </div>

          {/* Edit Profile Section */}
          {isEditing ? (
            <form
              id="edit-profile-form"
              onSubmit={handleSave}
              className="p-5 rounded-2xl bg-app-bg border border-border space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  Edit Profile Details
                </h3>
                <span className="text-[11px] text-slate-400 font-medium">All fields optional except Name</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="profile-edit-name-input"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Pawan Khot"
                    className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-xs text-text-primary focus:outline-none focus:border-primary shadow-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Target Company
                  </label>
                  <select
                    id="profile-edit-target-company-select"
                    value={targetCompany}
                    onChange={(e) => setTargetCompany(e.target.value)}
                    className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-xs text-text-primary focus:outline-none focus:border-primary shadow-xs"
                  >
                    <option value="">Select target company (optional)...</option>
                    {TARGET_COMPANIES.map((comp) => (
                      <option key={comp} value={comp}>
                        {comp}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Target Role
                  </label>
                  <select
                    id="profile-edit-target-role-select"
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                    className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-xs text-text-primary focus:outline-none focus:border-primary shadow-xs"
                  >
                    <option value="">Select target role (optional)...</option>
                    {TARGET_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
                <button
                  id="profile-edit-cancel-btn"
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 bg-surface hover:bg-surface-hover border border-border text-xs font-bold rounded-xl text-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  id="profile-edit-save-btn"
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5"
                >
                  {isSaving ? (
                    <span>Saving...</span>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Save Profile</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-app-bg p-4 rounded-2xl border border-border text-xs">
              <div className="space-y-0.5">
                <p className="font-bold text-text-primary">Placement Target Details</p>
                <p className="text-text-muted text-[11px]">
                  {user.targetCompany || user.targetRole
                    ? `Targeting ${user.targetCompany || 'General Placement'} ${user.targetRole ? `as ${user.targetRole}` : ''}`
                    : 'Set your target company and role below.'}
                </p>
              </div>
              <button
                id="open-profile-edit-btn"
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 bg-primary hover:bg-primary-hover text-white font-bold text-xs rounded-xl transition-colors shrink-0"
              >
                Edit Profile Details
              </button>
            </div>
          )}

          {/* Profile History: Previous Test Attempts */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                <span>Previous Test Attempts History ({attempts.length})</span>
              </h3>
            </div>

            {attempts.length === 0 ? (
              <div
                id="profile-empty-history"
                className="p-8 rounded-2xl bg-app-bg border border-dashed border-border text-center text-xs text-text-muted space-y-1"
              >
                <p className="font-semibold text-slate-700">No completed assessments yet.</p>
                <p className="text-[11px] text-slate-400">
                  Assessments you complete will be automatically logged here with your score reports.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1 divide-y divide-slate-100">
                {attempts.map((att) => (
                  <div
                    key={att.id}
                    className="p-3.5 rounded-xl bg-surface border border-border hover:border-slate-300 transition-all flex items-center justify-between gap-3 text-xs shadow-xs"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <h4 className="font-bold text-text-primary truncate">{att.testTitle}</h4>
                      <p className="text-[11px] text-text-muted flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span>{new Date(att.submittedAt).toLocaleDateString()}</span>
                        <span>•</span>
                        <span>Points: <strong className="text-slate-800">{att.scorePoints} XP</strong></span>
                        <span>•</span>
                        <span>Accuracy: <strong className="text-emerald-700 font-bold">{att.accuracyPercentage}%</strong></span>
                      </p>
                    </div>

                    <button
                      onClick={() => onViewAttemptReport(att)}
                      className="px-3.5 py-1.5 bg-surface-hover hover:bg-slate-200 text-slate-800 font-bold rounded-lg transition-colors flex items-center gap-1 shrink-0 text-xs shadow-xs"
                    >
                      <span>View Report</span>
                      <ExternalLink className="w-3 h-3 text-text-muted" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
