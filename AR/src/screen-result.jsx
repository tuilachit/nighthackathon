// Result screen — product spec + 3D preview + AR launch + Build Pack link
function ScreenResult({ product, onBack, onAR, onBuildPack, accent }) {
  const [rotate, setRotate] = React.useState(0);

  React.useEffect(() => {
    const id = setInterval(() => setRotate(r => (r + 0.4) % 360), 30);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ paddingBottom: 80, display: 'flex', flexDirection: 'column' }}>
      {/* Sticky top bar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        padding: '58px 16px 10px',
        background: 'rgba(248,250,252,0.85)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: '1px solid rgba(226,232,240,0.6)',
      }}>
        <button onClick={onBack} style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'var(--panel)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}>
          <Icon.ChevronLeft size={16}/>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mono" style={{ fontSize: 10, color: 'var(--muted)' }}>/result/{product.id}</div>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.2, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{product.name}</div>
        </div>
        <div style={{
          padding: '4px 8px', borderRadius: 6, background: '#ECFDF5',
          color: 'var(--success)', fontSize: 10, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 4,
          border: '1px solid #A7F3D0',
        }}>
          <Icon.Dot size={6} color="var(--success)"/>
          READY
        </div>
      </div>

      <div style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* 3D preview */}
        <div style={{
          borderRadius: 'var(--r)',
          background: 'linear-gradient(180deg, #F1F5F9 0%, #E2E8F0 100%)',
          border: '1px solid var(--border)',
          height: 260, position: 'relative', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {/* grid floor */}
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: 'linear-gradient(rgba(15,23,42,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.06) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
            transform: 'perspective(400px) rotateX(60deg) translateY(40%) scale(2)',
            transformOrigin: 'center bottom',
            opacity: 0.5,
          }}/>
          <div style={{ transform: `rotateY(${rotate}deg)`, transformStyle: 'preserve-3d' }}>
            <Product3D category={product.category} size={170} accent={accent}/>
          </div>
          {/* corner labels */}
          <div className="mono" style={{ position: 'absolute', top: 10, left: 12, fontSize: 9, color: 'var(--muted)', letterSpacing: 0.5 }}>
            FALLBACK · {product.category}.glb
          </div>
          <div className="mono" style={{ position: 'absolute', top: 10, right: 12, fontSize: 9, color: 'var(--muted)', letterSpacing: 0.5 }}>
            {Math.round(rotate)}°
          </div>
          <div style={{ position: 'absolute', bottom: 10, left: 12, right: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="mono" style={{ fontSize: 9, color: 'var(--muted)' }}>tap and drag to orbit</div>
            <div style={{
              padding: '4px 8px', borderRadius: 4, background: '#fff',
              border: '1px solid var(--border)', fontSize: 10, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <Icon.Cube size={10}/>
              <span className="mono">.glb</span>
            </div>
          </div>
        </div>

        {/* AR launch button */}
        <button onClick={onAR} style={{
          width: '100%', padding: '14px', borderRadius: 'var(--r)',
          background: '#0F172A', color: '#fff',
          border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer',
          fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: '0 6px 20px rgba(15,23,42,0.25)',
        }}>
          <Icon.Cube size={16} color="#fff"/>
          View in AR
          <Icon.ArrowRight size={16} color="#fff"/>
        </button>

        {/* Spec card */}
        <div style={{
          background: 'var(--panel)', borderRadius: 'var(--r)',
          border: '1px solid var(--border)', overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon.Sparkle size={14} color={accent}/>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Product spec</div>
            <div className="mono" style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--muted)' }}>
              product.config.json
            </div>
          </div>
          <SpecRow label="Category" value={product.category}/>
          <SpecRow label="Shape" value={product.shape}/>
          <SpecRow label="Materials" value={product.materials.join(' · ')}/>
          <SpecRow label="Intended use" value={product.intendedUse}/>
        </div>

        {/* Features */}
        <div style={{
          background: 'var(--panel)', borderRadius: 'var(--r)',
          border: '1px solid var(--border)', padding: '12px 14px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
            Key features
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {product.features.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 18, height: 18, borderRadius: 9, background: '#EFF6FF',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Icon.Check size={10} color={accent}/>
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.35 }}>{f}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Refined prompt */}
        <div style={{
          background: '#0F172A', borderRadius: 'var(--r)',
          padding: '12px 14px', color: '#E2E8F0',
        }}>
          <div className="mono" style={{ fontSize: 10, color: '#94A3B8', marginBottom: 6, letterSpacing: 0.5 }}>
            REFINED 3D PROMPT
          </div>
          <div className="mono" style={{ fontSize: 11, lineHeight: 1.55, color: '#E2E8F0' }}>
            "{product.refinedPrompt}"
          </div>
        </div>

        {/* Build pack link */}
        <button onClick={onBuildPack} style={{
          width: '100%', padding: '14px', borderRadius: 'var(--r)',
          background: 'var(--panel)', color: 'var(--text)',
          border: '1px solid var(--border)',
          fontSize: 14, fontWeight: 600, cursor: 'pointer',
          fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6, background: '#0F172A',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon.Code size={14} color="#fff"/>
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Codex Build Pack</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>6 generated files · ready to deploy</div>
            </div>
          </div>
          <Icon.ArrowRight size={16}/>
        </button>
      </div>
    </div>
  );
}

function SpecRow({ label, value }) {
  return (
    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, minWidth: 80, paddingTop: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.4, flex: 1 }}>{value}</div>
    </div>
  );
}

window.ScreenResult = ScreenResult;
