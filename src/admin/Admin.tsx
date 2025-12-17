import React, { useEffect, useState } from 'react';

type Props = {
  apiUrl: string;
  onClose: () => void;
};

const Admin: React.FC<Props> = ({ apiUrl, onClose }) => {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState<string>('{\\n  \\n}');

  const loadKnowledge = async () => {
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/admin/knowledge`, {
        headers: {
          'X-Admin-Token': token,
        },
      });
      if (!res.ok) {
        throw new Error(`Load failed (${res.status})`);
      }
      const data = await res.json();
      setJsonText(JSON.stringify(data, null, 2));
      setMessage('Knowledge loaded.');
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const saveKnowledge = async () => {
    setError(null);
    setMessage(null);
    setSaving(true);
    try {
      let parsed;
      try {
        parsed = JSON.parse(jsonText);
      } catch (e) {
        throw new Error('Invalid JSON. Please fix and try again.');
      }
      const res = await fetch(`${apiUrl}/admin/knowledge`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': token,
        },
        body: JSON.stringify(parsed),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = body?.detail || body?.error || `Save failed (${res.status})`;
        throw new Error(msg);
      }
      setMessage('Knowledge saved.');
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 1000 }}>
      <div style={{ backgroundColor: '#111827', color: 'white', width: '100%', maxWidth: '60rem', borderRadius: '0.5rem', padding: '1rem', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fbbf24' }}>Admin: Knowledge Editor</h2>
          <button onClick={onClose} style={{ backgroundColor: '#374151', color: 'white', border: 'none', borderRadius: '0.375rem', padding: '0.375rem 0.75rem', cursor: 'pointer' }}>Close</button>
        </div>

        <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Enter admin token"
            style={{ padding: '0.5rem', backgroundColor: '#1f2937', color: 'white', border: '1px solid #4b5563', borderRadius: '0.375rem' }}
          />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={loadKnowledge} disabled={!token || loading} style={{ backgroundColor: (!token || loading) ? '#4b5563' : '#2563eb', color: 'white', padding: '0.5rem 0.75rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer' }}>
              {loading ? 'Loading…' : 'Load'}
            </button>
            <button onClick={saveKnowledge} disabled={!token || saving} style={{ backgroundColor: (!token || saving) ? '#4b5563' : '#059669', color: 'white', padding: '0.5rem 0.75rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {error && <div style={{ backgroundColor: '#7f1d1d', color: 'white', padding: '0.5rem', borderRadius: '0.375rem', marginBottom: '0.5rem' }}>❌ {error}</div>}
        {message && <div style={{ backgroundColor: '#064e3b', color: 'white', padding: '0.5rem', borderRadius: '0.375rem', marginBottom: '0.5rem' }}>✅ {message}</div>}

        <div style={{ marginTop: '0.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem' }}>knowledge.json</label>
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            spellCheck={false}
            style={{ width: '100%', minHeight: '24rem', backgroundColor: '#1f2937', color: '#e5e7eb', border: '1px solid #4b5563', borderRadius: '0.375rem', padding: '0.75rem', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', fontSize: '0.875rem' }}
          />
        </div>
      </div>
    </div>
  );
};

export default Admin;


