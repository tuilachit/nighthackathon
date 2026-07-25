// Create screen — camera upload, prompt input, examples, generate CTA
function ScreenCreate({ state, setState, onGenerate, accent }) {
  const fileRef = React.useRef();

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => setState(s => ({ ...s, sketchPreview: ev.target.result }));
    reader.readAsDataURL(f);
  };

  const useFakeSketch = (i) => {
    setState(s => ({ ...s, sketchPreview: `__fake_${i}` }));
  };

  return (
    <div style={{ padding: '64px 20px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: `linear-gradient(135deg, ${accent}, #1E40AF)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon.Cube size={16} color="#fff"/>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.2 }}>Reality MVP</div>
          <div className="mono" style={{
            fontSize: 10, padding: '3px 6px', borderRadius: 4,
            background: '#F1F5F9', color: '#64748B', marginLeft: 'auto',
            border: '1px solid var(--border)',
          }}>v0.1 · codex</div>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: '8px 0 4px', letterSpacing: -0.6, lineHeight: 1.15 }}>
          Sketch a product.
          <br/>
          <span style={{ color: accent }}>Walk around it.</span>
        </h1>
        <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.45 }}>
          Snap a sketch, describe your idea — Codex spins up the spatial prototype, Build Pack and all.
        </div>
      </div>

      {/* Upload area */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
          1 · Sketch
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: 'none' }}/>
        {!state.sketchPreview ? (
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              border: '1.5px dashed #CBD5E1',
              borderRadius: 'var(--r)',
              background: 'var(--panel)',
              padding: '22px 16px',
              display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
              transition: 'all 0.15s',
            }}>
            <div style={{
              width: 48, height: 48, borderRadius: 'var(--r)',
              background: '#EFF6FF', color: accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Icon.Camera size={22} color={accent}/>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Capture or upload a sketch</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                Phone camera · or drop a JPG / PNG
              </div>
            </div>
            <Icon.Upload size={18} color="var(--muted)"/>
          </div>
        ) : (
          <div style={{
            borderRadius: 'var(--r)',
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            padding: 8,
            display: 'flex', gap: 12, alignItems: 'center',
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: 6, overflow: 'hidden',
              background: '#F1F5F9', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {state.sketchPreview.startsWith('__fake_') ? (
                <FakeSketch n={parseInt(state.sketchPreview.split('_')[2]) || 0}/>
              ) : (
                <img src={state.sketchPreview} alt="sketch" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: 8, background: 'var(--success)' }}>
                  <Icon.Check size={10} color="#fff"/>
                </span>
                Sketch ready
              </div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                sketch_{Date.now().toString().slice(-6)}.jpg
              </div>
            </div>
            <button
              onClick={() => setState(s => ({ ...s, sketchPreview: null }))}
              style={{
                width: 28, height: 28, borderRadius: 6,
                border: 'none', background: '#F1F5F9', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              <Icon.X size={12} color="var(--muted)"/>
            </button>
          </div>
        )}
        {!state.sketchPreview && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {[0, 1, 2].map(i => (
              <button key={i} onClick={() => useFakeSketch(i)} style={{
                flex: 1, padding: '6px 8px', borderRadius: 6,
                border: '1px solid var(--border)', background: 'var(--panel)',
                fontSize: 11, color: 'var(--muted)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                fontFamily: 'inherit',
              }}>
                <Icon.Image size={12} color="var(--muted)"/>
                Demo {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Prompt */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
          2 · Describe it
        </div>
        <div style={{
          borderRadius: 'var(--r)',
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          padding: '12px 14px',
        }}>
          <textarea
            value={state.prompt}
            onChange={e => setState(s => ({ ...s, prompt: e.target.value }))}
            placeholder="A smart water bottle for gym users that glows when hydration is low."
            rows={3}
            style={{
              width: '100%', border: 'none', outline: 'none', resize: 'none',
              fontFamily: 'inherit', fontSize: 14, lineHeight: 1.45, color: 'var(--text)',
              background: 'transparent',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
            <div className="mono" style={{ fontSize: 10, color: 'var(--muted)' }}>
              {state.prompt.length} chars
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>cmd+↵ to generate</div>
          </div>
        </div>

        {/* example chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {EXAMPLE_CHIPS.map((chip, i) => {
            const active = state.prompt === chip;
            return (
              <button key={i} onClick={() => setState(s => ({ ...s, prompt: chip }))} style={{
                padding: '6px 10px', borderRadius: 999,
                border: `1px solid ${active ? accent : 'var(--border)'}`,
                background: active ? '#EFF6FF' : 'var(--panel)',
                color: active ? accent : 'var(--text)',
                fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}>
                {chip}
              </button>
            );
          })}
        </div>
      </div>

      {/* Generate button */}
      <button
        onClick={onGenerate}
        disabled={!state.prompt}
        style={{
          width: '100%', padding: '14px',
          borderRadius: 'var(--r)', border: 'none',
          background: state.prompt ? accent : '#CBD5E1',
          color: '#fff', fontSize: 15, fontWeight: 600,
          cursor: state.prompt ? 'pointer' : 'not-allowed',
          fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: state.prompt ? `0 6px 20px ${accent}40` : 'none',
          transition: 'all 0.15s',
        }}>
        <Icon.Sparkle size={16} color="#fff"/>
        Generate Reality MVP
        <Icon.ArrowRight size={16} color="#fff"/>
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--muted)', justifyContent: 'center' }}>
        <Icon.Dot size={6} color="var(--success)"/>
        Codex agents online · Vercel deploy ready
      </div>
    </div>
  );
}

// Tiny generated sketch placeholder (looks hand-drawn)
function FakeSketch({ n = 0 }) {
  const sketches = [
    // Bottle
    <svg key="b" viewBox="0 0 64 64" width="100%" height="100%">
      <rect width="64" height="64" fill="#FAFAF7"/>
      <g stroke="#1E293B" strokeWidth="1" fill="none" strokeLinecap="round">
        <path d="M26 10 L 38 10 L 38 16 L 28 16 Z"/>
        <path d="M28 16 Q 22 22 22 30 L 22 50 Q 22 56 32 56 Q 42 56 42 50 L 42 30 Q 42 22 36 16"/>
        <path d="M22 38 L 42 38" strokeDasharray="1 1"/>
        <path d="M30 28 Q 31 31 30 34"/>
      </g>
    </svg>,
    // Lamp
    <svg key="l" viewBox="0 0 64 64" width="100%" height="100%">
      <rect width="64" height="64" fill="#FAFAF7"/>
      <g stroke="#1E293B" strokeWidth="1" fill="none" strokeLinecap="round">
        <ellipse cx="20" cy="54" rx="10" ry="3"/>
        <line x1="20" y1="52" x2="20" y2="30"/>
        <line x1="20" y1="30" x2="42" y2="22"/>
        <circle cx="46" cy="20" r="8"/>
        <circle cx="46" cy="20" r="5" strokeDasharray="1 1"/>
      </g>
    </svg>,
    // Device
    <svg key="d" viewBox="0 0 64 64" width="100%" height="100%">
      <rect width="64" height="64" fill="#FAFAF7"/>
      <g stroke="#1E293B" strokeWidth="1" fill="none" strokeLinecap="round">
        <rect x="14" y="12" width="32" height="44" rx="5"/>
        <rect x="18" y="16" width="24" height="28" rx="2"/>
        <circle cx="50" cy="32" r="3"/>
        <text x="22" y="32" fontSize="6" fill="#1E293B" stroke="none" fontFamily="monospace">98</text>
      </g>
    </svg>,
  ];
  return sketches[n % sketches.length];
}

window.ScreenCreate = ScreenCreate;
window.FakeSketch = FakeSketch;
