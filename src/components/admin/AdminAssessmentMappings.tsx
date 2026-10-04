import React, { useState, useEffect } from 'react';
import { TestSeries } from '../../types';
import { Tag, Building2, Briefcase, Plus, Trash2, CheckCircle2 } from 'lucide-react';

interface AdminAssessmentMappingsProps {
  tests: TestSeries[];
}

export const AdminAssessmentMappings: React.FC<AdminAssessmentMappingsProps> = ({ tests }) => {
  const [selectedTestId, setSelectedTestId] = useState<string>(tests[0]?.id || '');
  const [roles, setRoles] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [assignedRoles, setAssignedRoles] = useState<string[]>([]);
  const [assignedCompanies, setAssignedCompanies] = useState<string[]>([]);
  
  const [newRoleId, setNewRoleId] = useState('');
  const [newRelevance, setNewRelevance] = useState('primary');
  const [newCompanyId, setNewCompanyId] = useState('');

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    fetchMetadata();
  }, []);

  useEffect(() => {
    if (selectedTestId) {
      const currentTest = tests.find(t => t.id === selectedTestId);
      if (currentTest) {
        setAssignedRoles(currentTest.supportedRoles || currentTest.roles || []);
        setAssignedCompanies(currentTest.companyId ? [currentTest.companyId] : []);
      }
    }
  }, [selectedTestId, tests]);

  const fetchMetadata = async () => {
    try {
      const [roleRes, compRes] = await Promise.all([
        fetch('/api/roles'),
        fetch('/api/companies')
      ]);
      const roleData = await roleRes.json();
      const compData = await compRes.json();
      if (roleData.roles) setRoles(roleData.roles);
      if (compData.companies) setCompanies(compData.companies);
    } catch (e) {
      console.error('Failed to fetch metadata:', e);
    }
  };

  const handleAddRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTestId || !newRoleId) return;
    try {
      const res = await fetch('/api/admin/assessment-roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessmentId: selectedTestId, roleId: newRoleId, relevance: newRelevance })
      });
      if (res.ok) {
        setMessage({ text: 'Role mapping added successfully!', type: 'success' });
        setAssignedRoles(prev => Array.from(new Set([...prev, newRoleId])));
        setNewRoleId('');
      }
    } catch (e: any) {
      setMessage({ text: e.message, type: 'error' });
    }
  };

  const handleRemoveRole = async (roleId: string) => {
    try {
      const res = await fetch('/api/admin/assessment-roles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessmentId: selectedTestId, roleId })
      });
      if (res.ok) {
        setMessage({ text: 'Role mapping removed.', type: 'success' });
        setAssignedRoles(prev => prev.filter(r => r !== roleId));
      }
    } catch (e: any) {
      setMessage({ text: e.message, type: 'error' });
    }
  };

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTestId || !newCompanyId) return;
    try {
      const res = await fetch('/api/admin/assessment-companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessmentId: selectedTestId, companyId: newCompanyId })
      });
      if (res.ok) {
        setMessage({ text: 'Company mapping added successfully!', type: 'success' });
        setAssignedCompanies(prev => Array.from(new Set([...prev, newCompanyId])));
        setNewCompanyId('');
      }
    } catch (e: any) {
      setMessage({ text: e.message, type: 'error' });
    }
  };

  const handleRemoveCompany = async (companyId: string) => {
    try {
      const res = await fetch('/api/admin/assessment-companies', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessmentId: selectedTestId, companyId })
      });
      if (res.ok) {
        setMessage({ text: 'Company mapping removed.', type: 'success' });
        setAssignedCompanies(prev => prev.filter(c => c !== companyId));
      }
    } catch (e: any) {
      setMessage({ text: e.message, type: 'error' });
    }
  };

  const selectedTest = tests.find(t => t.id === selectedTestId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 font-['Outfit']">Assessment Role & Company Mappings</h2>
          <p className="text-xs text-slate-500">Map mock tests and assessments to target career roles and hiring companies.</p>
        </div>

        <div className="w-full sm:w-72">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Select Assessment:</label>
          <select
            value={selectedTestId}
            onChange={e => setSelectedTestId(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-semibold focus:outline-none focus:border-indigo-600"
          >
            {tests.map(t => (
              <option key={t.id} value={t.id}>{t.title} ({t.companyName || 'General'})</option>
            ))}
          </select>
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between ${message.type === 'success' ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' : 'bg-rose-50 text-rose-900 border border-rose-200'}`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
      )}

      {selectedTest && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Target Roles Mapping */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Briefcase className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">Target Role Associations</h3>
                <p className="text-[11px] text-slate-500">Connect this assessment to specific candidate roles.</p>
              </div>
            </div>

            <form onSubmit={handleAddRole} className="flex gap-2">
              <select
                required
                value={newRoleId}
                onChange={e => setNewRoleId(e.target.value)}
                className="flex-1 px-3 py-1.5 border border-slate-200 rounded-xl text-xs text-slate-900"
              >
                <option value="">Choose role to assign...</option>
                {roles.map(r => (
                  <option key={r.id} value={r.id}>{r.name} ({r.id})</option>
                ))}
              </select>
              <select
                value={newRelevance}
                onChange={e => setNewRelevance(e.target.value)}
                className="px-2 py-1.5 border border-slate-200 rounded-xl text-xs text-slate-700"
              >
                <option value="primary">Primary</option>
                <option value="secondary">Secondary</option>
              </select>
              <button type="submit" className="px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-semibold flex items-center gap-1 hover:bg-indigo-700">
                <Plus className="w-4 h-4" /> Add
              </button>
            </form>

            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Assigned Roles</h4>
              {assignedRoles.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {assignedRoles.map(rId => {
                    const roleObj = roles.find(r => r.id === rId);
                    return (
                      <div key={rId} className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-xl text-xs font-semibold flex items-center gap-2">
                        <span>{roleObj ? roleObj.name : rId}</span>
                        <button onClick={() => handleRemoveRole(rId)} className="text-rose-500 hover:text-rose-700">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No explicit roles assigned yet.</p>
              )}
            </div>
          </div>

          {/* Target Company Mapping */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Building2 className="w-5 h-5 text-amber-600" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">Target Company Tags</h3>
                <p className="text-[11px] text-slate-500">Associate this assessment with target recruiting companies.</p>
              </div>
            </div>

            <form onSubmit={handleAddCompany} className="flex gap-2">
              <select
                required
                value={newCompanyId}
                onChange={e => setNewCompanyId(e.target.value)}
                className="flex-1 px-3 py-1.5 border border-slate-200 rounded-xl text-xs text-slate-900"
              >
                <option value="">Choose company to assign...</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button type="submit" className="px-3 py-1.5 bg-amber-500 text-slate-950 rounded-xl text-xs font-bold flex items-center gap-1 hover:bg-amber-400">
                <Plus className="w-4 h-4" /> Add
              </button>
            </form>

            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Assigned Companies</h4>
              {assignedCompanies.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {assignedCompanies.map(cId => {
                    const compObj = companies.find(c => c.id === cId);
                    return (
                      <div key={cId} className="px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-950 rounded-xl text-xs font-bold flex items-center gap-2">
                        <span>{compObj ? compObj.name : cId}</span>
                        <button onClick={() => handleRemoveCompany(cId)} className="text-rose-500 hover:text-rose-700">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No explicit company tags assigned yet.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
