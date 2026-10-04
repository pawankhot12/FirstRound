import React, { useState, useEffect } from 'react';
import { Plus, Archive } from 'lucide-react';

export const AdminRoles: React.FC = () => {
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [desc, setDesc] = useState('');

  useEffect(() => {
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/roles');
      const data = await res.json();
      if (data.roles) setRoles(data.roles);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, slug, description: desc, status: 'published' }),
      });
      if (res.ok) {
        setShowForm(false);
        fetchRoles();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleArchive = async (roleId: string) => {
    if (!confirm('Are you sure you want to archive this role? It will no longer be assignable.')) return;
    try {
      await fetch(`/api/admin/roles/${roleId}/archive`, { method: 'PATCH' });
      fetchRoles();
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading roles...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-900">Role Management</h2>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4" /> Add Role
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Role ID</label>
              <input required value={id} onChange={e => setId(e.target.value)} placeholder="role_qa" className="w-full px-3 py-2 border rounded-xl" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Name</label>
              <input required value={name} onChange={e => setName(e.target.value)} placeholder="QA Engineer" className="w-full px-3 py-2 border rounded-xl" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Slug</label>
              <input required value={slug} onChange={e => setSlug(e.target.value)} placeholder="qa-engineer" className="w-full px-3 py-2 border rounded-xl" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
              <input value={desc} onChange={e => setDesc(e.target.value)} className="w-full px-3 py-2 border rounded-xl" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-slate-500">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-xl">Save Role</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
            <tr>
              <th className="p-4 font-semibold">Role Name</th>
              <th className="p-4 font-semibold">ID / Slug</th>
              <th className="p-4 font-semibold">Status</th>
              <th className="p-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {roles.map(role => (
              <tr key={role.id} className="hover:bg-slate-50">
                <td className="p-4 font-semibold text-slate-900">{role.name}</td>
                <td className="p-4 text-slate-500 font-mono text-xs">{role.id}<br/>{role.slug}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${role.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                    {role.status}
                  </span>
                </td>
                <td className="p-4 text-right">
                  {role.status !== 'archived' && (
                    <button onClick={() => handleArchive(role.id)} className="text-rose-500 hover:text-rose-700 p-2">
                      <Archive className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
