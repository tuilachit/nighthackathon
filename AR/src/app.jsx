// App shell — orchestrates screens inside the iOS frame, plus tweaks panel

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "product": "bottle",
  "accent": "blue",
  "dark": false,
  "speed": 1,
  "showFrame": true
}/*EDITMODE-END*/;

const ACCENTS = {
  blue:   { name: 'Codex Blue',  color: '#2563EB' },
  violet: { name: 'Spatial',     color: '#7C3AED' },
  emerald:{ name: 'Reality',     color: '#059669' },
  amber:  { name: 'Sandbox',     color: '#D97706' },
};

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const accent = ACCENTS[tweaks.accent]?.color || '#2563EB';
  const product = PRODUCTS[tweaks.product] || PRODUCTS.bottle;

  // App state
  const [screen, setScreen] = React.useState('create'); // create | analyze | result | ar | buildpack
  const [createState, setCreateState] = React.useState({
    sketchPreview: null,
    prompt: product.prompt,
  });

  // Sync prompt when product changes
  React.useEffect(() => {
    setCreateState(s => ({ ...s, prompt: product.prompt }));
  }, [tweaks.product]);

  const goGenerate = () => setScreen('analyze');
  const onAnalyzed = () => setScreen('result');
  const goAR = () => setScreen('ar');
  const goBuildPack = () => setScreen('buildpack');
  const goBack = () => setScreen('result');
  const goHome = () => {
    setScreen('create');
    setCreateState({ sketchPreview: null, prompt: product.prompt });
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '40px 20px',
      flexDirection: 'column', gap: 24,
    }}>
      {/* Marketing band above device */}
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <div className="mono" style={{
          fontSize: 11, color: '#475569', letterSpacing: 1.5,
          marginBottom: 10, textTransform: 'uppercase',
        }}>
          Reality MVP · sketch → spatial prototype
        </div>
        <h1 style={{
          fontSize: 32, fontWeight: 700, margin: 0,
          letterSpacing: -0.8, lineHeight: 1.1, color: '#0F172A',
        }}>
          The runnable layer between<br/>an idea and an AR demo.
        </h1>
        <div style={{ fontSize: 14, color: '#475569', marginTop: 12, lineHeight: 1.5 }}>
          Codex generates the AR page, product config, agent contract, spec, validation plan,<br/>and submission readme — around your sketch.
        </div>
      </div>

      <Phone
        screen={screen}
        product={product}
        accent={accent}
        createState={createState}
        setCreateState={setCreateState}
        onGenerate={goGenerate}
        onAnalyzed={onAnalyzed}
        goAR={goAR}
        goBuildPack={goBuildPack}
        goBack={goBack}
        goHome={goHome}
        showFrame={tweaks.showFrame}
      />

      {/* Step indicator + reset */}
      <StepRail screen={screen} setScreen={setScreen} accent={accent}/>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Product">
          <TweakRadio
            label="Type"
            value={tweaks.product}
            onChange={v => setTweak('product', v)}
            options={[
              { value: 'bottle', label: 'Bottle' },
              { value: 'lamp',   label: 'Lamp' },
              { value: 'device', label: 'Device' },
            ]}
          />
        </TweakSection>
        <TweakSection label="Accent">
          <TweakSelect
            label="Theme"
            value={tweaks.accent}
            onChange={v => setTweak('accent', v)}
            options={Object.entries(ACCENTS).map(([k, v]) => ({ value: k, label: v.name }))}
          />
        </TweakSection>
        <TweakSection label="Stage">
          <TweakToggle label="Phone frame" value={tweaks.showFrame} onChange={v => setTweak('showFrame', v)}/>
        </TweakSection>
        <TweakSection label="Jump to step">
          {[
            ['create', '1 · Create'],
            ['analyze', '2 · Analyzing'],
            ['result', '3 · Result'],
            ['ar', '4 · View in AR'],
            ['buildpack', '5 · Build Pack'],
          ].map(([k, lbl]) => (
            <TweakButton key={k} label={`${lbl}${screen === k ? '  ←' : ''}`} onClick={() => setScreen(k)} secondary={screen !== k}/>
          ))}
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

function Phone({ screen, product, accent, createState, setCreateState, onGenerate, onAnalyzed, goAR, goBuildPack, goBack, goHome, showFrame }) {
  const isDark = screen === 'ar' || screen === 'buildpack';

  const content = (
    <>
      {screen === 'create' && (
        <ScreenCreate state={createState} setState={setCreateState} onGenerate={onGenerate} accent={accent}/>
      )}
      {screen === 'analyze' && (
        <ScreenAnalyze product={product} onDone={onAnalyzed} accent={accent}/>
      )}
      {screen === 'result' && (
        <ScreenResult product={product} onBack={goHome} onAR={goAR} onBuildPack={goBuildPack} accent={accent}/>
      )}
      {screen === 'ar' && (
        <ScreenAR product={product} onBack={goBack} accent={accent}/>
      )}
      {screen === 'buildpack' && (
        <ScreenBuildPack product={product} onBack={goBack} accent={accent}/>
      )}
    </>
  );

  if (!showFrame) {
    return (
      <div style={{
        width: 402, height: 874, borderRadius: 24,
        overflow: 'hidden', position: 'relative',
        background: isDark ? '#0F172A' : 'var(--bg)',
        boxShadow: '0 30px 60px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)',
      }} data-screen-label={`Reality MVP · ${screen}`}>
        <div style={{ height: '100%', overflow: 'auto' }} className="noscroll">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div data-screen-label={`Reality MVP · ${screen}`}>
      <IOSDevice dark={isDark}>
        {content}
      </IOSDevice>
    </div>
  );
}

function StepRail({ screen, setScreen, accent }) {
  const steps = [
    { id: 'create',    label: 'Create' },
    { id: 'analyze',   label: 'Analyze' },
    { id: 'result',    label: 'Result' },
    { id: 'ar',        label: 'AR' },
    { id: 'buildpack', label: 'Build Pack' },
  ];
  const idx = steps.findIndex(s => s.id === screen);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 0,
      background: '#fff', borderRadius: 999,
      padding: 4, border: '1px solid var(--border)',
      boxShadow: '0 4px 16px rgba(15,23,42,0.06)',
    }}>
      {steps.map((s, i) => {
        const active = i === idx;
        const done = i < idx;
        return (
          <React.Fragment key={s.id}>
            <button onClick={() => setScreen(s.id)} style={{
              padding: '8px 14px', borderRadius: 999,
              border: 'none', cursor: 'pointer',
              background: active ? accent : 'transparent',
              color: active ? '#fff' : (done ? 'var(--text)' : 'var(--muted)'),
              fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span className="mono" style={{ fontSize: 10, opacity: 0.7 }}>{i + 1}</span>
              {s.label}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
