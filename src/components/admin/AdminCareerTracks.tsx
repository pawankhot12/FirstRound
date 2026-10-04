import React, { useState, useEffect } from 'react';
import { Plus, Archive, ChevronRight, Settings } from 'lucide-react';

export const AdminCareerTracks: React.FC<{ onSelectTrack: (id: string) => void }> = ({ onSelectTrack }) => {
  const [tracks, setTracks] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [id, setId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [desc, setDesc] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [trackRes, roleRes] = await Promise.all([
        fetch('/api/career-tracks'),
        fetch('/api/roles')
      ]);
      const trackData = await trackRes.json();
      const roleData = await roleRes.json();
      if (trackData.tracks) setTracks(trackData.tracks);
      if (roleData.roles) setRoles(roleData.roles.filter((r: any) => r.status === 'published'));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/career-tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, roleId, title, slug, description: desc, status: 'draft' }),
      });
      if (res.ok) {
        setShowForm(false);
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleStatusChange = async (trackId: string, status: string) => {
    try {
      await fetch(`/api/admin/career-tracks/${trackId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading tracks...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-900">Career Tracks</h2>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4" /> Add Track
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Track ID</label>
              <input required value={id} onChange={e => setId(e.target.value)} placeholder="track_qa_01" className="w-full px-3 py-2 border rounded-xl" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Role</label>
              <select required value={roleId} onChange={e => setRoleId(e.target.value)} className="w-full px-3 py-2 border rounded-xl">
                <option value="">Select a role...</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Title</label>
              <input required value={title} onChange={e => setTitle(e.target.value)} placeholder="QA Engineer Journey" className="w-full px-3 py-2 border rounded-xl" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Slug</label>
              <input required value={slug} onChange={e => setSlug(e.target.value)} placeholder="qa-journey" className="w-full px-3 py-2 border rounded-xl" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
              <input value={desc} onChange={e => setDesc(e.target.value)} className="w-full px-3 py-2 border rounded-xl" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-slate-500">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-xl">Save Track</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
            <tr>
              <th className="p-4 font-semibold">Track Title</th>
              <th className="p-4 font-semibold">Role</th>
              <th className="p-4 font-semibold">Status</th>
              <th className="p-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tracks.map(track => (
              <tr key={track.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => onSelectTrack(track.id)}>
                <td className="p-4 font-semibold text-slate-900">{track.title}</td>
                <td className="p-4 text-slate-500 text-xs">{track.roleId}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${track.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                    {track.status}
                  </span>
                </td>
                <td className="p-4 text-right flex justify-end gap-2" onClick={e => e.stopPropagation()}>
                  <button onClick={() => onSelectTrack(track.id)} className="p-2 text-indigo-600 hover:text-indigo-800">
                    <Settings className="w-4 h-4" />
                  </button>
                  {track.status !== 'archived' && (
                    <button onClick={() => handleStatusChange(track.id, track.status === 'published' ? 'archived' : 'published')} className="text-slate-500 hover:text-slate-700 p-2">
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
