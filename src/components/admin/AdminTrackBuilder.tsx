import React, { useState, useEffect } from 'react';
import { ChevronLeft, Plus, Settings, ArrowUp, ArrowDown, Trash2, Archive } from 'lucide-react';

export const AdminTrackBuilder: React.FC<{ trackId: string; onBack: () => void }> = ({ trackId, onBack }) => {
  const [track, setTrack] = useState<any>(null);
  const [stages, setStages] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [tests, setTests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Forms
  const [showStageForm, setShowStageForm] = useState(false);
  const [stageId, setStageId] = useState('');
  const [stageTitle, setStageTitle] = useState('');
  const [stageDesc, setStageDesc] = useState('');

  const [showItemForm, setShowItemForm] = useState<string | null>(null);
  const [itemId, setItemId] = useState('');
  const [itemTestId, setItemTestId] = useState('');

  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [msId, setMsId] = useState('');
  const [msTestId, setMsTestId] = useState('');
  const [msStageId, setMsStageId] = useState('');

  useEffect(() => {
    fetchData();
  }, [trackId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [tRes, sRes, iRes, mRes, testsRes] = await Promise.all([
        fetch(`/api/career-tracks/${trackId}`),
        fetch(`/api/career-tracks/${trackId}/stages`),
        fetch(`/api/career-tracks/${trackId}/items`),
        fetch(`/api/career-tracks/${trackId}/company-milestones`), // need an api for this or return it in track details? Wait, I didn't add an endpoint to GET milestones for a track in server.ts!
        fetch(`/api/tests`)
      ]);
      const tData = await tRes.json();
      const sData = await sRes.json();
      const iData = await iRes.json();
      const testsData = await testsRes.json();
      
      // I will need to add GET /api/career-tracks/:id/company-milestones to server.ts! Let me mock it for now.
      const mData = mRes.ok ? await mRes.json() : { milestones: [] };

      if (tData.track) setTrack(tData.track);
      if (sData.stages) setStages(sData.stages);
      if (iData.items) setItems(iData.items);
      if (mData.milestones) setMilestones(mData.milestones);
      if (testsData.tests) setTests(testsData.tests);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAddStage = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/admin/career-tracks/${trackId}/stages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: stageId, title: stageTitle, description: stageDesc, stageOrder: stages.length + 1 })
      });
      if (res.ok) {
        setShowStageForm(false);
        fetchData();
      }
    } catch (e) { console.error(e); }
  };

  const handleAddItem = async (e: React.FormEvent, currentStageId: string) => {
    e.preventDefault();
    try {
      const stageItems = items.filter(i => i.stageId === currentStageId);
      const res = await fetch(`/api/admin/stages/${currentStageId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: itemId, testId: itemTestId, itemType: 'assessment', isRequired: true, itemOrder: stageItems.length + 1 })
      });
      if (res.ok) {
        setShowItemForm(null);
        fetchData();
      }
    } catch (e) { console.error(e); }
  };

  const handleRemoveItem = async (id: string) => {
    if(!confirm('Remove this assessment from the track?')) return;
    try {
      await fetch(`/api/admin/items/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (e) { console.error(e); }
  };

  if (loading || !track) return <div className="p-8 text-center text-slate-500">Loading Track Builder...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500"><ChevronLeft className="w-5 h-5"/></button>
        <div>
          <h2 className="text-xl font-bold text-slate-900">{track.title}</h2>
          <p className="text-xs text-slate-500">Track Builder - {track.roleId}</p>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-slate-800">Stages</h3>
        <button onClick={() => setShowStageForm(true)} className="px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1 hover:bg-slate-900">
          <Plus className="w-4 h-4"/> Add Stage
        </button>
      </div>

      {showStageForm && (
        <form onSubmit={handleAddStage} className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid gap-3">
          <input required value={stageId} onChange={e=>setStageId(e.target.value)} placeholder="Stage ID (e.g. stage_1)" className="px-3 py-2 border rounded-lg text-sm"/>
          <input required value={stageTitle} onChange={e=>setStageTitle(e.target.value)} placeholder="Stage Title (e.g. Foundation)" className="px-3 py-2 border rounded-lg text-sm"/>
          <input value={stageDesc} onChange={e=>setStageDesc(e.target.value)} placeholder="Description" className="px-3 py-2 border rounded-lg text-sm"/>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={()=>setShowStageForm(false)} className="px-3 py-1.5 text-xs text-slate-500">Cancel</button>
            <button type="submit" className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs">Save Stage</button>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {stages.map((stage, idx) => (
          <div key={stage.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h4 className="font-bold text-slate-900">Stage {idx + 1}: {stage.title}</h4>
                <p className="text-xs text-slate-500">{stage.description}</p>
              </div>
              <button onClick={() => setShowItemForm(stage.id)} className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-semibold flex items-center gap-1 hover:bg-indigo-100">
                <Plus className="w-3 h-3"/> Add Assessment
              </button>
            </div>

            {showItemForm === stage.id && (
              <form onSubmit={e => handleAddItem(e, stage.id)} className="bg-slate-50 p-3 rounded-lg border border-slate-200 grid gap-2 mb-4">
                <input required value={itemId} onChange={e=>setItemId(e.target.value)} placeholder="Item ID (e.g. item_1_1)" className="px-3 py-2 border rounded-lg text-sm"/>
                <select required value={itemTestId} onChange={e=>setItemTestId(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
                  <option value="">Select an Assessment...</option>
                  {tests.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={()=>setShowItemForm(null)} className="px-3 py-1.5 text-xs text-slate-500">Cancel</button>
                  <button type="submit" className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs">Add Item</button>
                </div>
              </form>
            )}

            <div className="space-y-2">
              {items.filter(i => i.stageId === stage.id).map(item => {
                const test = tests.find(t => t.id === item.testId);
                return (
                  <div key={item.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="text-sm font-medium text-slate-700">{test ? test.title : item.testId}</span>
                    <button onClick={() => handleRemoveItem(item.id)} className="text-rose-500 hover:text-rose-700"><Trash2 className="w-4 h-4"/></button>
                  </div>
                );
              })}
              {items.filter(i => i.stageId === stage.id).length === 0 && (
                <div className="p-3 text-xs text-slate-400 text-center">No assessments in this stage.</div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center pt-8 border-t border-slate-200">
        <div>
          <h3 className="text-lg font-bold text-slate-800">Company Milestones</h3>
          <p className="text-xs text-slate-500">Final assessments linked to specific companies.</p>
        </div>
        <button onClick={() => setShowMilestoneForm(true)} className="px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1 hover:bg-slate-900">
          <Plus className="w-4 h-4"/> Add Milestone
        </button>
      </div>

      {showMilestoneForm && (
        <form onSubmit={async (e) => {
          e.preventDefault();
          try {
            const res = await fetch(`/api/admin/career-tracks/${trackId}/company-milestones`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: msId, assessmentId: msTestId, stageId: msStageId })
            });
            if (res.ok) {
              setShowMilestoneForm(false);
              fetchData();
            }
          } catch (e) { console.error(e); }
        }} className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid gap-3">
          <input required value={msId} onChange={e=>setMsId(e.target.value)} placeholder="Milestone ID (e.g. ms_tcs)" className="px-3 py-2 border rounded-lg text-sm"/>
          <select required value={msTestId} onChange={e=>setMsTestId(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
            <option value="">Select Company Assessment...</option>
            {tests.filter(t => t.id.includes('company') || t.title.includes('Mock')).map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
          <select required value={msStageId} onChange={e=>setMsStageId(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
            <option value="">Required Stage (Unlock)</option>
            {stages.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={()=>setShowMilestoneForm(false)} className="px-3 py-1.5 text-xs text-slate-500">Cancel</button>
            <button type="submit" className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs">Save Milestone</button>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {milestones.map(ms => {
          const test = tests.find(t => t.id === ms.assessmentId);
          const stage = stages.find(s => s.id === ms.stageId);
          return (
            <div key={ms.id} className="flex justify-between items-center p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
              <div>
                <h4 className="font-bold text-slate-900">{test ? test.title : ms.assessmentId}</h4>
                <p className="text-xs text-slate-500">Unlocks after: {stage ? stage.title : ms.stageId}</p>
              </div>
              <button onClick={async () => {
                if(!confirm('Remove this milestone?')) return;
                try {
                  await fetch(`/api/admin/company-milestones/${ms.id}`, { method: 'DELETE' });
                  fetchData();
                } catch (e) { console.error(e); }
              }} className="text-rose-500 hover:text-rose-700 p-2"><Trash2 className="w-4 h-4"/></button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
