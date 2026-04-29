// AR view — simulated camera feed + product overlay with feature callouts
function ScreenAR({ product, onBack, accent }) {
  const [placed, setPlaced] = React.useState(false);
  const [scale, setScale] = React.useState(1);
  const [rotate, setRotate] = React.useState(15);

  React.useEffect(() => {
    if (!placed) return;
    const id = setInterval(() => setRotate(r => (r + 0.3) % 360), 40);
    return () => clearInterval(id);
  }, [placed]);

  return (
    <div style={{
      position: 'relative', height: '100%', overflow: 'hidden',
      background: '#0F172A',
    }}>
      {/* Fake camera feed — gradient + grain + faint room outline */}
      <FakeCameraFeed/>

      {/* Top control bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        padding: '60px 16px 12px',
        display: 'flex', alignItems: 'center', gap: 10,
        zIndex: 10,
        background: 'linear-gradient(180deg, rgba(0,0,0,0.45), transparent)',
      }}>
        <button onClick={onBack} style={{
          width: 36, height: 36, borderRadius: 18,
          background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon.ChevronLeft size={16} color="#fff"/>
        </button>
        <div style={{ flex: 1 }}>
          <div className="mono" style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', letterSpacing: 1 }}>WEBXR · SCENE-VIEWER · QUICK-LOOK</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{product.name}</div>
        </div>
        <div style={{
          padding: '6px 10px', borderRadius: 999,
          background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.4)',
          fontSize: 10, fontWeight: 600, color: '#6EE7B7',
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: '#10B981' }}/>
          AR LIVE
        </div>
      </div>

      {/* Reticle / placement state */}
      {!placed ? (
        <>
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)', zIndex: 5,
          }}>
            <Reticle accent={accent}/>
          </div>
          <div style={{
            position: 'absolute', bottom: 120, left: 0, right: 0, textAlign: 'center', zIndex: 5,
          }}>
            <div style={{
              display: 'inline-block', padding: '8px 14px', borderRadius: 999,
              background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)',
              color: '#fff', fontSize: 12, fontWeight: 500,
            }}>
              Move your phone, then tap to place
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Product placed in scene */}
          <div style={{
            position: 'absolute', left: '50%', top: '54%',
            transform: `translate(-50%, -50%) scale(${scale}) rotateY(${rotate}deg)`,
            zIndex: 5, transformStyle: 'preserve-3d',
            filter: 'drop-shadow(0 20px 30px rgba(0,0,0,0.5))',
          }}>
            <Product3D category={product.category} size={180} accent={accent}/>
          </div>

          {/* Feature callouts pointing at the product */}
          <CalloutPin
            feature={product.features[0]}
            top="32%" left="62%" anchor="left"
          />
          <CalloutPin
            feature={product.features[1]}
            top="62%" left="20%" anchor="right"
            delay={0.2}
          />
          <CalloutPin
            feature={product.features[2]}
            top="78%" left="65%" anchor="left"
            delay={0.4}
          />
        </>
      )}

      {/* Bottom controls */}
      <div style={{
        position: 'absolute', bottom: 24, left: 0, right: 0,
        padding: '0 16px',
        display: 'flex', flexDirection: 'column', gap: 10, zIndex: 10,
      }}>
        {placed && (
          <div style={{
            display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center',
            padding: '10px 14px', borderRadius: 12,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}>
            <ARControl label="−" onClick={() => setScale(s => Math.max(0.5, s - 0.1))}/>
            <div className="mono" style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', minWidth: 36, textAlign: 'center' }}>
              {scale.toFixed(2)}×
            </div>
            <ARControl label="+" onClick={() => setScale(s => Math.min(1.6, s + 0.1))}/>
            <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.15)', margin: '0 4px' }}/>
            <button onClick={() => { setPlaced(false); setScale(1); setRotate(15); }} style={{
              padding: '6px 10px', borderRadius: 8,
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
              color: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <Icon.Reload size={11} color="#fff"/>
              Re-place
            </button>
          </div>
        )}

        <button
          onClick={() => placed ? null : setPlaced(true)}
          style={{
            width: '100%', padding: '15px', borderRadius: 12,
            background: placed ? 'rgba(255,255,255,0.95)' : '#fff',
            color: placed ? '#0F172A' : '#0F172A',
            border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
          }}>
          {placed ? (
            <>
              <Icon.Check size={16} color="var(--success)"/>
              Placed in your space
            </>
          ) : (
            <>
              <Icon.Cube size={16}/>
              Tap to place product
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function ARControl({ label, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: 32, height: 32, borderRadius: 8,
      background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)',
      color: '#fff', fontSize: 18, cursor: 'pointer', fontFamily: 'inherit',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>{label}</button>
  );
}

function Reticle({ accent }) {
  return (
    <div style={{ position: 'relative', width: 120, height: 120 }}>
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="50" fill="none" stroke={accent} strokeWidth="2" strokeDasharray="4 4" opacity="0.7">
          <animateTransform attributeName="transform" type="rotate" from="0 60 60" to="360 60 60" dur="8s" repeatCount="indefinite"/>
        </circle>
        <circle cx="60" cy="60" r="32" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.5"/>
        <line x1="60" y1="48" x2="60" y2="72" stroke={accent} strokeWidth="2" strokeLinecap="round"/>
        <line x1="48" y1="60" x2="72" y2="60" stroke={accent} strokeWidth="2" strokeLinecap="round"/>
      </svg>
      <div className="mono" style={{
        position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
        fontSize: 9, color: '#fff', letterSpacing: 1,
        marginTop: 8, whiteSpace: 'nowrap',
      }}>SCANNING SURFACE</div>
    </div>
  );
}

function CalloutPin({ feature, top, left, anchor = 'left', delay = 0 }) {
  return (
    <div style={{
      position: 'absolute', top, left, zIndex: 6,
      transform: anchor === 'right' ? 'translateX(-100%)' : 'none',
      animation: `floatIn 0.5s ease-out ${delay}s both`,
    }}>
      <style>{`@keyframes floatIn { from { opacity: 0; transform: translateY(8px) ${anchor === 'right' ? 'translateX(-100%)' : ''} } }`}</style>
      <div style={{
        display: 'flex', alignItems: 'center',
        flexDirection: anchor === 'right' ? 'row-reverse' : 'row',
        gap: 6,
      }}>
        <div style={{
          width: 10, height: 10, borderRadius: 5,
          background: '#fff', border: '2px solid #2563EB',
          boxShadow: '0 0 0 4px rgba(37,99,235,0.25), 0 2px 6px rgba(0,0,0,0.3)',
          flexShrink: 0,
        }}/>
        <div style={{
          width: 30, height: 1, background: 'rgba(255,255,255,0.5)',
        }}/>
        <div style={{
          padding: '6px 10px', borderRadius: 8,
          background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#fff', fontSize: 11, fontWeight: 500,
          whiteSpace: 'nowrap', maxWidth: 140,
          overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{feature}</div>
      </div>
    </div>
  );
}

function FakeCameraFeed() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {/* faux room — wall + floor */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, #3B4252 0%, #4C566A 55%, #2E3440 56%, #1F2937 100%)',
      }}/>
      {/* light from a window */}
      <div style={{
        position: 'absolute', top: '-20%', right: '-10%',
        width: '60%', height: '70%',
        background: 'radial-gradient(ellipse at center, rgba(254,243,199,0.18), transparent 70%)',
        filter: 'blur(20px)',
      }}/>
      {/* floor lines (perspective) */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '44%',
        backgroundImage: `
          linear-gradient(transparent 96%, rgba(255,255,255,0.06) 96%),
          linear-gradient(90deg, transparent 98%, rgba(255,255,255,0.06) 98%)
        `,
        backgroundSize: '60px 60px',
        transform: 'perspective(300px) rotateX(60deg)',
        transformOrigin: 'bottom',
      }}/>
      {/* grain */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.18, mixBlendMode: 'overlay' }}>
        <filter id="noise"><feTurbulence baseFrequency="0.9" numOctaves="2"/></filter>
        <rect width="100%" height="100%" filter="url(#noise)"/>
      </svg>
      {/* viewfinder corners */}
      {[
        { top: 80, left: 16 }, { top: 80, right: 16 },
        { bottom: 100, left: 16 }, { bottom: 100, right: 16 },
      ].map((pos, i) => (
        <div key={i} style={{
          position: 'absolute', width: 22, height: 22,
          borderColor: 'rgba(255,255,255,0.5)',
          borderStyle: 'solid', borderWidth: 0,
          ...(pos.top !== undefined && { top: pos.top, borderTopWidth: 2 }),
          ...(pos.bottom !== undefined && { bottom: pos.bottom, borderBottomWidth: 2 }),
          ...(pos.left !== undefined && { left: pos.left, borderLeftWidth: 2 }),
          ...(pos.right !== undefined && { right: pos.right, borderRightWidth: 2 }),
        }}/>
      ))}
    </div>
  );
}

window.ScreenAR = ScreenAR;
