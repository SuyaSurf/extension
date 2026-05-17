import React, { useEffect, useState } from 'react';

interface MemorySource {
  id: string;
  sourceType: string;
  title: string;
  domain?: string | null;
  date?: string;
  snippet?: string;
  url?: string | null;
}

interface DreamIteration {
  id: string;
  variantType: string;
  prompt?: string;
  body: string;
  sourceMemoryIds: string[];
  createdAt: number;
}

interface Dream {
  id: string;
  title: string;
  description: string;
  tags: string[];
  sourceMemoryIds: string[];
  sourceCount: number;
  iterationCount: number;
  createdAt: number;
  updatedAt: number;
  sources?: MemorySource[];
  iterations?: DreamIteration[];
}

interface DreamCandidate {
  title: string;
  description: string;
  tags: string[];
  sourceMemoryIds: string[];
  confidence: number;
}

type SkillResponse<T extends object = Record<string, unknown>> = {
  success?: boolean;
  error?: string;
  data?: T;
} & T;

const getPayload = <T extends object>(response: SkillResponse<T> | null | undefined): T | null => {
  if (!response || response.success === false) return null;
  return (response.data && typeof response.data === 'object' ? response.data : response) as T;
};

const sendMemoryAction = async <T extends object>(action: string, data: Record<string, unknown> = {}): Promise<T | null> => {
  const response = await chrome.runtime.sendMessage({
    skill: 'personal-memory',
    action,
    data
  });

  return getPayload<T>(response);
};

