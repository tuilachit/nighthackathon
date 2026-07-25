// Analyze screen — animated pipeline as Codex agents process the input
function ScreenAnalyze({ product, onDone, accent }) {
  const steps = [
    { label: 'sketch-analyzer', detail: 'reading sketch + prompt' },
    { label: 'spec-writer', detail: 'extracting shape, materials, features' },
    { label: 'model-resolver', detail: `matching category → ${product.category}.glb` },
    { label: 'ar-shell', detail: 'wiring <model-viewer> with ar-modes' },
    { label: 'docs-writer', detail: 'AGENTS.md · MVP_SPEC.md · README.md' },
  ];
  const [stepIdx, setStepIdx] = React.useState(0);

  React.useEffect(() => {
    if (stepIdx >= steps.length) {
      const t = setTimeout(onDone, 500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStepIdx(i => i + 1), 700);
    return () => clearTimeout(t);
  }, [stepIdx]);

  return (
    <div style={{ padding: '64px 20px 24px', display: 'flex', flexDirection: 'column', gap: 18, height: '100%' }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: accent, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
          Generating reality
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: -0.4, lineHeight: 1.2 }}>
          Codex is building your prototype.
        </h2>
      </div>

      {/* Animated dot grid scanning the sketch */}
      <div style={{
        position: 'relative', borderRadius: 'var(--r)',
        background: 'var(--panel)', border: '1px solid var(--border)',
        padding: 16, display: 'flex', justifyContent: 'center', alignItems: 'center',
        height: 140, overflow: 'hidden',
      }}>
        <Product3D category={product.category} size={120} accent={accent}/>
        <div style={{
          position: 'absolute', left: 0, right: 0, top: 0, height: 2,
          background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
          animation: 'scanline 2.4s linear infinite',
        }}/>
        <style>{`
          @keyframes scanline {
            0% { transform: translateY(0) }
            100% { transform: translateY(140px) }
          }
        `}</style>
      </div>

      {/* Step list */}
      <div style={{
        background: 'var(--panel)', borderRadius: 'var(--r)',
        border: '1px solid var(--border)', overflow: 'hidden',
      }}>
        {steps.map((s, i) => {
          const done = i < stepIdx;
          const active = i === stepIdx;
          return (
            <div key={i} style={{
              padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
              borderBottom: i < steps.length - 1 ? '1px solid var(--border)' : 'none',
              opacity: done || active ? 1 : 0.4,
              transition: 'opacity 0.3s',
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: 9,
                background: done ? 'var(--success)' : (active ? '#EFF6FF' : '#F1F5F9'),
                border: active ? `1.5px solid ${accent}` : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {done && <Icon.Check size={10} color="#fff"/>}
                {active && <div style={{
                  width: 6, height: 6, borderRadius: 3, background: accent,
                  animation: 'pulse 1s ease-in-out infinite',
                }}/>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{s.label}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{s.detail}</div>
              </div>
              {active && <div className="mono" style={{ fontSize: 10, color: accent }}>RUN</div>}
              {done && <div className="mono" style={{ fontSize: 10, color: 'var(--success)' }}>OK</div>}
            </div>
          );
        })}
        <style>{`@keyframes pulse { 50% { opacity: 0.3 } }`}</style>
      </div>

      <div className="mono" style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', marginTop: 'auto' }}>
        agents@codex · {Math.min(stepIdx, steps.length)}/{steps.length} done
      </div>
    </div>
  );
}

window.ScreenAnalyze = ScreenAnalyze;
