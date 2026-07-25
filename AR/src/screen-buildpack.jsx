// Build Pack — VS Code-style file browser shown in a faux desktop window
function ScreenBuildPack({ product, onBack, accent }) {
  const [activeIdx, setActiveIdx] = React.useState(0);
  const [openTabs, setOpenTabs] = React.useState([0]);
  const [revealed, setRevealed] = React.useState(0);

  // Reveal files one by one (Codex generating live)
  React.useEffect(() => {
    if (revealed >= BUILD_PACK_FILES.length) return;
    const t = setTimeout(() => setRevealed(r => r + 1), 350);
    return () => clearTimeout(t);
  }, [revealed]);

  const openFile = (i) => {
    setActiveIdx(i);
    setOpenTabs(t => t.includes(i) ? t : [...t, i]);
  };

  const closeTab = (i, e) => {
    e.stopPropagation();
    const newTabs = openTabs.filter(x => x !== i);
    setOpenTabs(newTabs);
    if (activeIdx === i) setActiveIdx(newTabs[0] ?? 0);
  };

  const file = BUILD_PACK_FILES[activeIdx];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#0F172A', color: '#E2E8F0' }}>
      {/* Top header */}
      <div style={{
        padding: '54px 14px 10px',
        background: '#0B1220',
        borderBottom: '1px solid #1E293B',
        display: 'flex', alignItems: 'center', gap: 8,
        position: 'relative', zIndex: 60,
      }}>
        <button onClick={onBack} style={{
          width: 30, height: 30, borderRadius: 6,
          background: '#1E293B', border: '1px solid #334155',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}>
          <Icon.ChevronLeft size={14} color="#E2E8F0"/>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mono" style={{ fontSize: 9, color: '#64748B', letterSpacing: 0.5 }}>/build-pack/{product.id}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon.Code size={13} color={accent}/>
            Codex Build Pack
          </div>
        </div>
        <div className="mono" style={{
          padding: '4px 8px', borderRadius: 4, background: 'rgba(37,99,235,0.15)',
          border: '1px solid rgba(37,99,235,0.3)', color: '#93C5FD',
          fontSize: 10, fontWeight: 600, letterSpacing: 0.5,
        }}>
          {revealed}/{BUILD_PACK_FILES.length}
        </div>
      </div>

      {/* Codex banner */}
      <div style={{
        padding: '12px 14px', background: 'linear-gradient(90deg, rgba(37,99,235,0.12), rgba(37,99,235,0.04))',
        borderBottom: '1px solid #1E293B',
      }}>
        <div className="mono" style={{ fontSize: 9, color: '#60A5FA', letterSpacing: 1, marginBottom: 4 }}>
          ⌘ CODEX-GENERATED LAYER
        </div>
        <div style={{ fontSize: 12, color: '#CBD5E1', lineHeight: 1.5 }}>
          Reality MVP isn't just a 3D viewer — Codex generates the runnable Next.js app around your product idea.
        </div>
      </div>

      {/* File explorer */}
      <div style={{ borderBottom: '1px solid #1E293B', maxHeight: 180, overflow: 'auto' }} className="noscroll">
        <div style={{ padding: '8px 14px 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon.Folder size={12} color="#94A3B8"/>
          <div className="mono" style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600 }}>reality-mvp/</div>
        </div>
        {BUILD_PACK_FILES.map((f, i) => {
          const isRevealed = i < revealed;
          const isActive = activeIdx === i && openTabs.includes(i);
          return (
            <div
              key={i}
              onClick={() => isRevealed && openFile(i)}
              style={{
                padding: '6px 14px 6px 24px',
                display: 'flex', alignItems: 'center', gap: 8,
                cursor: isRevealed ? 'pointer' : 'default',
                background: isActive ? 'rgba(37,99,235,0.15)' : 'transparent',
                opacity: isRevealed ? 1 : 0.35,
                borderLeft: isActive ? `2px solid ${accent}` : '2px solid transparent',
                animation: isRevealed && i === revealed - 1 ? 'fileIn 0.3s ease-out' : 'none',
              }}>
              <FileIcon kind={f.icon}/>
              <div className="mono" style={{ fontSize: 11, color: isActive ? '#F8FAFC' : '#CBD5E1', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.path}
              </div>
              {isRevealed ? (
                <div style={{
                  fontSize: 9, padding: '1px 4px', borderRadius: 3,
                  background: 'rgba(16,185,129,0.15)', color: '#6EE7B7',
                  fontWeight: 600,
                }}>NEW</div>
              ) : (
                <div style={{ width: 10, height: 10 }}>
                  <div style={{
                    width: '100%', height: '100%', borderRadius: 5,
                    border: `1.5px solid ${accent}`, borderTopColor: 'transparent',
                    animation: 'spin 0.8s linear infinite',
                  }}/>
                </div>
              )}
            </div>
          );
        })}
        <style>{`
          @keyframes spin { to { transform: rotate(360deg) } }
          @keyframes fileIn { from { transform: translateX(-6px); opacity: 0 } }
        `}</style>
      </div>

      {/* Tabs */}
      {openTabs.length > 0 && (
        <div style={{
          display: 'flex', overflowX: 'auto', background: '#0B1220',
          borderBottom: '1px solid #1E293B', flexShrink: 0,
        }} className="noscroll">
          {openTabs.map(i => {
            const f = BUILD_PACK_FILES[i];
            const active = i === activeIdx;
            return (
              <div key={i} onClick={() => setActiveIdx(i)} style={{
                padding: '8px 10px 8px 12px',
                display: 'flex', alignItems: 'center', gap: 6,
                background: active ? '#0F172A' : 'transparent',
                borderRight: '1px solid #1E293B',
                cursor: 'pointer',
                borderTop: active ? `2px solid ${accent}` : '2px solid transparent',
                flexShrink: 0,
              }}>
                <FileIcon kind={f.icon}/>
                <div className="mono" style={{ fontSize: 10.5, color: active ? '#F8FAFC' : '#94A3B8' }}>
                  {f.path.split('/').pop()}
                </div>
                <button onClick={(e) => closeTab(i, e)} style={{
                  width: 16, height: 16, borderRadius: 3, border: 'none', padding: 0,
                  background: 'transparent', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon.X size={10} color="#64748B"/>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* File content */}
      <div style={{ flex: 1, overflow: 'auto', background: '#0F172A' }} className="noscroll">
        {file && (
          <>
            <div style={{
              padding: '10px 14px', borderBottom: '1px solid #1E293B',
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#0B1220',
            }}>
              <FileIcon kind={file.icon}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="mono" style={{ fontSize: 10.5, color: '#F8FAFC', fontWeight: 600 }}>{file.path}</div>
                <div style={{ fontSize: 10, color: '#64748B', marginTop: 1 }}>{file.description}</div>
              </div>
            </div>
            <CodeBlock content={file.body} lang={file.lang}/>
          </>
        )}
      </div>

      {/* Bottom status bar */}
      <div style={{
        padding: '6px 12px 22px',
        background: '#0B1220', borderTop: '1px solid #1E293B',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        <div className="mono" style={{ fontSize: 9, color: '#10B981', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon.Dot size={6} color="#10B981"/>
          vercel ready
        </div>
        <div className="mono" style={{ fontSize: 9, color: '#64748B' }}>·</div>
        <div className="mono" style={{ fontSize: 9, color: '#94A3B8' }}>next.js · ts · tailwind</div>
        <div className="mono" style={{ fontSize: 9, color: '#94A3B8', marginLeft: 'auto' }}>UTF-8</div>
      </div>
    </div>
  );
}

function FileIcon({ kind }) {
  const colors = { tsx: '#60A5FA', json: '#F59E0B', md: '#94A3B8' };
  const labels = { tsx: 'TSX', json: 'JSON', md: 'MD' };
  return (
    <div className="mono" style={{
      fontSize: 8, fontWeight: 700, padding: '2px 4px', borderRadius: 3,
      background: `${colors[kind]}20`, color: colors[kind], letterSpacing: 0.3,
      flexShrink: 0,
    }}>
      {labels[kind]}
    </div>
  );
}

// Minimal syntax-aware code block
function CodeBlock({ content, lang }) {
  const lines = content.split('\n');
  return (
    <div style={{ padding: '10px 0', minHeight: '100%' }}>
      {lines.map((line, i) => (
        <div key={i} style={{ display: 'flex', minHeight: 18 }}>
          <div className="mono" style={{
            width: 32, textAlign: 'right', paddingRight: 12,
            fontSize: 10.5, color: '#475569', userSelect: 'none', flexShrink: 0,
          }}>{i + 1}</div>
          <div className="mono" style={{
            fontSize: 11, lineHeight: '18px', color: '#E2E8F0',
            whiteSpace: 'pre', paddingRight: 14, minWidth: 0,
          }}>
            {colorize(line, lang)}
          </div>
        </div>
      ))}
    </div>
  );
}

function colorize(line, lang) {
  // Very small token-coloring — tuned for tsx/json/md, no full parser
  if (lang === 'md') {
    if (line.startsWith('# ')) return <span style={{ color: '#93C5FD', fontWeight: 600 }}>{line}</span>;
    if (line.startsWith('## ')) return <span style={{ color: '#60A5FA', fontWeight: 600 }}>{line}</span>;
    if (line.startsWith('- ')) return <span><span style={{ color: '#F472B6' }}>- </span><span>{line.slice(2)}</span></span>;
    if (line.startsWith('> ')) return <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>{line}</span>;
    if (line.startsWith('```')) return <span style={{ color: '#64748B' }}>{line}</span>;
    return <span>{line}</span>;
  }

  const tokens = [];
  let rest = line;
  // strings
  const stringRe = /"([^"\\]|\\.)*"/;
  // keywords
  const kwRe = /\b(import|from|export|default|async|await|function|return|const|let|var|if|else|notFound|new)\b/;

  while (rest.length) {
    const sMatch = rest.match(stringRe);
    const kMatch = rest.match(kwRe);

    let next = null;
    if (sMatch && (!kMatch || sMatch.index <= kMatch.index)) next = { type: 'str', match: sMatch };
    else if (kMatch) next = { type: 'kw', match: kMatch };

    if (!next) {
      tokens.push(<span key={tokens.length}>{rest}</span>);
      break;
    }
    if (next.match.index > 0) {
      tokens.push(<span key={tokens.length}>{rest.slice(0, next.match.index)}</span>);
    }
    const word = next.match[0];
    const color = next.type === 'str' ? '#86EFAC' : '#C4B5FD';
    tokens.push(<span key={tokens.length} style={{ color }}>{word}</span>);
    rest = rest.slice(next.match.index + word.length);
  }
  return tokens;
}

window.ScreenBuildPack = ScreenBuildPack;