const formatDate = (timestamp?: number) => {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const DreamsSection: React.FC = () => {
  const [dreams, setDreams] = useState<Dream[]>([]);
  const [selectedDream, setSelectedDream] = useState<Dream | null>(null);
  const [candidates, setCandidates] = useState<DreamCandidate[]>([]);
  const [query, setQuery] = useState('');
  const [iterationPrompt, setIterationPrompt] = useState('');
  const [variantType, setVariantType] = useState('research direction');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState<string | null>(null);

  const refreshDreams = async (nextSelectedId?: string) => {
    const payload = await sendMemoryAction<{ dreams?: Dream[] }>('list-dreams', {
      includeSources: true,
      limit: 20
    });
    const nextDreams = payload?.dreams || [];
    setDreams(nextDreams);

    const selectedId = nextSelectedId || selectedDream?.id;
    const nextSelected = selectedId
      ? nextDreams.find(dream => dream.id === selectedId) || null
      : nextDreams[0] || null;
    setSelectedDream(nextSelected);
  };

  useEffect(() => {
    refreshDreams().catch(error => setStatus(error instanceof Error ? error.message : 'Unable to load dreams.'));
  }, []);

  const indexMemory = async () => {
    setLoading('index');
    setStatus('');

    try {
      let historyGranted = false;
      try {
        historyGranted = await chrome.permissions.contains({ permissions: ['history'] });
        if (!historyGranted) {
          historyGranted = await chrome.permissions.request({ permissions: ['history'] });
        }
      } catch (error) {
        console.warn('History permission unavailable:', error);
      }

      const payload = await sendMemoryAction<{
        entries?: number;
        formHistory?: { indexed?: number };
        browserHistory?: { indexed?: number };
      }>('index-all', {
        includeForms: true,
        includeHistory: historyGranted,
        days: 30,
        maxResults: 500
      });

      setStatus(`Indexed ${payload?.entries || 0} memory items.`);
      await refreshDreams();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to index memory.');
    } finally {
      setLoading(null);
    }
  };

  const extractDreams = async () => {
    setLoading('extract');
    setStatus('');

    try {
      await sendMemoryAction('index-all', {
        includeForms: true,
        includeHistory: false
      });

      const payload = await sendMemoryAction<{ dreams?: DreamCandidate[] }>('extract-dreams', {
        query,
        limit: 40,
        maxDreams: 6
      });
      const nextCandidates = payload?.dreams || [];
      setCandidates(nextCandidates);
      setStatus(nextCandidates.length ? `${nextCandidates.length} dream candidates ready.` : 'No dream candidates found yet.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to extract dreams.');
    } finally {
      setLoading(null);
    }
  };

  const saveCandidate = async (candidate: DreamCandidate) => {
    setLoading(candidate.title);
    setStatus('');

    try {
      const payload = await sendMemoryAction<{ dream?: Dream }>('create-dream', {
        title: candidate.title,
        description: candidate.description,
        sourceMemoryIds: candidate.sourceMemoryIds,
        tags: candidate.tags
      });
      setCandidates(prev => prev.filter(item => item.title !== candidate.title));
      await refreshDreams(payload?.dream?.id);
      setStatus('Dream saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to save dream.');
    } finally {
      setLoading(null);
    }
  };

  const createIteration = async () => {
    if (!selectedDream) return;
    setLoading('iteration');
    setStatus('');

    try {
      await sendMemoryAction('create-dream-iteration', {
        dreamId: selectedDream.id,
        variantType,
        prompt: iterationPrompt
      });
      setIterationPrompt('');
      await refreshDreams(selectedDream.id);
      setStatus('Iteration saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to create iteration.');
    } finally {
      setLoading(null);
    }
  };

  const deleteDream = async (dreamId: string) => {
    setLoading(dreamId);
    setStatus('');

    try {
      await sendMemoryAction('delete-dream', { dreamId });
      await refreshDreams();
      setStatus('Dream deleted.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to delete dream.');
    } finally {
      setLoading(null);
    }
  };

  const deleteIteration = async (iterationId: string) => {
    if (!selectedDream) return;
    setLoading(iterationId);
    setStatus('');

    try {
      await sendMemoryAction('delete-dream-iteration', {
        dreamId: selectedDream.id,
        iterationId
      });
      await refreshDreams(selectedDream.id);
      setStatus('Iteration deleted.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to delete iteration.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <section className="dreams-section">
      <div className="dreams-header">
        <div>
          <h2>Memory Dreams</h2>
          <p>{dreams.length} saved · {selectedDream?.sourceCount || 0} sources selected</p>
        </div>
        <button className="dreams-action" onClick={indexMemory} disabled={loading !== null}>
          {loading === 'index' ? 'Indexing' : 'Index'}
        </button>
      </div>

      <div className="dreams-query-row">
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="startup ideas, accelerator forms, design research"
        />
        <button onClick={extractDreams} disabled={loading !== null}>
          {loading === 'extract' ? 'Extracting' : 'Extract'}
        </button>
      </div>

      {status && <div className="dreams-status">{status}</div>}

      {candidates.length > 0 && (
        <div className="dream-candidates">
          {candidates.map(candidate => (
            <div className="dream-candidate" key={candidate.title}>
              <div>
                <strong>{candidate.title}</strong>
                <span>{candidate.sourceMemoryIds.length} sources · {Math.round(candidate.confidence * 100)}%</span>
              </div>
              <button onClick={() => saveCandidate(candidate)} disabled={loading !== null}>
                {loading === candidate.title ? 'Saving' : 'Save'}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="dreams-workspace">
        <div className="dreams-list" aria-label="Saved dreams">
          {dreams.length === 0 ? (
            <div className="dream-empty">No dreams saved yet.</div>
          ) : dreams.map(dream => (
            <button
              className={`dream-row ${selectedDream?.id === dream.id ? 'active' : ''}`}
              key={dream.id}
              onClick={() => setSelectedDream(dream)}
            >
              <span>{dream.title}</span>
              <small>{dream.sourceCount} sources · {dream.iterationCount} iterations · {formatDate(dream.updatedAt)}</small>
            </button>
          ))}
        </div>

        <div className="dream-detail">
          {selectedDream ? (
            <>
              <div className="dream-detail-head">
                <div>
                  <h3>{selectedDream.title}</h3>
                  <p>{selectedDream.description}</p>
                </div>
                <button className="ghost-button danger" onClick={() => deleteDream(selectedDream.id)} disabled={loading !== null}>
                  Delete
                </button>
              </div>

              <div className="dream-tags">
                {selectedDream.tags.slice(0, 8).map(tag => <span key={tag}>{tag}</span>)}
              </div>

              <div className="dream-columns">
                <div>
                  <h4>Evidence</h4>
                  <div className="evidence-list">
                    {(selectedDream.sources || []).slice(0, 5).map(source => (
                      <a key={source.id} href={source.url || '#'} target="_blank" rel="noreferrer" className="evidence-row">
                        <strong>{source.title}</strong>
                        <span>{source.domain || source.sourceType} · {source.date}</span>
                      </a>
                    ))}
                  </div>
                </div>

                <div>
                  <h4>Iterations</h4>
                  <div className="iteration-controls">
                    <select value={variantType} onChange={event => setVariantType(event.target.value)}>
                      <option value="research direction">Research direction</option>
                      <option value="application draft">Application draft</option>
                      <option value="pitch variant">Pitch variant</option>
                      <option value="content version">Content version</option>
                    </select>
                    <input
                      value={iterationPrompt}
                      onChange={event => setIterationPrompt(event.target.value)}
                      placeholder="sharper angle, bolder pitch, grant version"
                    />
                    <button onClick={createIteration} disabled={loading !== null}>
                      {loading === 'iteration' ? 'Saving' : 'Create'}
                    </button>
                  </div>

                  <div className="iteration-list">
                    {(selectedDream.iterations || []).map(iteration => (
                      <div className="iteration-row" key={iteration.id}>
                        <div>
                          <strong>{iteration.variantType}</strong>
                          <span>{formatDate(iteration.createdAt)}</span>
                        </div>
                        <p>{iteration.body.split('\n').slice(-1)[0]}</p>
                        <button onClick={() => deleteIteration(iteration.id)} disabled={loading !== null}>
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="dream-empty">Select a dream.</div>
          )}
        </div>
      </div>

      <style>{`
        .dreams-section {
          background: rgba(255, 255, 255, 0.14);
          border: 1px solid rgba(255, 255, 255, 0.22);
          border-radius: 16px;
          padding: 24px;
          backdrop-filter: blur(10px);
        }
        .dreams-header,
        .dream-detail-head,
        .dream-candidate,
        .iteration-row > div {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }
        .dreams-header h2,
        .dream-detail h3,
        .dream-detail h4 {
          margin: 0;
        }
        .dreams-header p,
        .dream-detail p,
        .dream-row small,
        .dream-candidate span,
        .evidence-row span,
        .iteration-row span,
        .iteration-row p {
          margin: 6px 0 0;
          color: rgba(255, 255, 255, 0.76);
          line-height: 1.45;
        }
        .dreams-query-row,
        .iteration-controls {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 10px;
          margin-top: 18px;
        }
        .iteration-controls {
          grid-template-columns: minmax(130px, 0.6fr) 1fr auto;
        }
        .dreams-query-row input,
        .iteration-controls input,
        .iteration-controls select {
          min-width: 0;
          border: 1px solid rgba(255, 255, 255, 0.24);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.12);
          color: white;
          padding: 11px 12px;
          font-size: 14px;
          outline: none;
        }
        .iteration-controls select {
          color-scheme: dark;
        }
        .dreams-query-row input::placeholder,
        .iteration-controls input::placeholder {
          color: rgba(255, 255, 255, 0.55);
        }
        .dreams-action,
        .dreams-query-row button,
        .dream-candidate button,
        .iteration-controls button,
        .ghost-button,
        .iteration-row button {
          border: 1px solid rgba(255, 255, 255, 0.24);
          border-radius: 8px;
          background: white;
          color: #2b1759;
          cursor: pointer;
          font-weight: 700;
          min-height: 40px;
          padding: 0 14px;
        }
        .ghost-button,
        .iteration-row button {
          background: transparent;
          color: white;
        }
        .danger {
          border-color: rgba(255, 138, 128, 0.55);
          color: #ffd7d2;
        }
        button:disabled {
          cursor: wait;
          opacity: 0.65;
        }
        .dreams-status {
          margin-top: 12px;
          color: rgba(255, 255, 255, 0.84);
          font-size: 13px;
        }
        .dream-candidates {
          display: grid;
          gap: 10px;
          margin-top: 16px;
        }
        .dream-candidate {
          padding: 12px 0;
          border-top: 1px solid rgba(255, 255, 255, 0.15);
        }
        .dream-candidate strong,
        .dream-candidate span {
          display: block;
        }
        .dreams-workspace {
          display: grid;
          grid-template-columns: minmax(230px, 0.8fr) minmax(0, 2fr);
          gap: 22px;
          margin-top: 22px;
        }
        .dreams-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-width: 0;
        }
        .dream-row {
          text-align: left;
          border: 1px solid transparent;
          border-radius: 8px;
          background: transparent;
          color: white;
          padding: 12px;
          cursor: pointer;
        }
        .dream-row.active,
        .dream-row:hover {
          border-color: rgba(255, 255, 255, 0.24);
          background: rgba(255, 255, 255, 0.1);
        }
        .dream-row span,
        .dream-row small {
          display: block;
        }
        .dream-detail {
          min-width: 0;
        }
        .dream-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin: 14px 0 18px;
        }
        .dream-tags span {
          border: 1px solid rgba(255, 255, 255, 0.22);
          border-radius: 999px;
          color: rgba(255, 255, 255, 0.88);
          font-size: 12px;
          padding: 5px 9px;
        }
        .dream-columns {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }
        .evidence-list,
        .iteration-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 12px;
        }
        .evidence-row {
          border-top: 1px solid rgba(255, 255, 255, 0.14);
          color: white;
          display: block;
          padding-top: 10px;
          text-decoration: none;
        }
        .evidence-row strong,
        .evidence-row span {
          display: block;
        }
        .iteration-row {
          border-top: 1px solid rgba(255, 255, 255, 0.14);
          padding-top: 10px;
        }
        .iteration-row p {
          font-size: 13px;
        }
        .dream-empty {
          color: rgba(255, 255, 255, 0.72);
          padding: 16px 0;
        }
        @media (max-width: 900px) {
          .dreams-workspace,
          .dream-columns,
          .iteration-controls {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
};

export default DreamsSection;
