import { motion } from "motion/react";
import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import birthdayPersonImg from "../imports/birthday_person_nobg.png";

// ── Palette ──────────────────────────────────────────────────────────────────
const NEON   = "#2563EB";
const NEON2  = "#1D4ED8";
const GLOW   = "rgba(37,99,235,0.55)";
const GLOW2  = "rgba(29,78,216,0.4)";

// ── Audio ─────────────────────────────────────────────────────────────────────
let _audioCtx: AudioContext | null = null;
function getAudio(): AudioContext {
  if (!_audioCtx || _audioCtx.state === 'closed') {
    _audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

function playBeep(freq: number, dur: number, vol = 0.28) {
  try {
    const ctx = getAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine'; osc.frequency.value = freq;
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t); osc.stop(t + dur + 0.05);
  } catch { /* audio blocked */ }
}

function playClickSound() {
  try {
    const ctx = getAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'square'; osc.frequency.value = 1600;
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.055, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
    osc.start(t); osc.stop(t + 0.07);
  } catch { /* audio blocked */ }
}

function playLandingSound() {
  try {
    const ctx = getAudio();
    const t = ctx.currentTime;
    // Low thud (noise burst through low-pass)
    const bufSize = Math.floor(ctx.sampleRate * 0.6);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass'; lpf.frequency.value = 90; lpf.Q.value = 2;
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0.9, t);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    src.connect(lpf); lpf.connect(g1); g1.connect(ctx.destination);
    src.start(t);
    // Metallic clank (resonant mid tone)
    const osc = ctx.createOscillator();
    const g2 = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = 280;
    g2.gain.setValueAtTime(0.28, t + 0.04);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(g2); g2.connect(ctx.destination);
    osc.start(t + 0.04); osc.stop(t + 0.55);
  } catch { /* audio blocked */ }
}

function startCartDrag(): () => void {
  try {
    const ctx = getAudio();
    const t = ctx.currentTime;
    const sr = ctx.sampleRate;

    // Noise buffer for scraping texture
    const bufSize = sr * 2;
    const buf = ctx.createBuffer(1, bufSize, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;

    // === Layer 1: mid-range scrape (dragging on surface) ===
    const scrapeSrc = ctx.createBufferSource();
    scrapeSrc.buffer = buf; scrapeSrc.loop = true;
    const bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass'; bpf.frequency.value = 260; bpf.Q.value = 2.2;
    const scrapeGain = ctx.createGain();
    scrapeGain.gain.setValueAtTime(0, t);
    scrapeGain.gain.linearRampToValueAtTime(0.22, t + 0.9);
    scrapeSrc.connect(bpf); bpf.connect(scrapeGain); scrapeGain.connect(ctx.destination);

    // === Layer 2: low rumble (weight/effort) ===
    const rumbleSrc = ctx.createBufferSource();
    rumbleSrc.buffer = buf; rumbleSrc.loop = true;
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass'; lpf.frequency.value = 100; lpf.Q.value = 1.0;
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.setValueAtTime(0, t);
    rumbleGain.gain.linearRampToValueAtTime(0.30, t + 0.9);
    rumbleSrc.connect(lpf); lpf.connect(rumbleGain); rumbleGain.connect(ctx.destination);

    // === Slow LFO: wheel bump rhythm (~1.6/s), not alarm-fast ===
    const lfo = ctx.createOscillator();
    lfo.type = 'sine'; lfo.frequency.value = 1.6;
    const lfoMod = ctx.createGain();
    lfoMod.gain.value = 0.08;
    lfo.connect(lfoMod); lfoMod.connect(scrapeGain.gain);

    scrapeSrc.start(t); rumbleSrc.start(t); lfo.start(t);

    return () => {
      try {
        const now = ctx.currentTime;
        [scrapeGain, rumbleGain].forEach(g => {
          g.gain.setValueAtTime(g.gain.value, now);
          g.gain.linearRampToValueAtTime(0, now + 0.3);
        });
        setTimeout(() => {
          try { scrapeSrc.stop(); rumbleSrc.stop(); lfo.stop(); } catch { /* stopped */ }
        }, 500);
      } catch { /* already closed */ }
    };
  } catch {
    return () => {};
  }
}

function startEngineRumble(vol = 0.5): () => void {
  try {
    const ctx = getAudio();
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(1, sr * 2, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass'; lpf.frequency.value = 160; lpf.Q.value = 1.4;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.7);
    src.connect(lpf); lpf.connect(gain); gain.connect(ctx.destination);
    src.start();
    return () => {
      try {
        const t = ctx.currentTime;
        gain.gain.setValueAtTime(gain.gain.value, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.5);
        setTimeout(() => { try { src.stop(); } catch { /* already stopped */ } }, 600);
      } catch { /* already closed */ }
    };
  } catch {
    return () => {};
  }
}

// 90s disco groove — lookahead scheduler, returns stop()
function startDiscoMusic(): () => void {
  try {
    const ctx = getAudio();
    let active = true;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.38, ctx.currentTime + 0.8);
    master.connect(ctx.destination);

    const BPM = 126;
    const EIGHTH = (60 / BPM) / 2;   // duration of one 8th note
    const AHEAD  = 0.25;              // schedule this many seconds ahead
    const CHECK  = 80;                // scheduler tick (ms)

    // 2-bar bass pattern (16 eighth notes), A-minor flavour
    const BASS: [number, number][] = [
      [55.0,  0.9], // A1
      [55.0,  0.5],
      [65.4,  0.9], // C2
      [82.4,  0.5], // E2
      [55.0,  0.9], // A1
      [49.0,  0.5], // G1
      [82.4,  0.9], // E2
      [55.0,  0.5],
      [55.0,  0.9],
      [55.0,  0.5],
      [73.4,  0.9], // D2
      [82.4,  0.5],
      [65.4,  0.9], // C2
      [49.0,  0.5],
      [55.0,  0.9],
      [55.0,  0.5],
    ];

    // Chord stabs on 8th-note beats 4 & 12 (bar beats 2 & 4)
    const STABS: Record<number, number[]> = {
      4:  [220.0, 261.6, 329.6], // Am: A3 C4 E4
      12: [196.0, 246.9, 293.7], // G:  G3 B3 D4
    };

    let nextTime = ctx.currentTime + 0.1;
    let step = 0;

    function scheduleStep(t: number, s: number) {
      const n = s % 16;           // position in 2-bar loop
      const beat = s % 8;         // position in 1-bar loop (8 eighth notes)
      const isOnBeat = n % 2 === 0;

      // ── Kick (4-on-the-floor) ───────────────────────────────────────────
      if (isOnBeat) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(master);
        o.frequency.setValueAtTime(160, t);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
        g.gain.setValueAtTime(1.0, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
        o.start(t); o.stop(t + 0.28);
      }

      // ── Snare (beats 2 & 4 → 8th positions 2 & 6) ──────────────────────
      if (beat === 2 || beat === 6) {
        const sr = ctx.sampleRate;
        const len = Math.floor(sr * 0.14);
        const buf = ctx.createBuffer(1, len, sr);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.045));
        const src = ctx.createBufferSource();
        const flt = ctx.createBiquadFilter();
        const g   = ctx.createGain();
        src.buffer = buf;
        flt.type = 'bandpass'; flt.frequency.value = 2400; flt.Q.value = 0.6;
        src.connect(flt); flt.connect(g); g.connect(master);
        g.gain.value = 0.55;
        src.start(t); src.stop(t + 0.14);
      }

      // ── Hi-hat (every 8th note, accented on beat) ───────────────────────
      {
        const sr = ctx.sampleRate;
        const len = Math.floor(sr * 0.042);
        const buf = ctx.createBuffer(1, len, sr);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        const flt = ctx.createBiquadFilter();
        const g   = ctx.createGain();
        src.buffer = buf;
        flt.type = 'highpass'; flt.frequency.value = 8000;
        src.connect(flt); flt.connect(g); g.connect(master);
        g.gain.setValueAtTime(isOnBeat ? 0.32 : 0.16, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.042);
        src.start(t); src.stop(t + 0.042);
      }

      // ── Bass (sawtooth, lowpass filtered) ──────────────────────────────
      {
        const [freq, vel] = BASS[n];
        const o   = ctx.createOscillator();
        const flt = ctx.createBiquadFilter();
        const g   = ctx.createGain();
        o.type = 'sawtooth';
        flt.type = 'lowpass'; flt.frequency.value = 340; flt.Q.value = 3.5;
        o.connect(flt); flt.connect(g); g.connect(master);
        o.frequency.value = freq;
        g.gain.setValueAtTime(vel * 0.55, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + EIGHTH * 0.8);
        o.start(t); o.stop(t + EIGHTH * 0.8);
      }

      // ── Chord stab ──────────────────────────────────────────────────────
      const stab = STABS[n];
      if (stab) {
        stab.forEach(freq => {
          const o   = ctx.createOscillator();
          const flt = ctx.createBiquadFilter();
          const g   = ctx.createGain();
          o.type = 'square';
          flt.type = 'bandpass'; flt.frequency.value = freq * 1.6; flt.Q.value = 2.5;
          o.connect(flt); flt.connect(g); g.connect(master);
          o.frequency.value = freq;
          g.gain.setValueAtTime(0.16, t + 0.008);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
          o.start(t + 0.008); o.stop(t + 0.14);
        });
      }
    }

    function tick() {
      if (!active) return;
      const horizon = ctx.currentTime + AHEAD;
      while (nextTime < horizon) {
        scheduleStep(nextTime, step);
        nextTime += EIGHTH;
        step++;
      }
      setTimeout(tick, CHECK);
    }
    tick();

    return () => {
      active = false;
      const t = ctx.currentTime;
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0, t + 0.45);
      setTimeout(() => { try { master.disconnect(); } catch { /* ignore */ } }, 600);
    };
  } catch {
    return () => {};
  }
}

// ── Stars ────────────────────────────────────────────────────────────────────
function Stars() {
  const stars = useMemo(() =>
    Array.from({ length: 90 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      r: 0.6 + Math.random() * 1.6,
      dur: 2 + Math.random() * 4,
      delay: Math.random() * 5,
      color: Math.random() > 0.7 ? "#60A5FA" : Math.random() > 0.5 ? "#93C5FD" : "#ffffff",
    })), []);
  return (
    <>
      {stars.map(s => (
        <motion.div key={s.id}
          style={{
            position: "absolute",
            left: `${s.x}%`, top: `${s.y}%`,
            width: s.r * 2, height: s.r * 2,
            borderRadius: "50%",
            background: s.color,
            boxShadow: `0 0 ${s.r * 3}px ${s.color}`,
          }}
          animate={{ opacity: [0.15, 1, 0.15], scale: [1, 1.6, 1] }}
          transition={{ duration: s.dur, repeat: Infinity, delay: s.delay, ease: "easeInOut" }}
        />
      ))}
    </>
  );
}

// ── Nebula orbs ───────────────────────────────────────────────────────────────
function Nebula() {
  return (
    <>
      <motion.div style={{
        position: "absolute", width: 600, height: 600, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(29,78,216,0.35) 0%, transparent 65%)",
        top: "-20%", left: "-15%", filter: "blur(70px)",
      }} animate={{ x:[0,60,-30,0], y:[0,-40,25,0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }} />

      <motion.div style={{
        position: "absolute", width: 500, height: 500, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(37,99,235,0.28) 0%, transparent 65%)",
        bottom: "-15%", right: "-10%", filter: "blur(70px)",
      }} animate={{ x:[0,-50,20,0], y:[0,40,-20,0] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut", delay: 3 }} />

      <motion.div style={{
        position: "absolute", width: 380, height: 380, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(59,130,246,0.2) 0%, transparent 65%)",
        top: "30%", right: "5%", filter: "blur(60px)",
      }} animate={{ x:[0,40,-50,0], y:[0,-50,30,0] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut", delay: 6 }} />

      <motion.div style={{
        position: "absolute", width: 300, height: 300, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(96,165,250,0.18) 0%, transparent 65%)",
        top: "10%", right: "25%", filter: "blur(50px)",
      }} animate={{ x:[0,-30,40,0], y:[0,30,-20,0] }}
        transition={{ duration: 13, repeat: Infinity, ease: "easeInOut", delay: 2 }} />
    </>
  );
}

// ── Confetti (purple/blue palette) ───────────────────────────────────────────
function Confetti() {
  const pieces = useMemo(() => Array.from({ length: 30 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    color: ["#60A5FA","#93C5FD","#3B82F6","#BFDBFE","#2563EB","#ffffff"][i % 6],
    size: 5 + Math.random() * 8,
    delay: Math.random() * 4,
    duration: 4 + Math.random() * 4,
    dx: (Math.random() - 0.5) * 100,
  })), []);
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {pieces.map(p => (
        <motion.div key={p.id} className="absolute rounded-sm"
          style={{ left: `${p.x}%`, top: -16, width: p.size, height: p.size * 0.5, background: p.color }}
          animate={{ y: ["0vh","110vh"], rotate: [0, 540], x: [0, p.dx] }}
          transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: "linear" }}
        />
      ))}
    </div>
  );
}

// ── Birthday Cake (space/neon theme) ─────────────────────────────────────────
function BirthdayCake() {
  return (
    <svg width="200" height="320" viewBox="0 -130 200 320" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* ── Card on a stick ── */}
      {/* Stick */}
      <rect x={98} y={-18} width={4} height={54} rx={2} fill="#B0B8CC" />

      {/* Card shadow */}
      <rect x={62} y={-118} width={76} height={102} rx={8} fill="rgba(0,0,0,0.15)" transform="translate(2,3)" />
      {/* Card body */}
      <rect x={62} y={-118} width={76} height={102} rx={8} fill="white" />
      <rect x={62} y={-118} width={76} height={102} rx={8}
        fill="none" stroke="rgba(37,99,235,0.25)" strokeWidth={1.5} />
      {/* Card top accent stripe */}
      <rect x={62} y={-118} width={76} height={13} rx={8} fill="rgba(37,99,235,0.1)" />
      <rect x={62} y={-109} width={76} height={5} fill="rgba(37,99,235,0.1)" />

      {/* Circular photo inside card */}
      <defs>
        <clipPath id="bc-photo-clip">
          <circle cx={100} cy={-76} r={34} />
        </clipPath>
      </defs>
      <circle cx={100} cy={-76} r={35} fill="#e8eaf0" />
      <image
        href={birthdayPersonImg}
        x={66} y={-110}
        width={68} height={68}
        clipPath="url(#bc-photo-clip)"
        preserveAspectRatio="xMidYMid slice"
      />
      <circle cx={100} cy={-76} r={34} fill="none" stroke="rgba(37,99,235,0.3)" strokeWidth={1.5} />

      {/* Card name text */}
      <text x={100} y={-24} textAnchor="middle" fill="#1E3A8A"
        fontSize={9} fontWeight="800" fontFamily="system-ui, sans-serif" letterSpacing="0.5">
        ★ JOHNNY ★
      </text>

      {/* Candles */}
      {[68, 84, 100, 116, 132].map((x, i) => (
        <g key={i}>
          <rect x={x-4} y={28} width={8} height={28} rx={3}
            fill={["#A78BFA","#818CF8","#C4B5FD","#7C3AED","#6D28D9"][i]} />
          {/* glow behind flame */}
          <motion.ellipse cx={x} cy={22} rx={7} ry={9} fill="rgba(253,224,71,0.18)"
            animate={{ scale:[1,1.4,1] }}
            transition={{ duration: 1.2+i*0.15, repeat: Infinity, ease:"easeInOut" }} />
          <motion.ellipse cx={x} cy={24} rx={4} ry={6} fill="#FCD34D"
            animate={{ scaleY:[1,1.3,0.85,1.2,1], scaleX:[1,0.8,1.1,0.9,1] }}
            transition={{ duration: 1.2+i*0.15, repeat: Infinity, ease:"easeInOut" }} />
          <motion.ellipse cx={x} cy={25} rx={2} ry={3.5} fill="#FDE68A"
            animate={{ scaleY:[1,1.4,0.8,1.3,1] }}
            transition={{ duration: 1.1+i*0.12, repeat: Infinity, ease:"easeInOut" }} />
        </g>
      ))}

      {/* Top tier body */}
      <rect x={55} y={56} width={90} height={46} rx={5} fill="#1E1B4B" />
      <rect x={55} y={56} width={90} height={46} rx={5}
        fill="none" stroke="rgba(139,92,246,0.4)" strokeWidth={1} />
      {/* top frosting */}
      <path d="M55 64 C65 55 75 73 85 62 C95 51 105 69 115 59 C125 50 135 67 145 57 L145 64 L55 64 Z"
        fill="url(#fg1)" />
      <rect x={55} y={64} width={90} height={7} fill="url(#fg1)" />
      {[62,76,90,104,118,132,143].map((x,i)=>(
        <ellipse key={i} cx={x} cy={75+(i%3)*3} rx={4} ry={5+(i%2)*2} fill="url(#fg1)" />
      ))}
      {/* top sprinkles */}
      {([[72,82,"#F472B6"],[88,90,"#34D399"],[100,77,"#FCD34D"],[114,87,"#A78BFA"],[130,80,"#60A5FA"]] as [number,number,string][]).map(([cx,cy,c],i)=>(
        <circle key={i} cx={cx} cy={cy} r={2.5} fill={c} />
      ))}

      {/* Bottom tier body */}
      <rect x={28} y={102} width={144} height={62} rx={5} fill="#1E1B4B" />
      <rect x={28} y={102} width={144} height={62} rx={5}
        fill="none" stroke="rgba(139,92,246,0.4)" strokeWidth={1} />
      {/* bottom frosting */}
      <path d="M28 112 C42 103 55 121 68 110 C81 99 94 117 107 108 C120 99 133 115 146 107 C156 100 164 113 172 106 L172 112 L28 112 Z"
        fill="url(#fg2)" />
      <rect x={28} y={112} width={144} height={7} fill="url(#fg2)" />
      {[36,50,64,78,92,106,120,134,148,162].map((x,i)=>(
        <ellipse key={i} cx={x} cy={123+(i%3)*3} rx={5} ry={6+(i%2)*3} fill="url(#fg2)" />
      ))}
      {/* bottom sprinkles */}
      {([[45,140,"#F472B6"],[66,148,"#34D399"],[86,136,"#FCD34D"],[106,144,"#A78BFA"],[126,137,"#60A5FA"],[147,146,"#F472B6"],[158,140,"#34D399"]] as [number,number,string][]).map(([cx,cy,c],i)=>(
        <circle key={i} cx={cx} cy={cy} r={3} fill={c} />
      ))}

      {/* Plate */}
      <ellipse cx={100} cy={168} rx={80} ry={10} fill="#312E81" />
      <ellipse cx={100} cy={165} rx={80} ry={8} fill="#3730A3" />

      <defs>
        <linearGradient id="fg1" x1="55" y1="56" x2="145" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2563EB"/>
          <stop offset="1" stopColor="#1D4ED8"/>
        </linearGradient>
        <linearGradient id="fg2" x1="28" y1="102" x2="172" y2="102" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1D4ED8"/>
          <stop offset="1" stopColor="#1E40AF"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

// ── Floating deco (neon rings & sparks) ──────────────────────────────────────
function FloatingDeco() {
  const items = [
    { shape: "ring",  x: "12%", y: "10%", color: "#60A5FA", size: 13, delay: 0    },
    { shape: "spark", x: "76%", y: "8%",  color: "#93C5FD", size: 12, delay: 0.5  },
    { shape: "ring",  x: "8%",  y: "46%", color: "#3B82F6", size: 11, delay: 0.9  },
    { shape: "spark", x: "82%", y: "50%", color: "#BFDBFE", size: 10, delay: 0.2  },
    { shape: "ring",  x: "18%", y: "78%", color: "#60A5FA", size: 10, delay: 1.1  },
    { shape: "spark", x: "72%", y: "80%", color: "#93C5FD", size: 12, delay: 0.7  },
    { shape: "ring",  x: "50%", y: "5%",  color: "#2563EB", size: 8,  delay: 1.3  },
    { shape: "spark", x: "88%", y: "26%", color: "#60A5FA", size: 11, delay: 0.35 },
  ];
  return (
    <>
      {items.map((item, i) => (
        <motion.div key={i}
          style={{
            position: "absolute", left: item.x, top: item.y,
            color: item.color, fontSize: item.size, fontWeight: 900,
            lineHeight: 1, userSelect: "none",
            textShadow: `0 0 8px ${item.color}`,
          }}
          animate={{ y:[-5,5,-5], rotate: item.shape==="spark" ? [-15,15,-15] : [0,15,0], opacity:[0.5,1,0.5] }}
          transition={{ duration: 3+i*0.3, repeat: Infinity, ease:"easeInOut", delay: item.delay }}
        >
          {item.shape === "ring" ? "◯" : "✦"}
        </motion.div>
      ))}
    </>
  );
}

// ── Caught modal ─────────────────────────────────────────────────────────────
function CaughtModal({ onClaim }: { onClaim: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 100, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
    >
      <motion.div
        style={{
          background: "linear-gradient(145deg, #05091a, #0a1535)",
          border: "1px solid rgba(37,99,235,0.5)",
          borderRadius: 28, padding: "44px 48px", maxWidth: 400, width: "90%",
          textAlign: "center", position: "relative",
          boxShadow: `0 0 60px ${GLOW}, 0 0 120px ${GLOW2}, inset 0 1px 0 rgba(255,255,255,0.06)`,
        }}
        initial={{ scale: 0.6, y: 40 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 280, damping: 22 }}
      >
        <div style={{
          position: "absolute", top: 0, left: "20%", right: "20%", height: 1,
          background: "linear-gradient(90deg, transparent, rgba(96,165,250,0.6), transparent)",
        }} />

        <motion.div
          style={{ fontSize: 72 }}
          animate={{ rotate: [-8, 8, -5, 5, 0], scale: [1, 1.15, 1] }}
          transition={{ duration: 0.8 }}
        >🏆</motion.div>

        <div style={{
          fontSize: 26, fontWeight: 900, marginTop: 16, marginBottom: 10,
          background: "linear-gradient(135deg, #93C5FD, #60A5FA)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          lineHeight: 1.25,
        }}>
          Well well well...<br />look who caught it!
        </div>

        <div style={{
          fontSize: 14, color: "rgba(255,255,255,0.5)",
          lineHeight: 1.7, marginBottom: 32,
        }}>
          Not everyone can do that — you're a true champion. 🎯<br />
          Your gift has been waiting for exactly this moment.
        </div>

        <motion.button
          onClick={() => { playClickSound(); onClaim(); }}
          style={{
            background: "linear-gradient(135deg, #7C3AED, #4F46E5)",
            color: "white", border: "1px solid rgba(139,92,246,0.4)",
            borderRadius: 14, padding: "14px 0", fontSize: 15,
            fontWeight: 800, cursor: "pointer", letterSpacing: 1.1,
            textTransform: "uppercase", width: "100%",
            boxShadow: "0 4px 24px rgba(124,58,237,0.5)",
          }}
          whileHover={{ scale: 1.04, boxShadow: "0 6px 32px rgba(124,58,237,0.7)" }}
          whileTap={{ scale: 0.97 }}
        >
          Launch my gift 🎁
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

// ── Gift modal ────────────────────────────────────────────────────────────────
function GiftModal({ onClose }: { onClose: () => void }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <motion.div className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 100, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
    >
      <motion.div style={{
        background: "linear-gradient(145deg, #05091a, #0a1535)",
        border: "1px solid rgba(37,99,235,0.5)",
        borderRadius: 28, padding: "40px 44px", maxWidth: 340, width: "90%",
        textAlign: "center",
        boxShadow: `0 0 60px ${GLOW}, 0 0 120px ${GLOW2}, inset 0 1px 0 rgba(255,255,255,0.06)`,
      }}
        initial={{ scale: 0.6, y: 40 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 280, damping: 22 }}
      >
        {!revealed ? (
          <>
            <motion.div style={{ fontSize: 72 }}
              animate={{ rotate:[-6,6,-6], scale:[1,1.07,1] }}
              transition={{ duration: 1.4, repeat: Infinity }}
            >🎁</motion.div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#93C5FD", marginTop: 14, marginBottom: 20 }}>
              Your gift is waiting!
            </div>
            <button onClick={() => setRevealed(true)} style={{
              background: "linear-gradient(135deg, #7C3AED, #4F46E5)",
              color: "white", border: "none", borderRadius: 14,
              padding: "13px 0", fontSize: 16, fontWeight: 800,
              cursor: "pointer", width: "100%",
              boxShadow: `0 4px 20px ${GLOW}`,
            }}>Open it! 🎉</button>
          </>
        ) : (
          <>
            <motion.div style={{ fontSize: 76 }}
              initial={{ scale: 0 }}
              animate={{ scale:[0,1.3,1], rotate:[0,15,-8,0] }}
              transition={{ duration: 0.7 }}
            >🥳</motion.div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#93C5FD", marginTop: 12 }}>
              Happy Birthday! 🎂
            </div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginTop: 8, marginBottom: 22, lineHeight: 1.6 }}>
              May all your dreams come true! ✨
            </div>
            <button onClick={onClose} style={{
              background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.8)",
              border: "1px solid rgba(37,99,235,0.4)", borderRadius: 14,
              padding: "11px 0", fontSize: 14, fontWeight: 700,
              cursor: "pointer", width: "100%",
            }}>Thank you! 🙏</button>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

// ── Birthday Celebration (confetti + modal) ───────────────────────────────────

function GeorgianWineBottle() {
  return (
    <svg width="56" height="165" viewBox="0 0 56 165" fill="none"
      style={{ filter: "drop-shadow(0 4px 14px rgba(0,0,0,0.5))" }}>
      {/* Cork */}
      <rect x="21" y="1" width="14" height="15" rx="3" fill="#9c7b3c"/>
      <rect x="21" y="1" width="14" height="15" rx="3" fill="rgba(255,255,255,0.12)"/>
      <line x1="21" y1="9" x2="35" y2="9" stroke="rgba(0,0,0,0.18)" strokeWidth="1"/>
      {/* Foil capsule */}
      <rect x="18" y="14" width="20" height="11" rx="2" fill="#8B0000"/>
      <rect x="18" y="14" width="20" height="11" rx="2" fill="rgba(255,255,255,0.08)"/>
      {/* Neck */}
      <rect x="20" y="23" width="16" height="28" fill="#1B3A1A"/>
      <rect x="20" y="23" width="5" height="28" fill="rgba(255,255,255,0.07)"/>
      {/* Shoulder + body */}
      <path d="M 20 49 Q 12 55 10 65 L 10 150 Q 10 157 28 157 Q 46 157 46 150 L 46 65 Q 44 55 36 49 Z" fill="#1B3A1A"/>
      {/* Shine */}
      <path d="M 14 68 Q 12 100 12 132" stroke="rgba(255,255,255,0.11)" strokeWidth="4" strokeLinecap="round"/>
      {/* Label */}
      <rect x="11" y="78" width="34" height="56" rx="3" fill="#f5e6c0" stroke="#b8892a" strokeWidth="1.5"/>
      <rect x="13" y="80" width="30" height="52" rx="2" fill="none" stroke="#b8892a" strokeWidth="0.7"/>
      {/* Georgian cross arms */}
      <line x1="13" y1="106" x2="43" y2="106" stroke="#8B0000" strokeWidth="0.7" opacity="0.55"/>
      <line x1="28" y1="81" x2="28" y2="131" stroke="#8B0000" strokeWidth="0.7" opacity="0.55"/>
      {[[ 20, 93],[36, 93],[20,119],[36,119]].map(([cx,cy],i) => (
        <g key={i}>
          <line x1={cx-3} y1={cy} x2={cx+3} y2={cy} stroke="#b8892a" strokeWidth="1" opacity="0.65"/>
          <line x1={cx} y1={cy-3} x2={cx} y2={cy+3} stroke="#b8892a" strokeWidth="1" opacity="0.65"/>
        </g>
      ))}
      <text x="28" y="101" textAnchor="middle" fill="#8B0000" fontSize="5.5" fontWeight="900" fontFamily="serif" letterSpacing="0.6">GEORGIAN</text>
      <text x="28" y="109" textAnchor="middle" fill="#8B0000" fontSize="5" fontFamily="serif">WINE</text>
      <text x="28" y="120" textAnchor="middle" fill="#b8892a" fontSize="4" fontFamily="serif">★ 2004 ★</text>
      {/* Bottom */}
      <ellipse cx="28" cy="153" rx="18" ry="4.5" fill="#142e14"/>
      <ellipse cx="28" cy="153" rx="9" ry="2.5" fill="#1B3A1A" opacity="0.55"/>
      {/* Shadow */}
      <ellipse cx="28" cy="161" rx="20" ry="4" fill="rgba(0,0,0,0.28)"/>
    </svg>
  );
}

function CakeSliceSvg() {
  return (
    <svg width="96" height="132" viewBox="0 0 96 132" fill="none"
      style={{ filter: "drop-shadow(0 4px 14px rgba(0,0,0,0.35))" }}>
      <defs>
        <linearGradient id="csl-sp" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#e8a850"/><stop offset="50%" stopColor="#fad276"/><stop offset="100%" stopColor="#e8a850"/>
        </linearGradient>
        <linearGradient id="csl-cr" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#fff4e0"/><stop offset="100%" stopColor="#ffefc8"/>
        </linearGradient>
        <linearGradient id="csl-fr" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffb3c8"/><stop offset="100%" stopColor="#ff80a0"/>
        </linearGradient>
      </defs>
      {/* Bottom sponge */}
      <rect x="8" y="88" width="80" height="26" rx="4" fill="url(#csl-sp)"/>
      <rect x="8" y="88" width="80" height="8" fill="rgba(255,255,255,0.18)"/>
      {/* Cream 1 */}
      <rect x="8" y="80" width="80" height="10" fill="url(#csl-cr)"/>
      {/* Mid sponge */}
      <rect x="8" y="56" width="80" height="26" fill="url(#csl-sp)"/>
      <rect x="8" y="56" width="80" height="8" fill="rgba(255,255,255,0.18)"/>
      {/* Cream 2 */}
      <rect x="8" y="48" width="80" height="10" fill="url(#csl-cr)"/>
      {/* Top sponge thin */}
      <rect x="8" y="38" width="80" height="12" fill="url(#csl-sp)"/>
      {/* Frosting top */}
      <path d="M 8 38 Q 18 28 30 35 Q 42 42 52 30 Q 62 20 72 27 Q 82 34 88 32 L 88 38 L 8 38 Z" fill="url(#csl-fr)"/>
      {/* Frosting side drips */}
      <path d="M 8 42 Q 5 52 8 58" stroke="#ff80a0" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
      <path d="M 88 46 Q 91 54 88 60" stroke="#ff80a0" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
      <path d="M 32 38 Q 30 48 32 53" stroke="#ff80a0" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
      <path d="M 60 38 Q 62 46 60 51" stroke="#ff80a0" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
      {/* Plate */}
      <ellipse cx="48" cy="116" rx="46" ry="6.5" fill="#ddd0c4"/>
      <ellipse cx="48" cy="114" rx="42" ry="4.5" fill="#f5f0ea"/>
      {/* Candle */}
      <rect x="44" y="10" width="8" height="28" rx="3.5" fill="#A78BFA"/>
      <rect x="44" y="10" width="8" height="28" rx="3.5" fill="rgba(255,255,255,0.18)"/>
      {/* Wick */}
      <line x1="48" y1="10" x2="48" y2="5" stroke="#555" strokeWidth="1.5" strokeLinecap="round"/>
      {/* Flame */}
      <ellipse cx="48" cy="3" rx="4" ry="5.5" fill="#FBBF24"/>
      <ellipse cx="48" cy="2.5" rx="2.2" ry="3.5" fill="#F97316"/>
      <ellipse cx="48" cy="1.5" rx="1.1" ry="1.8" fill="#FEF9C3"/>
      <ellipse cx="48" cy="3" rx="7" ry="8" fill="rgba(251,191,36,0.18)"/>
      {/* Sprinkles */}
      {([[22,30,40],[36,25,110],[54,28,25],[68,26,75],[42,33,155],[60,33,55]] as [number,number,number][]).map(([x,y,r],i) => (
        <rect key={i} x={x-4.5} y={y-1.5} width={9} height={3} rx={1.5}
          fill={["#F472B6","#34D399","#60A5FA","#FBBF24","#F97316","#A78BFA"][i]}
          transform={`rotate(${r} ${x} ${y})`}/>
      ))}
    </svg>
  );
}

function BirthdayConfettiEffect() {
  const COLORS = ["#FFD700","#FF4081","#40C4FF","#69FF47","#E040FB","#FF6E40","#FFFFFF","#FF1744","#00E5FF","#FFEA00","#FF80AB","#B9F6CA"];
  const particles = useMemo(() => {
    const arr: { id: string; ox: string; oy: string; x: number; y: number; w: number; h: number; br: string; color: string; rotate: number; delay: number; dur: number }[] = [];
    // Central burst
    for (let i = 0; i < 110; i++) {
      const angle = (Math.PI * 2 * i / 110) + (Math.random() - 0.5) * 0.45;
      const spd   = 160 + Math.random() * 340;
      arr.push({
        id: `c${i}`, ox: "50%", oy: "42%",
        x: Math.cos(angle) * spd,
        y: Math.sin(angle) * spd - 50 + 180,
        w: i % 3 === 0 ? 4 : 8 + Math.random() * 11,
        h: i % 3 === 0 ? 18 : 8 + Math.random() * 10,
        br: i % 3 === 1 ? "50%" : "2px",
        color: COLORS[i % COLORS.length],
        rotate: Math.random() * 720 - 360,
        delay: Math.random() * 0.4,
        dur: 2.6 + Math.random() * 0.9,
      });
    }
    // Side bursts
    [{ ox:"10%", oy:"22%", base: 0.25 }, { ox:"90%", oy:"22%", base: Math.PI - 0.25 }, { ox:"50%", oy:"8%", base: Math.PI * 0.5 }].forEach(({ ox, oy, base }, bi) => {
      for (let i = 0; i < 22; i++) {
        const angle = base + (Math.random() - 0.5) * 1.4;
        const spd   = 80 + Math.random() * 220;
        arr.push({
          id: `s${bi}-${i}`, ox, oy,
          x: Math.cos(angle) * spd,
          y: Math.sin(angle) * spd + 120,
          w: 5 + Math.random() * 8, h: 5 + Math.random() * 8,
          br: i % 2 === 0 ? "50%" : "2px",
          color: COLORS[(bi * 7 + i) % COLORS.length],
          rotate: Math.random() * 540,
          delay: 0.15 + Math.random() * 0.5,
          dur: 2.0 + Math.random() * 0.7,
        });
      }
    });
    return arr;
  }, []);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {particles.map(p => (
        <motion.div key={p.id}
          style={{ position: "absolute", left: p.ox, top: p.oy, width: p.w, height: p.h, borderRadius: p.br, background: p.color }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0 }}
          animate={{ x: p.x, y: p.y, opacity: [0, 1, 1, 1, 0], rotate: p.rotate, scale: [0, 1.3, 1, 0.7] }}
          transition={{ duration: p.dur, delay: p.delay, ease: [0.15, 0.7, 0.3, 1] }}
        />
      ))}
    </div>
  );
}

function BirthdayModal({ onClose }: { onClose: () => void }) {
  return (
    <motion.div className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 210, background: "rgba(0,0,0,0.80)", backdropFilter: "blur(14px)" }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.45 }}
    >
      <motion.div style={{
        background: "linear-gradient(145deg, #0a0518, #130a28, #0d0a1e)",
        border: "1px solid rgba(255,215,0,0.4)",
        borderRadius: 28, padding: "36px 40px", maxWidth: 480, width: "92%",
        textAlign: "center", position: "relative",
        boxShadow: "0 0 60px rgba(255,215,0,0.18), 0 0 120px rgba(255,120,0,0.10), inset 0 1px 0 rgba(255,255,255,0.07)",
        fontFamily: "system-ui, sans-serif",
      }}
        initial={{ scale: 0.65, y: 70 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 230, damping: 20, delay: 0.1 }}
      >
        <div style={{ position: "absolute", top: 0, left: "10%", right: "10%", height: 1,
          background: "linear-gradient(90deg, transparent, rgba(255,215,0,0.65), transparent)" }} />

        {/* Big "21" */}
        <motion.div style={{
          fontSize: 80, fontWeight: 900, lineHeight: 1, marginBottom: 2,
          background: "linear-gradient(135deg, #FFD700, #FFA500, #FF6B35)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        >
          21
        </motion.div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: 4,
          textTransform: "uppercase", marginBottom: 20 }}>
          Happy Birthday
        </div>

        {/* Illustrations */}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 24, marginBottom: 22 }}>
          <motion.div animate={{ rotate: [-2, 2, -2] }} transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}>
            <GeorgianWineBottle />
          </motion.div>
          <motion.div animate={{ y: [-3, 3, -3] }} transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}>
            <CakeSliceSvg />
          </motion.div>
        </div>

        {/* Text */}
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.78)", lineHeight: 1.85,
          marginBottom: 26, textAlign: "left" }}>
          <span style={{ color: "#FFD700", fontWeight: 800 }}>Our AI Gangsters team</span> congratulates
          you on your <span style={{ color: "#FFD700", fontWeight: 800 }}>21st</span>! 🥂<br/><br/>
          You are now officially and legally allowed to drink — which means the evening
          should be <span style={{ color: "#FF80AB", fontWeight: 700 }}>fun</span> and the
          ideas <span style={{ color: "#C4B5FD", fontWeight: 700 }}>even crazier</span>. 🕺✨<br/><br/>
          And here's our freshly baked cake — just for you! 🎂
        </div>

        <motion.button
          onClick={() => { playClickSound(); onClose(); }}
          style={{
            background: "linear-gradient(135deg, #FFD700, #FFA500)",
            color: "#1a0800", border: "none", borderRadius: 14,
            padding: "15px 0", fontSize: 15, fontWeight: 900,
            cursor: "pointer", letterSpacing: 1.2, textTransform: "uppercase",
            width: "100%", boxShadow: "0 4px 24px rgba(255,215,0,0.5)",
          }}
          whileHover={{ scale: 1.04, boxShadow: "0 6px 36px rgba(255,215,0,0.7)" }}
          whileTap={{ scale: 0.97 }}
        >
          This calls for a drink! 🥂
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

function BirthdayCelebration({ onClose }: { onClose: () => void }) {
  const [showModal, setShowModal] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShowModal(true), 3200);
    return () => clearTimeout(t);
  }, []);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 201, fontFamily: "system-ui, sans-serif" }}>
      <BirthdayConfettiEffect />
      {showModal && <BirthdayModal onClose={onClose} />}
    </div>
  );
}

// ── Final celebration scene ───────────────────────────────────────────────────

function CosmoToast() {
  return (
    <svg viewBox="0 0 140 265" width={100} height={190}
      style={{ overflow: "visible", filter: "drop-shadow(0 8px 20px rgba(37,99,235,0.4))" }}>
      <defs>
        <radialGradient id="ctt-suit" cx="50%" cy="40%" r="55%">
          <stop offset="0%" stopColor="#d0e8ff"/><stop offset="100%" stopColor="#5b8ac4"/>
        </radialGradient>
        <clipPath id="ctt-visor-clip">
          <ellipse cx="70" cy="52" rx="22" ry="17"/>
        </clipPath>
      </defs>
      {/* Helmet */}
      <circle cx="70" cy="50" r="40" fill="url(#ctt-suit)"/>
      <circle cx="70" cy="50" r="40" fill="none" stroke="#a0c4e8" strokeWidth="2"/>
      {/* Antenna */}
      <line x1="70" y1="10" x2="70" y2="2" stroke="#d0e8ff" strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx="70" cy="1" r="3" fill={NEON}/>
      {/* Visor */}
      <ellipse cx="70" cy="52" rx="22" ry="17" fill="rgba(10,20,40,0.85)"/>
      <image href={birthdayPersonImg} x={46} y={33} width={48} height={40}
        clipPath="url(#ctt-visor-clip)" preserveAspectRatio="xMidYMid slice"/>
      <ellipse cx="70" cy="52" rx="22" ry="17" fill="rgba(200,160,20,0.07)"/>
      <ellipse cx="70" cy="52" rx="22" ry="17" fill="none" stroke="rgba(160,196,232,0.6)" strokeWidth="1.5"/>
      {/* Body */}
      <path d="M 70 88 L 70 168" stroke="url(#ctt-suit)" strokeWidth="26" strokeLinecap="round"/>
      {/* Left arm raised — toast */}
      <path d="M 56 104 L 16 68" stroke="url(#ctt-suit)" strokeWidth="16" strokeLinecap="round"/>
      <ellipse cx="13" cy="66" rx="9" ry="9" fill="#3a6090"/>
      {/* Right arm raised — toast */}
      <path d="M 84 104 L 124 68" stroke="url(#ctt-suit)" strokeWidth="16" strokeLinecap="round"/>
      <ellipse cx="127" cy="66" rx="9" ry="9" fill="#3a6090"/>
      {/* Legs */}
      <path d="M 60 168 L 52 218" stroke="url(#ctt-suit)" strokeWidth="16" strokeLinecap="round"/>
      <ellipse cx="50" cy="222" rx="12" ry="7" fill="#3a6090"/>
      <path d="M 80 168 L 88 218" stroke="url(#ctt-suit)" strokeWidth="16" strokeLinecap="round"/>
      <ellipse cx="90" cy="222" rx="12" ry="7" fill="#3a6090"/>
      {/* Left wine glass */}
      <g transform="translate(4, 40)">
        <rect x="6" y="20" width="3" height="16" rx="1.5" fill="rgba(210,230,255,0.8)"/>
        <ellipse cx="7.5" cy="36.5" rx="7" ry="2" fill="rgba(210,230,255,0.55)"/>
        <path d="M 1 1 Q 0 12 4.5 20 L 10.5 20 Q 15 12 14 1 Z" fill="rgba(180,30,60,0.6)" stroke="rgba(210,230,255,0.8)" strokeWidth="1"/>
        <circle cx="6" cy="9" r="1.5" fill="rgba(255,255,255,0.75)"/>
        <circle cx="10" cy="13" r="1" fill="rgba(255,255,255,0.5)"/>
      </g>
      {/* Right wine glass (mirrored) */}
      <g transform="translate(122, 40) scale(-1,1) translate(-15,0)">
        <rect x="6" y="20" width="3" height="16" rx="1.5" fill="rgba(210,230,255,0.8)"/>
        <ellipse cx="7.5" cy="36.5" rx="7" ry="2" fill="rgba(210,230,255,0.55)"/>
        <path d="M 1 1 Q 0 12 4.5 20 L 10.5 20 Q 15 12 14 1 Z" fill="rgba(180,30,60,0.6)" stroke="rgba(210,230,255,0.8)" strokeWidth="1"/>
        <circle cx="6" cy="9" r="1.5" fill="rgba(255,255,255,0.75)"/>
        <circle cx="10" cy="13" r="1" fill="rgba(255,255,255,0.5)"/>
      </g>
    </svg>
  );
}

function RobotWithBroom() {
  return (
    <svg viewBox="0 0 140 230" width={105} height={185}
      style={{ overflow: "visible", filter: "drop-shadow(0 6px 18px rgba(0,0,0,0.4))" }}>
      <defs>
        <linearGradient id="rwb-body" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#b0bec5"/><stop offset="100%" stopColor="#78909c"/>
        </linearGradient>
      </defs>
      {/* Head */}
      <rect x="42" y="6" width="56" height="44" rx="11" fill="url(#rwb-body)" stroke="#cfd8dc" strokeWidth="1.5"/>
      {/* Eyes */}
      <ellipse cx="58" cy="25" rx="10" ry="10" fill="#1a2332"/>
      <ellipse cx="58" cy="25" rx="6.5" ry="6.5" fill="#00bcd4"/>
      <ellipse cx="58" cy="25" rx="3" ry="3" fill="white"/>
      <ellipse cx="82" cy="25" rx="10" ry="10" fill="#1a2332"/>
      <ellipse cx="82" cy="25" rx="6.5" ry="6.5" fill="#00bcd4"/>
      <ellipse cx="82" cy="25" rx="3" ry="3" fill="white"/>
      {/* Smile */}
      <path d="M 57 40 Q 70 50 83 40" stroke="#cfd8dc" strokeWidth="2" fill="none" strokeLinecap="round"/>
      {/* Antenna */}
      <line x1="70" y1="6" x2="70" y2="-1" stroke="#90a4ae" strokeWidth="3" strokeLinecap="round"/>
      <circle cx="70" cy="-2" r="4" fill="#FF6E40"/>
      {/* Neck */}
      <rect x="61" y="48" width="18" height="11" rx="5" fill="#78909c"/>
      {/* Body */}
      <rect x="32" y="57" width="76" height="70" rx="14" fill="url(#rwb-body)" stroke="#cfd8dc" strokeWidth="1.5"/>
      <rect x="46" y="68" width="48" height="32" rx="6" fill="#263238"/>
      <rect x="50" y="72" width="16" height="11" rx="3" fill="#26a69a"/>
      <rect x="72" y="72" width="16" height="11" rx="3" fill="#ef5350" opacity="0.85"/>
      {/* Hips */}
      <rect x="40" y="125" width="60" height="18" rx="8" fill="#78909c"/>
      {/* Legs */}
      <rect x="42" y="141" width="22" height="52" rx="8" fill="url(#rwb-body)" stroke="#cfd8dc" strokeWidth="1"/>
      <rect x="76" y="141" width="22" height="52" rx="8" fill="url(#rwb-body)" stroke="#cfd8dc" strokeWidth="1"/>
      <ellipse cx="53" cy="195" rx="15" ry="6" fill="#546e7a"/>
      <ellipse cx="87" cy="195" rx="15" ry="6" fill="#546e7a"/>
      {/* Right arm — down, gripping broom shaft lower */}
      <path d="M 36 72 L 10 130" stroke="url(#rwb-body)" strokeWidth="17" strokeLinecap="round"/>
      <ellipse cx="9" cy="132" rx="9" ry="9" fill="#78909c"/>
      {/* Left arm — extended forward-left, gripping broom shaft upper */}
      <path d="M 36 65 L 2 90" stroke="url(#rwb-body)" strokeWidth="17" strokeLinecap="round"/>
      <ellipse cx="1" cy="91" rx="9" ry="9" fill="#78909c"/>
      {/* Broom handle: from upper-left grip down to bristles */}
      <line x1="2" y1="89" x2="-28" y2="200" stroke="#92400e" strokeWidth="6" strokeLinecap="round"/>
      {/* Broom head */}
      <rect x="-56" y="196" width="52" height="13" rx="6.5" fill="#b45309"/>
      {/* Bristles */}
      {([-54,-48,-42,-36,-30,-24,-18,-12,-6] as number[]).map((bx, i) => (
        <line key={i} x1={bx + 2} y1="208" x2={bx} y2="222" stroke="#78350f" strokeWidth="2.5" strokeLinecap="round"/>
      ))}
    </svg>
  );
}

function FinalCelebrationScene({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 1400);
    const t2 = setTimeout(() => setPhase(2), 6800);
    const t3 = setTimeout(() => setPhase(3), 9000);
    const t4 = setTimeout(() => onCompleteRef.current(), 9800);
    return () => { [t1, t2, t3, t4].forEach(clearTimeout); };
  }, []);

  const confettiPieces = useMemo(() => {
    const COLORS = ["#FFD700","#FF4081","#40C4FF","#69FF47","#E040FB","#FF6E40","#FF1744","#00E5FF","#FFEA00","#FF80AB"];
    return Array.from({ length: 48 }, (_, i) => ({
      id: i,
      xPct: 3 + (i / 48) * 90,
      yOffPct: (i % 8) * 0.8,
      color: COLORS[i % COLORS.length],
      w: 5 + (i % 4) * 3,
      h: i % 5 === 0 ? 3 : 6 + (i % 3) * 4,
      rot: (i * 43) % 180,
      isCircle: i % 6 === 0,
      // robot starts at left 78%, sweeps left — right-side confetti goes first
      sweepDelay: Math.max(0, (0.80 - (3 + (i / 48) * 90) / 100) * 4.2),
      sweepDur: 0.45 + ((i * 13) % 10) * 0.06,
    }));
  }, []);

  return (
    <motion.div className="fixed inset-0"
      style={{ zIndex: 155, background: "#01030a", overflow: "hidden", fontFamily: "system-ui, sans-serif" }}
      animate={{ opacity: phase >= 3 ? 0 : 1 }}
      transition={{ duration: 0.8 }}
    >
      <Stars />

      {/* Moon surface */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "34%",
        background: "linear-gradient(180deg, #c8beb0 0%, #a09080 100%)",
        borderRadius: "50% 50% 0 0 / 12% 12% 0 0" }} />
      <div style={{ position: "absolute", bottom: "27%", left: "18%", width: 44, height: 14,
        background: "rgba(0,0,0,0.10)", borderRadius: "50%" }}/>
      <div style={{ position: "absolute", bottom: "22%", left: "55%", width: 30, height: 10,
        background: "rgba(0,0,0,0.08)", borderRadius: "50%" }}/>
      <div style={{ position: "absolute", bottom: "29%", left: "72%", width: 20, height: 7,
        background: "rgba(0,0,0,0.07)", borderRadius: "50%" }}/>

      {/* Earth */}
      <div style={{ position: "absolute", top: "2%", left: "4%", zIndex: 6 }}>
        <EarthInSky />
      </div>

      {/* Confetti scattered on moon surface */}
      {confettiPieces.map(p => (
        <motion.div key={p.id}
          style={{
            position: "absolute",
            left: `${p.xPct}%`, bottom: `${29 + p.yOffPct}%`,
            width: p.w, height: p.h,
            borderRadius: p.isCircle ? "50%" : "2px",
            background: p.color,
            transformOrigin: "center",
          }}
          initial={{ rotate: p.rot, opacity: 1 }}
          animate={phase >= 1 ? { x: -180, y: 60, opacity: 0, rotate: p.rot - 200 } : {}}
          transition={phase >= 1 ? { duration: p.sweepDur, delay: p.sweepDelay, ease: "easeIn" } : { duration: 0 }}
        />
      ))}

      {/* Cosmonaut toasting — left side, gentle bob */}
      <motion.div style={{ position: "absolute", bottom: "30%", left: "8%", zIndex: 10 }}
        animate={{ rotate: [-2, 2, -2] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <CosmoToast />
      </motion.div>

      {/* Robot with broom — sweeps from right to left */}
      <motion.div
        style={{ position: "absolute", bottom: "30%", zIndex: 10 }}
        initial={{ left: "78%" }}
        animate={{ left: phase >= 1 ? "-18%" : "78%" }}
        transition={{ duration: 5.0, ease: "linear" }}
      >
        <motion.div
          animate={phase >= 1 ? { rotate: [0, -3, 3, -3, 0] } : {}}
          transition={{ duration: 0.38, repeat: Infinity }}
        >
          <RobotWithBroom />
        </motion.div>
      </motion.div>

      {/* "Have a great day!" — drops in from top when sweep done */}
      {phase >= 2 && (
        <motion.div
          style={{ position: "absolute", top: "14%", left: 0, right: 0, textAlign: "center", zIndex: 20 }}
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 190, damping: 17 }}
        >
          <div style={{
            display: "inline-block",
            background: "linear-gradient(135deg, #FFD700, #FFA500, #FF6B35)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            fontSize: "clamp(30px, 5.5vw, 66px)", fontWeight: 900, letterSpacing: 1,
          }}>
            Have a great day! 🎉
          </div>
          <div style={{ color: "rgba(255,255,255,0.38)", fontSize: 14, marginTop: 8,
            letterSpacing: 3, textTransform: "uppercase" }}>
            — AI Gangsters Team
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

// ── Refusal modal ─────────────────────────────────────────────────────────────
function RefusalModal({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 100, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      onClick={onClose}
    >
      <motion.div
        onClick={e => e.stopPropagation()}
        style={{
          background: "linear-gradient(145deg, #05091a, #0a1535)",
          border: "1px solid rgba(37,99,235,0.45)",
          borderRadius: 28,
          padding: "44px 48px",
          maxWidth: 420,
          width: "90%",
          textAlign: "center",
          boxShadow: `0 0 60px rgba(37,99,235,0.3), 0 0 120px rgba(29,78,216,0.2), inset 0 1px 0 rgba(255,255,255,0.05)`,
        }}
        initial={{ scale: 0.7, y: 30 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 22 }}
      >
        {/* Top glow edge */}
        <div style={{
          position: "absolute", top: 0, left: "20%", right: "20%", height: 1,
          background: "linear-gradient(90deg, transparent, rgba(96,165,250,0.6), transparent)",
        }} />

        <motion.div
          style={{ fontSize: 64, marginBottom: 4 }}
          animate={{ rotate: [0, -8, 8, -5, 5, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 0.6 }}
        >
          😂
        </motion.div>

        <div style={{
          fontSize: 28, fontWeight: 900, marginTop: 12, marginBottom: 12,
          background: "linear-gradient(135deg, #93C5FD, #60A5FA)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          fontFamily: "system-ui, sans-serif",
          lineHeight: 1.2,
        }}>
          HA! No such option.
        </div>

        <div style={{
          fontSize: 15, color: "rgba(255,255,255,0.55)",
          lineHeight: 1.7, marginBottom: 32,
          fontFamily: "system-ui, sans-serif",
        }}>
          There's no way out of this one —<br />
          you <em style={{ color: "#93C5FD", fontStyle: "normal", fontWeight: 700 }}>must</em> claim your gift! 🎁
        </div>

        <motion.button
          onClick={onClose}
          style={{
            background: "linear-gradient(135deg, #059669, #047857)",
            color: "white", border: "1px solid rgba(52,211,153,0.4)",
            borderRadius: 14, padding: "14px 0", fontSize: 15,
            fontWeight: 800, cursor: "pointer", letterSpacing: 1.2,
            textTransform: "uppercase", width: "100%",
            boxShadow: "0 4px 20px rgba(5,150,105,0.4)",
          }}
          whileHover={{ scale: 1.04, boxShadow: "0 6px 28px rgba(5,150,105,0.6)" }}
          whileTap={{ scale: 0.97 }}
        >
          OK, fine 🎉
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

// ── Stretch modal ─────────────────────────────────────────────────────────────
function StretchModal({ onStart }: { onStart: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 200, background: "rgba(0,0,0,0.78)", backdropFilter: "blur(10px)" }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
    >
      <motion.div
        style={{
          background: "linear-gradient(145deg, #05091a, #0a1535)",
          border: "1px solid rgba(37,99,235,0.5)",
          borderRadius: 28, padding: "44px 48px", maxWidth: 420, width: "90%",
          textAlign: "center", position: "relative",
          boxShadow: `0 0 60px ${GLOW}, 0 0 120px ${GLOW2}, inset 0 1px 0 rgba(255,255,255,0.06)`,
        }}
        initial={{ scale: 0.6, y: 50 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 22, delay: 0.15 }}
      >
        <div style={{
          position: "absolute", top: 0, left: "20%", right: "20%", height: 1,
          background: "linear-gradient(90deg, transparent, rgba(96,165,250,0.6), transparent)",
        }} />

        <motion.div
          style={{ fontSize: 68, lineHeight: 1, marginBottom: 8 }}
          animate={{ rotate: [-4, 4, -3, 3, 0] }}
          transition={{ duration: 0.7, delay: 0.3 }}
        >
          🤔
        </motion.div>

        <div style={{
          fontSize: 24, fontWeight: 900, marginTop: 12, marginBottom: 12,
          background: "linear-gradient(135deg, #93C5FD, #60A5FA)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          lineHeight: 1.25,
        }}>
          HMMM...
        </div>

        <div style={{
          fontSize: 14, color: "rgba(255,255,255,0.62)",
          lineHeight: 1.75, marginBottom: 32,
          fontFamily: "system-ui, sans-serif",
        }}>
          It seems you can't grab your gift from the robot
          just yet — that was a <em style={{ color: "#93C5FD", fontStyle: "normal", fontWeight: 700 }}>very</em> long
          flight and everything's gone completely stiff!<br /><br />
          Cosmonaut Johnny needs to stretch first. 🧑‍🚀
        </div>

        <motion.button
          onClick={() => { playClickSound(); onStart(); }}
          style={{
            background: "linear-gradient(135deg, #2563EB, #1D4ED8)",
            color: "white", border: "1px solid rgba(96,165,250,0.4)",
            borderRadius: 14, padding: "15px 0", fontSize: 15,
            fontWeight: 800, cursor: "pointer", letterSpacing: 1.4,
            textTransform: "uppercase", width: "100%",
            boxShadow: "0 4px 24px rgba(37,99,235,0.55)",
            fontFamily: "system-ui, sans-serif",
          }}
          whileHover={{ scale: 1.04, boxShadow: "0 6px 32px rgba(37,99,235,0.75)" }}
          whileTap={{ scale: 0.97 }}
        >
          Start Warmup 🤸
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

// ── Launch Screen ─────────────────────────────────────────────────────────────

function EarthBase() {
  return (
    <svg width="1000" height="420" viewBox="0 0 1000 420" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        {/* Sphere — lit from top-left, dark terminator on right */}
        <radialGradient id="ls-earth-bg" cx="36%" cy="14%" r="76%">
          <stop offset="0%"   stopColor="#8ad8f8" />
          <stop offset="16%"  stopColor="#3a9ae8" />
          <stop offset="42%"  stopColor="#1558b8" />
          <stop offset="72%"  stopColor="#0b3278" />
          <stop offset="100%" stopColor="#040e22" />
        </radialGradient>
        {/* Specular highlight top-left */}
        <radialGradient id="ls-earth-spec" cx="34%" cy="12%" r="34%">
          <stop offset="0%"   stopColor="rgba(255,255,255,0.22)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        {/* Atmosphere halo at rim */}
        <radialGradient id="ls-earth-halo" cx="50%" cy="50%" r="52%">
          <stop offset="82%"  stopColor="rgba(80,150,255,0)" />
          <stop offset="100%" stopColor="rgba(110,190,255,0.50)" />
        </radialGradient>
        {/* Top scatter glow */}
        <radialGradient id="ls-earth-top" cx="50%" cy="0%" r="80%">
          <stop offset="0%"   stopColor="rgba(130,200,255,0.20)" />
          <stop offset="100%" stopColor="rgba(80,150,255,0)" />
        </radialGradient>
        {/* Clip to sphere shape */}
        <clipPath id="ls-earth-clip">
          <ellipse cx="500" cy="390" rx="490" ry="370" />
        </clipPath>
      </defs>

      {/* Outer atmosphere rings */}
      <ellipse cx="500" cy="390" rx="498" ry="378" fill="rgba(80,150,255,0.07)" />
      {/* Sphere body */}
      <ellipse cx="500" cy="390" rx="490" ry="370" fill="url(#ls-earth-bg)" />

      <g clipPath="url(#ls-earth-clip)">
        {/* === CONTINENTS (green + brown deserts) === */}
        {/* Left continent cluster */}
        <ellipse cx="285" cy="178" rx="94" ry="60" fill="rgba(44,155,52,0.62)" transform="rotate(-14 285 178)" />
        <ellipse cx="268" cy="205" rx="46" ry="30" fill="rgba(125,96,38,0.50)" transform="rotate(-8 268 205)" />
        <ellipse cx="168" cy="258" rx="62" ry="46" fill="rgba(44,155,52,0.56)" transform="rotate(10 168 258)" />
        {/* Center-right continent */}
        <ellipse cx="620" cy="168" rx="104" ry="64" fill="rgba(44,155,52,0.60)" transform="rotate(8 620 168)" />
        <ellipse cx="665" cy="195" rx="48" ry="34" fill="rgba(125,96,38,0.44)" transform="rotate(-14 665 195)" />
        {/* Lower continent */}
        <ellipse cx="770" cy="298" rx="62" ry="40" fill="rgba(125,96,38,0.46)" transform="rotate(18 770 298)" />
        <ellipse cx="465" cy="342" rx="52" ry="32" fill="rgba(44,155,52,0.40)" />

        {/* === ICE CAPS === */}
        <ellipse cx="500" cy="32"  rx="340" ry="52" fill="rgba(230,245,255,0.62)" />
        <ellipse cx="500" cy="12"  rx="220" ry="32" fill="rgba(255,255,255,0.50)" />

        {/* === CLOUDS === */}
        <ellipse cx="355" cy="138" rx="118" ry="17" fill="rgba(255,255,255,0.30)" transform="rotate(14 355 138)" />
        <ellipse cx="630" cy="228" rx="102" ry="15" fill="rgba(255,255,255,0.27)" transform="rotate(-7 630 228)" />
        <ellipse cx="198" cy="188" rx="86"  ry="13" fill="rgba(255,255,255,0.24)" transform="rotate(10 198 188)" />
        <ellipse cx="510" cy="292" rx="112" ry="15" fill="rgba(255,255,255,0.22)" transform="rotate(-4 510 292)" />
        <ellipse cx="808" cy="158" rx="74"  ry="12" fill="rgba(255,255,255,0.22)" transform="rotate(6 808 158)" />
        <ellipse cx="122" cy="315" rx="80"  ry="13" fill="rgba(255,255,255,0.20)" transform="rotate(16 122 315)" />
        <ellipse cx="440" cy="122" rx="65"  ry="11" fill="rgba(255,255,255,0.18)" transform="rotate(-12 440 122)" />

        {/* === TERMINATOR — dark shadow right side === */}
        <ellipse cx="930" cy="390" rx="300" ry="370" fill="rgba(0,0,12,0.38)" />

        {/* === CITY LIGHTS on dark side === */}
        <ellipse cx="830" cy="272" rx="5" ry="3.5" fill="rgba(255,240,170,0.42)" />
        <ellipse cx="862" cy="252" rx="3.5" ry="2.5" fill="rgba(255,240,170,0.36)" />
        <ellipse cx="884" cy="296" rx="6"   ry="4"   fill="rgba(255,238,160,0.32)" />
        <ellipse cx="846" cy="326" rx="3.5" ry="2.5" fill="rgba(255,230,150,0.28)" />
        <ellipse cx="910" cy="240" rx="3"   ry="2"   fill="rgba(255,235,160,0.24)" />
      </g>

      {/* Specular highlight */}
      <ellipse cx="500" cy="390" rx="490" ry="370" fill="url(#ls-earth-spec)" />
      {/* Atmosphere halo */}
      <ellipse cx="500" cy="390" rx="490" ry="370" fill="url(#ls-earth-halo)" />
      {/* Top glow */}
      <ellipse cx="500" cy="390" rx="490" ry="370" fill="url(#ls-earth-top)" />
      {/* Edge glow */}
      <ellipse cx="500" cy="390" rx="490" ry="370" fill="none" stroke="rgba(100,185,255,0.42)" strokeWidth="9" />
      <ellipse cx="500" cy="390" rx="495" ry="375" fill="none" stroke="rgba(80,155,255,0.13)" strokeWidth="7" />
    </svg>
  );
}

function RocketSvg({ ignition, launched, hidePhoto }: { ignition: boolean; launched: boolean; hidePhoto?: boolean }) {
  return (
    <svg width="130" height="338" viewBox="0 0 100 260" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        {/* Cylindrical body shading — light from left */}
        <linearGradient id="ls-r-body" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#505c6a" />
          <stop offset="14%"  stopColor="#aab6c8" />
          <stop offset="36%"  stopColor="#dde6f4" />
          <stop offset="52%"  stopColor="#c8d4e2" />
          <stop offset="80%"  stopColor="#788898" />
          <stop offset="100%" stopColor="#48545e" />
        </linearGradient>
        <linearGradient id="ls-r-fin" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0%"   stopColor="#6a7480" />
          <stop offset="100%" stopColor="#2e3540" />
        </linearGradient>
        {/* Nose cone — same cylindrical */}
        <linearGradient id="ls-r-nose" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#505c6a" />
          <stop offset="32%"  stopColor="#c8d4e2" />
          <stop offset="52%"  stopColor="#dde6f4" />
          <stop offset="80%"  stopColor="#788898" />
          <stop offset="100%" stopColor="#48545e" />
        </linearGradient>
        <radialGradient id="ls-r-win" cx="40%" cy="40%">
          <stop offset="0%" stopColor="#1a5090" />
          <stop offset="100%" stopColor="#030a1e" />
        </radialGradient>
        <linearGradient id="ls-r-exh" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F97316" />
          <stop offset="55%" stopColor="#FBBF24" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#EF4444" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Fins */}
      <path d="M28 198 L6 240 L36 220 Z" fill="url(#ls-r-fin)" />
      <path d="M72 198 L94 240 L64 220 Z" fill="url(#ls-r-fin)" />
      {/* Body */}
      <rect x="28" y="60" width="44" height="168" rx="7" fill="url(#ls-r-body)" />
      {/* Body AO edges */}
      <rect x="28" y="60" width="6"  height="168" rx="3" fill="rgba(0,0,0,0.18)" />
      <rect x="66" y="60" width="6"  height="168" rx="3" fill="rgba(0,0,0,0.22)" />
      {/* Nose cone */}
      <path d="M28 62 Q50 5 72 62 Z" fill="url(#ls-r-nose)" />
      {/* Nose cone edge shading */}
      <path d="M28 62 Q50 5 72 62 Z" fill="rgba(0,0,0,0.08)" />
      {/* Accent stripe */}
      <rect x="28" y="162" width="44" height="6" fill="#DC2626" />
      <rect x="28" y="170" width="44" height="3" fill="#1D4ED8" />
      {/* Porthole — Johnny's photo */}
      <circle cx="50" cy="135" r="14" fill="#060e24" stroke="rgba(96,165,250,0.6)" strokeWidth="2.5" />
      <defs>
        <clipPath id="ls-r-photo-clip">
          <circle cx="50" cy="135" r="11" />
        </clipPath>
      </defs>
      {!hidePhoto && (
        <image
          href={birthdayPersonImg}
          x={39} y={124}
          width={22} height={22}
          clipPath="url(#ls-r-photo-clip)"
          preserveAspectRatio="xMidYMid slice"
        />
      )}
      <circle cx="50" cy="135" r="11" fill="none" stroke="rgba(96,165,250,0.4)" strokeWidth="1" />
      {/* Glare */}
      <ellipse cx="44" cy="128" rx="4" ry="2.5" fill="rgba(255,255,255,0.2)" transform="rotate(-20 44 128)" />
      {/* Nozzle */}
      <rect x="38" y="224" width="24" height="12" rx="3" fill="#4a5060" />
      <rect x="34" y="233" width="32" height="7" rx="2" fill="#363c48" />
      {/* Nose light */}
      <circle cx="50" cy="16" r="3" fill="#60A5FA" opacity="0.85" />
      {/* Flame */}
      {(ignition || launched) && (
        <>
          <ellipse cx="50" cy="243" rx="14" ry="10" fill="#F97316" opacity="0.95" />
          <ellipse cx="50" cy="254" rx="10" ry="16" fill="url(#ls-r-exh)" />
          <ellipse cx="50" cy="258" rx="6" ry="18" fill="#FBBF24" opacity="0.55" />
        </>
      )}
    </svg>
  );
}

function CosmonautIcon() {
  return (
    <svg width="160" height="160" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="ci-bg" cx="50%" cy="38%">
          <stop offset="0%"   stopColor="#0e1f52" />
          <stop offset="55%"  stopColor="#07102e" />
          <stop offset="100%" stopColor="#020610" />
        </radialGradient>
        <linearGradient id="ci-ring" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#93C5FD" />
          <stop offset="35%"  stopColor="#3B82F6" />
          <stop offset="70%"  stopColor="#1D4ED8" />
          <stop offset="100%" stopColor="#60A5FA" />
        </linearGradient>
        {/* Suit metallic */}
        <linearGradient id="ci-suit" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%"   stopColor="#dce8f8" />
          <stop offset="28%"  stopColor="#b8cce4" />
          <stop offset="62%"  stopColor="#8aa0c0" />
          <stop offset="100%" stopColor="#5a6e90" />
        </linearGradient>
        <radialGradient id="ci-suit-hi" cx="30%" cy="22%" r="65%">
          <stop offset="0%"   stopColor="rgba(255,255,255,0.30)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
        {/* Helmet shell */}
        <radialGradient id="ci-helm" cx="36%" cy="28%" r="70%">
          <stop offset="0%"   stopColor="#eaf0fc" />
          <stop offset="28%"  stopColor="#c0d0e8" />
          <stop offset="60%"  stopColor="#8898c0" />
          <stop offset="100%" stopColor="#445070" />
        </radialGradient>
        {/* Neck ring */}
        <linearGradient id="ci-neck" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor="#a8b8d4" />
          <stop offset="50%"  stopColor="#dce8f8" />
          <stop offset="100%" stopColor="#6878a8" />
        </linearGradient>
        {/* Visor gold */}
        <linearGradient id="ci-visor-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="rgba(255,210,80,0.22)" />
          <stop offset="100%" stopColor="rgba(180,130,0,0.10)" />
        </linearGradient>
        {/* Visor frame gold */}
        <linearGradient id="ci-visor-frame" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#f5c842" />
          <stop offset="50%"  stopColor="#d4a017" />
          <stop offset="100%" stopColor="#f5c842" />
        </linearGradient>
        <clipPath id="ci-outer-clip">
          <circle cx="80" cy="80" r="74" />
        </clipPath>
        <clipPath id="ci-clip">
          <circle cx="80" cy="80" r="68" />
        </clipPath>
        <clipPath id="ci-visor-clip">
          <ellipse cx="80" cy="76" rx="24" ry="21" />
        </clipPath>
      </defs>

      {/* Outer soft glow */}
      <circle cx="80" cy="80" r="79" fill="rgba(37,99,235,0.12)" />
      {/* Dark rim */}
      <circle cx="80" cy="80" r="77" fill="#030812" />
      {/* Main background */}
      <circle cx="80" cy="80" r="74" fill="url(#ci-bg)" />

      {/* Star field */}
      <g clipPath="url(#ci-outer-clip)">
        {([
          [18,16,0.8],[50,10,0.6],[96,12,0.9],[118,22,0.6],[130,52,0.7],
          [136,78,0.5],[12,60,0.7],[14,90,0.5],[8,118,0.6],[22,138,0.5],
          [55,148,0.6],[100,145,0.7],[130,130,0.5],[140,100,0.6],
          [62,18,0.5],[84,8,0.7],[108,38,0.5],[28,44,0.6],
        ] as [number,number,number][]).map(([x,y,r],i) => (
          <circle key={i} cx={x} cy={y} r={r} fill={i%2===0?"rgba(255,255,255,0.65)":"rgba(180,210,255,0.7)"} />
        ))}
      </g>

      {/* Outer gradient ring */}
      <circle cx="80" cy="80" r="74" fill="none" stroke="url(#ci-ring)" strokeWidth="4" />
      {/* Inner dashed ring */}
      <circle cx="80" cy="80" r="67" fill="none" stroke="rgba(96,165,250,0.22)" strokeWidth="1" strokeDasharray="5 4" />

      {/* Cardinal bolts */}
      {([[80,9],[151,80],[80,151],[9,80]] as [number,number][]).map(([x,y],i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="5.5" fill="#0b1c48" stroke="rgba(96,165,250,0.55)" strokeWidth="1.5" />
          <circle cx={x} cy={y} r="2"   fill="rgba(96,165,250,0.8)" />
        </g>
      ))}

      {/* ── Inner content ── */}
      <g clipPath="url(#ci-clip)">

        {/* Wide shoulder base */}
        <ellipse cx="80" cy="142" rx="62" ry="34" fill="url(#ci-suit)" />
        <ellipse cx="80" cy="142" rx="62" ry="34" fill="url(#ci-suit-hi)" />

        {/* Left shoulder pad */}
        <ellipse cx="32" cy="118" rx="22" ry="16" fill="url(#ci-suit)" transform="rotate(-18 32 118)" />
        <ellipse cx="32" cy="118" rx="22" ry="16" fill="url(#ci-suit-hi)" transform="rotate(-18 32 118)" />
        {/* Left blue stripe */}
        <rect x="18" y="113" width="24" height="4" rx="2" fill="#1D4ED8" opacity="0.85" transform="rotate(-18 18 113)" />

        {/* Right shoulder pad */}
        <ellipse cx="128" cy="118" rx="22" ry="16" fill="url(#ci-suit)" transform="rotate(18 128 118)" />
        <ellipse cx="128" cy="118" rx="22" ry="16" fill="url(#ci-suit-hi)" transform="rotate(18 128 118)" />
        {/* Right blue stripe */}
        <rect x="118" y="113" width="24" height="4" rx="2" fill="#1D4ED8" opacity="0.85" transform="rotate(18 118 113)" />

        {/* Chest torso */}
        <rect x="52" y="108" width="56" height="38" rx="10" fill="url(#ci-suit)" />
        <rect x="52" y="108" width="56" height="38" rx="10" fill="url(#ci-suit-hi)" />
        {/* Chest panel */}
        <rect x="60" y="114" width="40" height="26" rx="5" fill="#060f28" />
        <rect x="60" y="114" width="40" height="26" rx="5" fill="none" stroke="rgba(96,165,250,0.45)" strokeWidth="1" />
        {/* LED indicators row */}
        <circle cx="70"  cy="123" r="3.5" fill="#3B82F6" />
        <circle cx="80"  cy="123" r="3.5" fill="#10B981" />
        <circle cx="90"  cy="123" r="3.5" fill="#F59E0B" />
        {/* LED glow */}
        <circle cx="70"  cy="123" r="5" fill="rgba(59,130,246,0.25)" />
        <circle cx="80"  cy="123" r="5" fill="rgba(16,185,129,0.25)" />
        <circle cx="90"  cy="123" r="5" fill="rgba(245,158,11,0.25)" />
        {/* Data bars */}
        <rect x="64" y="131" width="32" height="2.5" rx="1.2" fill="rgba(96,165,250,0.55)" />
        <rect x="64" y="135" width="20" height="2.5" rx="1.2" fill="rgba(96,165,250,0.35)" />

        {/* Left arm patch */}
        <rect x="18" y="105" width="22" height="13" rx="3" fill="#1D4ED8" opacity="0.9" />
        <rect x="18" y="105" width="22" height="13" rx="3" fill="none" stroke="rgba(96,165,250,0.5)" strokeWidth="0.8" />
        <text x="29" y="114" textAnchor="middle" fill="white" fontSize="5.5" fontWeight="900" fontFamily="monospace" letterSpacing="0.5">NASA</text>

        {/* Right arm mission badge */}
        <circle cx="122" cy="112" r="9" fill="#050e24" stroke="rgba(245,196,66,0.6)" strokeWidth="1.2" />
        <text x="122" y="116" textAnchor="middle" fill="#FBBF24" fontSize="10" fontWeight="900" fontFamily="sans-serif">★</text>

        {/* Neck ring */}
        <ellipse cx="80" cy="107" rx="25" ry="8"  fill="url(#ci-neck)" />
        <ellipse cx="80" cy="105" rx="22" ry="5.5" fill="rgba(255,255,255,0.18)" />
        {/* Neck ring bolts */}
        {([[58,107],[80,101],[102,107]] as [number,number][]).map(([x,y],i) => (
          <circle key={i} cx={x} cy={y} r="2" fill="#8898b8" stroke="rgba(200,220,255,0.3)" strokeWidth="0.8" />
        ))}

        {/* Helmet outer shell */}
        <circle cx="80" cy="74" r="38" fill="url(#ci-helm)" />
        {/* Helmet rim shadow */}
        <ellipse cx="80" cy="110" rx="38" ry="9" fill="rgba(0,0,0,0.22)" />
        {/* Helmet inner dark */}
        <circle cx="80" cy="74" r="33" fill="#08122e" />
        {/* Helmet inner ring */}
        <circle cx="80" cy="74" r="33" fill="none" stroke="rgba(96,165,250,0.30)" strokeWidth="1.5" />

        {/* Visor — Johnny's photo */}
        <image
          href={birthdayPersonImg}
          x={56} y={55}
          width={48} height={42}
          clipPath="url(#ci-visor-clip)"
          preserveAspectRatio="xMidYMid slice"
        />
        {/* Gold visor tint */}
        <ellipse cx="80" cy="76" rx="24" ry="21" fill="url(#ci-visor-gold)" />

        {/* Visor frame — double gold ring */}
        <ellipse cx="80" cy="76" rx="24" ry="21" fill="none" stroke="url(#ci-visor-frame)" strokeWidth="2.5" />
        <ellipse cx="80" cy="76" rx="21" ry="18" fill="none" stroke="rgba(245,200,80,0.30)" strokeWidth="1" />

        {/* Helmet large glare */}
        <ellipse cx="65" cy="60" rx="10" ry="5" fill="rgba(255,255,255,0.26)" transform="rotate(-25 65 60)" />
        {/* Helmet small glare */}
        <ellipse cx="88" cy="55" rx="4"  ry="2" fill="rgba(255,255,255,0.16)" transform="rotate(-18 88 55)" />

        {/* Helmet top highlight arc */}
        <path d="M48 74 Q48 38 80 37 Q112 38 112 74" stroke="rgba(220,235,255,0.28)" strokeWidth="2" fill="none" strokeLinecap="round" />

        {/* Antenna base mount */}
        <rect x="76" y="36" width="8" height="5" rx="2.5" fill="#8898b8" />
        {/* Antenna rod */}
        <line x1="80" y1="36" x2="80" y2="20" stroke="#60A5FA" strokeWidth="2.5" strokeLinecap="round" />
        {/* Antenna ball */}
        <circle cx="80" cy="18" r="6"   fill="#1D4ED8" stroke="#60A5FA" strokeWidth="2" />
        <circle cx="80" cy="18" r="2.5" fill="#93C5FD" />
        {/* Antenna signal rings */}
        <circle cx="80" cy="18" r="9"  fill="none" stroke="rgba(96,165,250,0.35)" strokeWidth="1" strokeDasharray="2.5 2" />
        <circle cx="80" cy="18" r="13" fill="none" stroke="rgba(96,165,250,0.15)" strokeWidth="1" strokeDasharray="2 3" />

      </g>

      {/* HUD corner brackets */}
      <path d="M11 11 L11 26 M11 11 L26 11" stroke="rgba(96,165,250,0.8)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M149 11 L149 26 M149 11 L134 11" stroke="rgba(96,165,250,0.8)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M11 149 L11 134 M11 149 L26 149" stroke="rgba(96,165,250,0.8)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M149 149 L149 134 M149 149 L134 149" stroke="rgba(96,165,250,0.8)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function LaunchScreen({ onComplete }: { onComplete: () => void }) {
  const [count, setCount] = useState(10);
  const [ignition, setIgnition] = useState(false);
  const [launched, setLaunched] = useState(false);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    if (launched) return;
    if (count === 3) setIgnition(true);
    if (count <= 0) { setLaunched(true); return; }
    const t = setTimeout(() => setCount(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count, launched]);

  useEffect(() => {
    if (!launched) return;
    const t = setTimeout(() => onCompleteRef.current(), 1800);
    return () => clearTimeout(t);
  }, [launched]);

  // Countdown beeps
  useEffect(() => {
    if (launched || count > 9 || count < 0) return;
    if (count === 0) {
      playBeep(660, 0.12, 0.32);
      setTimeout(() => playBeep(880, 0.12, 0.38), 90);
      setTimeout(() => playBeep(1100, 0.22, 0.48), 180);
    } else if (count <= 3) {
      playBeep(1100, 0.16, 0.38);
    } else {
      playBeep(880, 0.13, 0.26);
    }
  }, [count, launched]);

  // Engine rumble on liftoff
  useEffect(() => {
    if (!launched) return;
    return startEngineRumble(0.62);
  }, [launched]);

  const statusLabel = launched ? "LIFTOFF!" : count <= 3 ? "IGNITION" : count <= 6 ? "FUELING..." : "PREPARING...";

  const panelStars = useMemo(() => Array.from({ length: 18 }, (_, i) => ({
    id: i,
    x: 5 + (i * 37 + i * i * 11) % 90,
    y: 5 + (i * 53 + i * i * 7) % 90,
    s: 1.5 + (i % 3) * 0.8,
    dur: 1.2 + (i % 5) * 0.4,
    delay: (i % 7) * 0.3,
    color: i % 3 === 0 ? "#93C5FD" : i % 3 === 1 ? "#FBBF24" : "#fff",
  })), []);

  return (
    <motion.div
      className="fixed inset-0"
      style={{ zIndex: 150, background: "radial-gradient(ellipse at 50% 20%, #06112e 0%, #000005 100%)", overflow: "hidden" }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
    >
      <Stars />

      {/* Moon in background — where the astronaut is flying to */}
      <div style={{ position: "absolute", top: "-6%", right: "-5%", zIndex: 4, opacity: 0.45, pointerEvents: "none" }}>
        <MoonInBackground />
      </div>

      {/* Cosmonaut icon — left side */}
      <div style={{ position: "absolute", left: 24, top: "50%", transform: "translateY(-50%)", zIndex: 20, width: 210 }}>

        {/* Twinkling stars background */}
        <div style={{ position: "absolute", inset: -16, borderRadius: 24, overflow: "hidden", zIndex: -1 }}>
          {panelStars.map(st => (
            <motion.div key={st.id} style={{
              position: "absolute", left: `${st.x}%`, top: `${st.y}%`,
              width: st.s, height: st.s, borderRadius: "50%",
              background: st.color,
              boxShadow: `0 0 ${st.s * 2}px ${st.color}`,
            }}
              animate={{ opacity: [0.1, 1, 0.1], scale: [1, 1.8, 1] }}
              transition={{ duration: st.dur, repeat: Infinity, delay: st.delay, ease: "easeInOut" }}
            />
          ))}
        </div>

        {/* Icon */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <motion.div
            style={{ transform: "scale(1.1)", transformOrigin: "center top" }}
            animate={{ filter: ["drop-shadow(0 0 0px #2563EB)", "drop-shadow(0 0 18px #2563EB)", "drop-shadow(0 0 0px #2563EB)"] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <CosmonautIcon />
          </motion.div>
        </div>

        {/* Highlighted text block */}
        <div style={{
          marginTop: 40,
          background: "linear-gradient(135deg, rgba(37,99,235,0.18), rgba(29,78,216,0.1))",
          border: "1px solid rgba(96,165,250,0.35)",
          borderRadius: 14,
          padding: "14px 16px",
          textAlign: "center",
          boxShadow: "0 0 20px rgba(37,99,235,0.15), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}>
          <motion.div
            style={{ fontSize: 14, fontWeight: 900, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8, color: "#FBBF24" }}
            animate={{ textShadow: ["0 0 0px #FBBF24", "0 0 10px #FBBF24", "0 0 0px #FBBF24"] }}
            transition={{ duration: 2.5, repeat: Infinity }}
          >
            🚀 Johnny
          </motion.div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.9)", lineHeight: 1.65 }}>
            Our cosmonaut Johnny is ready<br />to launch awesome projects
          </div>
        </div>
        {/* HUD bars */}
        <div style={{ marginTop: 14 }}>
          {([
            { label: "FUEL", val: Math.min(100, (10 - count) * 10), color: "#F97316" },
            { label: "PWR",  val: Math.min(100, (10 - count) * 10), color: "#60A5FA" },
          ] as { label: string; val: number; color: string }[]).map(bar => (
            <div key={bar.label} style={{ marginBottom: 7 }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", letterSpacing: 2, marginBottom: 3 }}>{bar.label}</div>
              <div style={{ width: 130, height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
                <motion.div
                  style={{ height: "100%", background: bar.color, borderRadius: 2 }}
                  animate={{ width: `${bar.val}%` }}
                  transition={{ duration: 0.9 }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Countdown */}
      <div style={{ position: "absolute", top: "8%", left: "50%", transform: "translateX(-50%)", textAlign: "center", zIndex: 20 }}>
        <div style={{ fontSize: 10, letterSpacing: 6, color: "#60A5FA", textTransform: "uppercase", marginBottom: 6, fontWeight: 700 }}>
          T — MINUS
        </div>
        <motion.div
          key={count}
          style={{
            fontSize: count === 0 ? 80 : 108, fontWeight: 900, lineHeight: 1,
            color: count <= 3 ? "#F97316" : "#ffffff",
            textShadow: count <= 3
              ? "0 0 40px rgba(249,115,22,0.8), 0 0 80px rgba(249,115,22,0.4)"
              : "0 0 40px rgba(37,99,235,0.9), 0 0 80px rgba(29,78,216,0.5)",
            fontFamily: "system-ui, monospace",
          }}
          initial={{ scale: 1.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          {launched ? "🚀" : count}
        </motion.div>
        <div style={{ fontSize: 11, color: count <= 3 ? "rgba(249,115,22,0.8)" : "rgba(255,255,255,0.3)", marginTop: 8, letterSpacing: 3, fontWeight: 600 }}>
          {statusLabel}
        </div>
      </div>

      {/* Smoke puffs before ignition */}
      {count <= 3 && !launched && (
        <div style={{ position: "absolute", bottom: 168, left: "50%", transform: "translateX(-50%)", zIndex: 12 }}>
          {[0, 1, 2].map(i => (
            <motion.div key={i}
              style={{ position: "absolute", left: -40, width: 80, height: 16, borderRadius: "50%", background: "rgba(200,200,200,0.14)", filter: "blur(7px)" }}
              animate={{ scaleX: [1, 2.5, 4], opacity: [0.5, 0.25, 0], y: [0, -(18 + i * 14)] }}
              transition={{ duration: 1.1, delay: i * 0.28, repeat: Infinity, ease: "easeOut" }}
            />
          ))}
        </div>
      )}

      {/* Rocket */}
      <motion.div
        style={{ position: "absolute", bottom: 150, left: "50%", marginLeft: -65, zIndex: 15 }}
        animate={launched
          ? { y: -(window.innerHeight + 400), opacity: [1, 1, 0.6, 0] }
          : { y: ignition ? [0, -5, 0] : [0, -2, 0] }
        }
        transition={launched
          ? { duration: 1.5, ease: [0.1, 0, 0.5, 1], opacity: { times: [0, 0.5, 0.8, 1], duration: 1.5 } }
          : { duration: ignition ? 0.32 : 1.8, repeat: Infinity, ease: "easeInOut" }
        }
      >
        <RocketSvg ignition={ignition} launched={launched} />
        {(ignition || launched) && (
          <motion.div
            style={{ position: "absolute", bottom: -26, left: "50%", marginLeft: -14, zIndex: 14 }}
            animate={{ scaleY: [1, 1.5, 0.7, 1.3, 1], scaleX: [1, 0.8, 1.1, 0.9, 1] }}
            transition={{ duration: 0.22, repeat: Infinity }}
          >
            <svg width="28" height="55" viewBox="0 0 28 55">
              <defs>
                <linearGradient id="ls-exh2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F97316" />
                  <stop offset="40%" stopColor="#FBBF24" />
                  <stop offset="100%" stopColor="transparent" />
                </linearGradient>
              </defs>
              <ellipse cx="14" cy="8" rx="12" ry="9" fill="#F97316" />
              <ellipse cx="14" cy="22" rx="8" ry="16" fill="url(#ls-exh2)" />
              <ellipse cx="14" cy="32" rx="5" ry="18" fill="#FBBF24" opacity="0.4" />
            </svg>
          </motion.div>
        )}
      </motion.div>

      {/* Launch pad */}
      <div style={{
        position: "absolute", bottom: 138, left: "50%", marginLeft: -65,
        width: 130, height: 14, zIndex: 13,
        background: "linear-gradient(180deg, #1e3a7e 0%, #0f1e45 100%)",
        borderRadius: "4px 4px 0 0",
        boxShadow: "0 -4px 18px rgba(37,99,235,0.22)",
      }} />

      {/* Earth at bottom */}
      <div style={{ position: "absolute", bottom: -180, left: "50%", transform: "translateX(-50%)", zIndex: 5, pointerEvents: "none", width: 1000 }}>
        <EarthBase />
      </div>
    </motion.div>
  );
}

// ── Travel Screen ─────────────────────────────────────────────────────────────

function TravelScreen({ onComplete }: { onComplete: () => void }) {
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    const t = setTimeout(() => onCompleteRef.current(), 4400);
    return () => clearTimeout(t);
  }, []);

  // Engine hum during travel
  useEffect(() => startEngineRumble(0.40), []);

  const starsDistant = useMemo(() => Array.from({ length: 50 }, (_, i) => ({
    id: i,
    x: (i * 47 + i * i * 13) % 100,
    size: 0.8 + (i % 2) * 0.6,
    dur: 7 + (i % 5) * 1.5,
    delay: -((i * 1.9) % 7),
  })), []);

  const starsMid = useMemo(() => Array.from({ length: 24 }, (_, i) => ({
    id: i,
    x: (i * 71 + i * i * 19) % 100,
    size: 1.8 + (i % 3) * 0.8,
    dur: 3.5 + (i % 4) * 0.9,
    delay: -((i * 1.1) % 3.5),
  })), []);

  const starsNear = useMemo(() => Array.from({ length: 16 }, (_, i) => ({
    id: i,
    x: (i * 89 + i * i * 23) % 100,
    size: 2.5 + (i % 3) * 1.2,
    dur: 1.6 + (i % 3) * 0.7,
    delay: -((i * 0.7) % 1.6),
  })), []);

  const meteors = useMemo(() => Array.from({ length: 8 }, (_, i) => ({
    id: i,
    x: 4 + (i * 41 + i * i * 17) % 86,
    len: 55 + (i % 4) * 45,
    width: 2.5 + (i % 3) * 1.2,
    dur: 0.9 + (i % 3) * 0.45,
    delay: (i * 0.62) % 4.4,
    angle: -6 + (i % 5) * 3,
  })), []);

  return (
    <motion.div
      className="fixed inset-0"
      style={{ zIndex: 150, background: "radial-gradient(ellipse at 50% 30%, #05102a 0%, #000005 100%)", overflow: "hidden" }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}
    >
      {/* Distant star dots */}
      {starsDistant.map(s => (
        <motion.div key={`td${s.id}`}
          style={{ position: "absolute", left: `${s.x}%`, top: 0, width: s.size, height: s.size, borderRadius: "50%", background: "rgba(200,215,255,0.65)", pointerEvents: "none" }}
          animate={{ y: ["-1vh", "102vh"] }}
          transition={{ duration: s.dur, delay: s.delay, repeat: Infinity, ease: "linear" }}
        />
      ))}

      {/* Mid — slight streaks */}
      {starsMid.map(s => (
        <motion.div key={`tm${s.id}`}
          style={{ position: "absolute", left: `${s.x}%`, top: 0, width: s.size, height: s.size * 3, borderRadius: "50%", background: "rgba(225,232,255,0.82)", pointerEvents: "none" }}
          animate={{ y: ["-1vh", "102vh"] }}
          transition={{ duration: s.dur, delay: s.delay, repeat: Infinity, ease: "linear" }}
        />
      ))}

      {/* Near — long streaks */}
      {starsNear.map(s => (
        <motion.div key={`tn${s.id}`}
          style={{ position: "absolute", left: `${s.x}%`, top: 0, width: s.size, height: s.size * 7, borderRadius: "50%", background: "linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0.9), rgba(255,255,255,0))", pointerEvents: "none", filter: "blur(0.4px)" }}
          animate={{ y: ["-1vh", "102vh"] }}
          transition={{ duration: s.dur, delay: s.delay, repeat: Infinity, ease: "linear" }}
        />
      ))}

      {/* Meteors with rock body + glowing trail */}
      {meteors.map(m => (
        <motion.div key={`me${m.id}`}
          style={{ position: "absolute", left: `${m.x}%`, top: 0, pointerEvents: "none", transform: `rotate(${m.angle}deg)`, transformOrigin: "top center" }}
          animate={{ y: ["-12vh", "112vh"] }}
          transition={{ duration: m.dur, delay: m.delay, repeat: Infinity, ease: "linear" }}
        >
          {/* Trail — above the rock */}
          <div style={{
            position: "absolute", top: -(m.len), left: "50%", transform: "translateX(-50%)",
            width: m.width * 0.9, height: m.len,
            background: "linear-gradient(to bottom, transparent 0%, rgba(255,200,140,0.12) 60%, rgba(255,180,100,0.40) 100%)",
            borderRadius: 4, filter: "blur(1.2px)",
          }} />
          {/* Rock body */}
          <div style={{
            width: m.width * 3, height: m.width * 2.2,
            borderRadius: "38% 52% 44% 56%",
            background: "radial-gradient(circle at 34% 32%, #8e8c94, #3e3c44)",
            marginLeft: -(m.width),
          }} />
        </motion.div>
      ))}

      {/* Destination moon faintly glowing ahead — top-right corner */}
      <motion.div
        style={{ position: "absolute", top: "-8%", right: "-3%", pointerEvents: "none", zIndex: 6 }}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 0.55, scale: 1.05 }}
        transition={{ duration: 4, ease: "easeOut" }}
      >
        <svg width="200" height="200" viewBox="0 0 200 200" fill="none">
          <defs>
            <radialGradient id="tv-dest-moon" cx="40%" cy="34%" r="62%">
              <stop offset="0%"   stopColor="#ccccd4" />
              <stop offset="50%"  stopColor="#888890" />
              <stop offset="100%" stopColor="#242430" />
            </radialGradient>
          </defs>
          <circle cx="100" cy="100" r="94" fill="url(#tv-dest-moon)" />
          <circle cx="68"  cy="66"  r="18" fill="rgba(0,0,0,0.20)" />
          <circle cx="125" cy="110" r="13" fill="rgba(0,0,0,0.16)" />
          <circle cx="72"  cy="130" r="9"  fill="rgba(0,0,0,0.14)" />
        </svg>
      </motion.div>

      {/* Rocket — flies diagonally from bottom-left to top-right moon */}
      <motion.div
        style={{ position: "absolute", zIndex: 20, pointerEvents: "none" }}
        initial={{ left: "-8%", top: "88%" }}
        animate={{ left: "100%", top: "-18%" }}
        transition={{ duration: 4.4, ease: [0.18, 0, 0.72, 1] }}
      >
        {/* Tilt toward direction of travel + subtle vibration */}
        <motion.div
          style={{ transformOrigin: "center center" }}
          animate={{ rotate: [45, 42, 46, 43, 45] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        >
          <RocketSvg ignition launched={false} hidePhoto={false} />
          {/* Flame */}
          <motion.div
            style={{ position: "absolute", bottom: -28, left: "50%", marginLeft: -15, zIndex: 21 }}
            animate={{ scaleY: [1, 1.55, 0.72, 1.38, 1], scaleX: [1, 0.80, 1.14, 0.86, 1] }}
            transition={{ duration: 0.19, repeat: Infinity }}
          >
            <svg width="30" height="64" viewBox="0 0 30 64">
              <defs>
                <linearGradient id="tv-flame" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#F97316" />
                  <stop offset="35%"  stopColor="#FBBF24" />
                  <stop offset="66%"  stopColor="#EF4444" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="transparent" />
                </linearGradient>
              </defs>
              <ellipse cx="15" cy="9"  rx="12" ry="10" fill="#F97316" />
              <ellipse cx="15" cy="26" rx="8"  ry="20" fill="url(#tv-flame)" />
              <ellipse cx="15" cy="40" rx="5"  ry="21" fill="#FBBF24" opacity="0.30" />
            </svg>
          </motion.div>
        </motion.div>
      </motion.div>

      {/* HUD label */}
      <motion.div
        style={{ position: "absolute", bottom: "9%", left: "50%", transform: "translateX(-50%)", textAlign: "center", zIndex: 25, pointerEvents: "none", whiteSpace: "nowrap" }}
        animate={{ opacity: [0.3, 0.88, 0.3] }}
        transition={{ duration: 2.6, repeat: Infinity }}
      >
        <div style={{ fontSize: 10, letterSpacing: 5, color: "rgba(96,165,250,0.88)", textTransform: "uppercase", fontWeight: 700 }}>
          ◆ En route to the Moon ◆
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Moon Scene ────────────────────────────────────────────────────────────────

function EarthInSky() {
  return (
    <svg width="130" height="130" viewBox="0 0 130 130" fill="none">
      <defs>
        <radialGradient id="esky-body" cx="34%" cy="28%" r="68%">
          <stop offset="0%"   stopColor="#80cef5" />
          <stop offset="25%"  stopColor="#2e80d0" />
          <stop offset="62%"  stopColor="#154a9e" />
          <stop offset="100%" stopColor="#071838" />
        </radialGradient>
        <radialGradient id="esky-atmo" cx="50%" cy="50%" r="52%">
          <stop offset="82%"  stopColor="rgba(80,150,255,0)" />
          <stop offset="100%" stopColor="rgba(100,180,255,0.45)" />
        </radialGradient>
        <radialGradient id="esky-spec" cx="30%" cy="26%" r="42%">
          <stop offset="0%"   stopColor="rgba(255,255,255,0.22)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <clipPath id="esky-clip"><circle cx="65" cy="65" r="58" /></clipPath>
      </defs>
      {/* Outer glow */}
      <circle cx="65" cy="65" r="62" fill="rgba(60,140,255,0.10)" />
      <circle cx="65" cy="65" r="58" fill="url(#esky-body)" />
      <g clipPath="url(#esky-clip)">
        {/* Continents */}
        <ellipse cx="44" cy="38" rx="16" ry="23" fill="rgba(50,160,60,0.72)" transform="rotate(-15 44 38)" />
        <ellipse cx="74" cy="30" rx="14" ry="16" fill="rgba(50,160,60,0.65)" transform="rotate(10 74 30)" />
        <ellipse cx="88" cy="62" rx="14" ry="19" fill="rgba(140,110,50,0.55)" transform="rotate(-18 88 62)" />
        <ellipse cx="40" cy="82" rx="12" ry="14" fill="rgba(50,160,60,0.58)" />
        <ellipse cx="62" cy="96" rx="10" ry="8"  fill="rgba(140,110,50,0.42)" transform="rotate(12 62 96)" />
        <ellipse cx="28" cy="54" rx="8"  ry="10" fill="rgba(50,160,60,0.48)" transform="rotate(8 28 54)" />
        {/* Ice caps */}
        <ellipse cx="65" cy="10"  rx="22" ry="9"  fill="rgba(240,248,255,0.65)" />
        <ellipse cx="65" cy="120" rx="16" ry="7"  fill="rgba(240,248,255,0.50)" />
        {/* Clouds */}
        <ellipse cx="54" cy="36"  rx="22" ry="5.5" fill="rgba(255,255,255,0.34)" transform="rotate(18 54 36)" />
        <ellipse cx="82" cy="56"  rx="18" ry="4.5" fill="rgba(255,255,255,0.28)" transform="rotate(-8 82 56)" />
        <ellipse cx="38" cy="64"  rx="16" ry="4"   fill="rgba(255,255,255,0.26)" transform="rotate(12 38 64)" />
        <ellipse cx="66" cy="84"  rx="20" ry="5"   fill="rgba(255,255,255,0.24)" transform="rotate(-5 66 84)" />
        <ellipse cx="90" cy="38"  rx="12" ry="3.5" fill="rgba(255,255,255,0.22)" transform="rotate(5 90 38)" />
      </g>
      <circle cx="65" cy="65" r="58" fill="url(#esky-atmo)" />
      <circle cx="65" cy="65" r="58" fill="url(#esky-spec)" />
    </svg>
  );
}

function MoonInBackground() {
  return (
    <svg width="340" height="340" viewBox="0 0 340 340" fill="none">
      <defs>
        <radialGradient id="bgm-body" cx="40%" cy="34%" r="66%">
          <stop offset="0%"   stopColor="#d8d8e0" />
          <stop offset="35%"  stopColor="#a0a0b0" />
          <stop offset="72%"  stopColor="#606070" />
          <stop offset="100%" stopColor="#282830" />
        </radialGradient>
        <radialGradient id="bgm-spec" cx="36%" cy="30%" r="44%">
          <stop offset="0%"   stopColor="rgba(255,255,255,0.16)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <radialGradient id="bgm-atmo" cx="50%" cy="50%" r="52%">
          <stop offset="86%"  stopColor="rgba(180,180,220,0)" />
          <stop offset="100%" stopColor="rgba(200,200,240,0.10)" />
        </radialGradient>
        <clipPath id="bgm-clip"><circle cx="170" cy="170" r="156" /></clipPath>
      </defs>
      <circle cx="170" cy="170" r="160" fill="rgba(200,200,240,0.05)" />
      <circle cx="170" cy="170" r="156" fill="url(#bgm-body)" />
      <g clipPath="url(#bgm-clip)">
        {/* Large crater */}
        <circle cx="128" cy="108" r="30" fill="rgba(0,0,0,0.20)" />
        <circle cx="128" cy="108" r="26" fill="rgba(70,70,82,0.32)" />
        <ellipse cx="122" cy="102" rx="16" ry="11" fill="rgba(180,180,200,0.12)" />
        {/* Medium crater */}
        <circle cx="228" cy="188" r="24" fill="rgba(0,0,0,0.17)" />
        <circle cx="228" cy="188" r="20" fill="rgba(70,70,82,0.26)" />
        <ellipse cx="223" cy="184" rx="12" ry="8" fill="rgba(180,180,200,0.10)" />
        {/* Small craters */}
        <circle cx="82"  cy="210" r="17" fill="rgba(0,0,0,0.14)" />
        <circle cx="82"  cy="210" r="14" fill="rgba(70,70,82,0.20)" />
        <circle cx="200" cy="82"  r="13" fill="rgba(0,0,0,0.17)" />
        <circle cx="200" cy="82"  r="10" fill="rgba(70,70,82,0.22)" />
        <circle cx="255" cy="130" r="9"  fill="rgba(0,0,0,0.14)" />
        <circle cx="155" cy="260" r="11" fill="rgba(0,0,0,0.12)" />
        <circle cx="100" cy="145" r="7"  fill="rgba(0,0,0,0.12)" />
        <circle cx="240" cy="250" r="8"  fill="rgba(0,0,0,0.10)" />
        {/* Mare (dark flat areas) */}
        <ellipse cx="155" cy="175" rx="55" ry="42" fill="rgba(0,0,0,0.10)" transform="rotate(-12 155 175)" />
      </g>
      <circle cx="170" cy="170" r="156" fill="url(#bgm-spec)" />
      <circle cx="170" cy="170" r="156" fill="url(#bgm-atmo)" />
    </svg>
  );
}

function SunInSky() {
  return (
    <svg width="90" height="90" viewBox="0 0 90 90" fill="none">
      <defs>
        <radialGradient id="sun-corona" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="rgba(255,248,200,0.60)" />
          <stop offset="28%"  stopColor="rgba(255,235,160,0.22)" />
          <stop offset="60%"  stopColor="rgba(255,210,80,0.09)" />
          <stop offset="100%" stopColor="rgba(255,190,40,0)" />
        </radialGradient>
        <radialGradient id="sun-core" cx="40%" cy="36%" r="58%">
          <stop offset="0%"   stopColor="#ffffff" />
          <stop offset="35%"  stopColor="#fffae0" />
          <stop offset="100%" stopColor="#ffd060" />
        </radialGradient>
      </defs>
      <circle cx="45" cy="45" r="44" fill="url(#sun-corona)" />
      <circle cx="45" cy="45" r="22" fill="rgba(255,240,160,0.18)" />
      <circle cx="45" cy="45" r="16" fill="url(#sun-core)" />
    </svg>
  );
}

function MoonTerrain() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 1440 620" preserveAspectRatio="xMidYMid slice" fill="none">
      <defs>
        {/* Perspective gradient: bright/blue near horizon (top), dark near camera (bottom) */}
        <linearGradient id="mt-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#8486a0" />
          <stop offset="6%"   stopColor="#6a6c84" />
          <stop offset="25%"  stopColor="#4e5068" />
          <stop offset="60%"  stopColor="#383a52" />
          <stop offset="100%" stopColor="#22233a" />
        </linearGradient>
        {/* Sky-reflection haze near horizon */}
        <linearGradient id="mt-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="rgba(150,165,230,0.22)" />
          <stop offset="18%"  stopColor="rgba(150,165,230,0.05)" />
          <stop offset="100%" stopColor="rgba(150,165,230,0)" />
        </linearGradient>
        {/* Curved horizon clip — creates convex planet-surface curvature */}
        <clipPath id="mt-curve">
          <path d="M -80 62 Q 720 8 1520 62 L 1520 700 L -80 700 Z" />
        </clipPath>
      </defs>

      <g clipPath="url(#mt-curve)">
        <rect width="1440" height="620" fill="url(#mt-ground)" />
        <rect width="1440" height="620" fill="url(#mt-haze)" />

      {/* ── Far craters (y 0-80, distant/small/flat) ── */}
      <ellipse cx="200" cy="42"  rx="20" ry="6"  fill="rgba(0,0,0,0.16)" />
      <ellipse cx="203" cy="44"  rx="16" ry="4"  fill="rgba(0,0,0,0.20)" />
      <ellipse cx="197" cy="39"  rx="7"  ry="2"  fill="rgba(210,215,235,0.07)" />

      <ellipse cx="760" cy="30"  rx="24" ry="7"  fill="rgba(0,0,0,0.15)" />
      <ellipse cx="763" cy="32"  rx="20" ry="5"  fill="rgba(0,0,0,0.19)" />
      <ellipse cx="757" cy="27"  rx="9"  ry="3"  fill="rgba(210,215,235,0.06)" />

      <ellipse cx="1200" cy="55" rx="18" ry="5"  fill="rgba(0,0,0,0.15)" />
      <ellipse cx="1202" cy="57" rx="14" ry="4"  fill="rgba(0,0,0,0.19)" />

      <ellipse cx="430"  cy="70" rx="15" ry="5"  fill="rgba(0,0,0,0.14)" />
      <ellipse cx="432"  cy="72" rx="12" ry="3"  fill="rgba(0,0,0,0.18)" />

      <ellipse cx="1020" cy="78" rx="22" ry="6"  fill="rgba(0,0,0,0.14)" />
      <ellipse cx="1023" cy="80" rx="18" ry="5"  fill="rgba(0,0,0,0.18)" />

      {/* ── Mid-distance craters (y 100-300) ── */}
      <ellipse cx="160" cy="185"  rx="44" ry="19" fill="rgba(0,0,0,0.18)" />
      <ellipse cx="164" cy="189"  rx="37" ry="15" fill="rgba(0,0,0,0.24)" />
      <ellipse cx="154" cy="178"  rx="18" ry="7"  fill="rgba(210,215,235,0.08)" />
      <ellipse cx="165" cy="193"  rx="23" ry="9"  fill="rgba(0,0,0,0.16)" />
      <ellipse cx="151" cy="174"  rx="9"  ry="3"  fill="rgba(235,237,255,0.07)" />

      <ellipse cx="1280" cy="165" rx="38" ry="16" fill="rgba(0,0,0,0.17)" />
      <ellipse cx="1283" cy="168" rx="32" ry="13" fill="rgba(0,0,0,0.23)" />
      <ellipse cx="1273" cy="158" rx="15" ry="6"  fill="rgba(210,215,235,0.08)" />
      <ellipse cx="1284" cy="172" rx="20" ry="8"  fill="rgba(0,0,0,0.14)" />

      <ellipse cx="490" cy="230"  rx="30" ry="12" fill="rgba(0,0,0,0.17)" />
      <ellipse cx="493" cy="233"  rx="25" ry="10" fill="rgba(0,0,0,0.22)" />
      <ellipse cx="486" cy="224"  rx="12" ry="5"  fill="rgba(210,215,235,0.07)" />
      <ellipse cx="494" cy="237"  rx="15" ry="6"  fill="rgba(0,0,0,0.14)" />

      <ellipse cx="1090" cy="250" rx="34" ry="14" fill="rgba(0,0,0,0.17)" />
      <ellipse cx="1093" cy="253" rx="28" ry="11" fill="rgba(0,0,0,0.22)" />
      <ellipse cx="1084" cy="244" rx="13" ry="5"  fill="rgba(210,215,235,0.07)" />

      <ellipse cx="320" cy="290"  rx="24" ry="10" fill="rgba(0,0,0,0.16)" />
      <ellipse cx="323" cy="293"  rx="20" ry="8"  fill="rgba(0,0,0,0.21)" />
      <ellipse cx="316" cy="284"  rx="10" ry="4"  fill="rgba(210,215,235,0.07)" />

      {/* ── Near craters (y 340-500) — avoid x=580-950 (character zone) ── */}
      <ellipse cx="100" cy="420"  rx="65" ry="26" fill="rgba(0,0,0,0.19)" />
      <ellipse cx="106" cy="426"  rx="55" ry="21" fill="rgba(0,0,0,0.27)" />
      <ellipse cx="90"  cy="410"  rx="26" ry="10" fill="rgba(210,215,235,0.09)" />
      <ellipse cx="107" cy="431"  rx="36" ry="13" fill="rgba(0,0,0,0.18)" />
      <ellipse cx="87"  cy="406"  rx="13" ry="5"  fill="rgba(235,237,255,0.07)" />

      <ellipse cx="1340" cy="400" rx="58" ry="23" fill="rgba(0,0,0,0.18)" />
      <ellipse cx="1344" cy="405" rx="50" ry="19" fill="rgba(0,0,0,0.26)" />
      <ellipse cx="1333" cy="391" rx="23" ry="9"  fill="rgba(210,215,235,0.08)" />
      <ellipse cx="1345" cy="410" rx="32" ry="12" fill="rgba(0,0,0,0.17)" />

      <ellipse cx="420" cy="380"  rx="30" ry="12" fill="rgba(0,0,0,0.17)" />
      <ellipse cx="423" cy="383"  rx="25" ry="10" fill="rgba(0,0,0,0.22)" />
      <ellipse cx="415" cy="374"  rx="12" ry="5"  fill="rgba(210,215,235,0.07)" />

      <ellipse cx="1150" cy="370" rx="28" ry="11" fill="rgba(0,0,0,0.17)" />
      <ellipse cx="1153" cy="373" rx="23" ry="9"  fill="rgba(0,0,0,0.22)" />
      <ellipse cx="1144" cy="364" rx="11" ry="4"  fill="rgba(210,215,235,0.07)" />

      {/* ── Foreground craters (y 500-620, very large) ── */}
      <ellipse cx="310" cy="555"  rx="90" ry="28" fill="rgba(0,0,0,0.20)" />
      <ellipse cx="318" cy="563"  rx="76" ry="22" fill="rgba(0,0,0,0.28)" />
      <ellipse cx="298" cy="542"  rx="35" ry="11" fill="rgba(210,215,235,0.09)" />
      <ellipse cx="319" cy="570"  rx="48" ry="15" fill="rgba(0,0,0,0.18)" />
      <ellipse cx="293" cy="537"  rx="17" ry="5"  fill="rgba(235,237,255,0.08)" />

      <ellipse cx="1150" cy="548" rx="82" ry="26" fill="rgba(0,0,0,0.19)" />
      <ellipse cx="1157" cy="555" rx="69" ry="21" fill="rgba(0,0,0,0.27)" />
      <ellipse cx="1140" cy="537" rx="32" ry="10" fill="rgba(210,215,235,0.09)" />
      <ellipse cx="1158" cy="561" rx="44" ry="14" fill="rgba(0,0,0,0.17)" />

      {/* Scattered micro-pits */}
      <ellipse cx="680" cy="120" rx="7" ry="3"  fill="rgba(0,0,0,0.11)" />
      <ellipse cx="830" cy="155" rx="6" ry="2"  fill="rgba(0,0,0,0.11)" />
      <ellipse cx="560" cy="310" rx="9" ry="4"  fill="rgba(0,0,0,0.11)" />
      <ellipse cx="1200" cy="300" rx="8" ry="3" fill="rgba(0,0,0,0.11)" />
      <ellipse cx="240" cy="350" rx="7" ry="3"  fill="rgba(0,0,0,0.11)" />
      <ellipse cx="1010" cy="330" rx="9" ry="3" fill="rgba(0,0,0,0.11)" />
      </g>
    </svg>
  );
}

function AstronautWithFlag() {
  return (
    <svg width="145" height="165" viewBox="0 0 145 165" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="aw-visor-clip">
          <circle cx="39" cy="62" r="18" />
        </clipPath>
        <clipPath id="aw-hat-clip">
          <polygon points="39,4 22,44 56,44" />
        </clipPath>
      </defs>
      {/* Flag pole */}
      <line x1="66" y1="18" x2="66" y2="115" stroke="#b0b0c8" strokeWidth="2.5" strokeLinecap="round" />
      {/* Flag */}
      <rect x="66" y="18" width="75" height="38" rx="3" fill="#1D4ED8" />
      <rect x="66" y="18" width="75" height="13" rx="3" fill="#2563EB" />
      <text x="103" y="38" textAnchor="middle" fill="white" fontSize="8.5" fontWeight="900" fontFamily="system-ui, sans-serif">JOHNNY</text>
      <text x="103" y="50" textAnchor="middle" fill="#93C5FD" fontSize="7" fontWeight="700" fontFamily="system-ui, sans-serif">★ B‑DAY STAR ★</text>

      {/* Legs */}
      <rect x="22" y="122" width="16" height="28" rx="4" fill="#d0d0e4" />
      <rect x="40" y="122" width="16" height="28" rx="4" fill="#c8c8dc" />
      {/* Boots */}
      <rect x="16" y="144" width="26" height="11" rx="4" fill="#7878a0" />
      <rect x="34" y="144" width="26" height="11" rx="4" fill="#7878a0" />
      {/* Body */}
      <rect x="18" y="82" width="42" height="44" rx="9" fill="#e8e8f4" />
      {/* Chest panel */}
      <rect x="26" y="92" width="22" height="16" rx="3" fill="#c0c8e8" />
      <circle cx="37" cy="100" r="3.5" fill="#3B82F6" />
      <rect x="26" y="94" width="6" height="2.5" rx="1" fill="rgba(96,165,250,0.6)" />
      <rect x="26" y="99" width="6" height="2.5" rx="1" fill="rgba(96,165,250,0.4)" />
      {/* Left arm (waving) */}
      <rect x="3" y="85" width="17" height="12" rx="5" fill="#e0e0f0" />
      <ellipse cx="1" cy="93" rx="8" ry="8" fill="#d0d0e4" />
      {/* Right arm */}
      <rect x="58" y="89" width="16" height="11" rx="5" fill="#e0e0f0" />
      {/* Helmet */}
      <circle cx="39" cy="62" r="24" fill="#e8e8f4" />
      <circle cx="39" cy="62" r="20" fill="#1a3a6a" />
      {/* Johnny's face in visor */}
      <image
        href={birthdayPersonImg}
        x={21} y={44}
        width={36} height={36}
        clipPath="url(#aw-visor-clip)"
        preserveAspectRatio="xMidYMid slice"
      />
      {/* Visor glare */}
      <ellipse cx="31" cy="54" rx="6" ry="3.5" fill="rgba(255,255,255,0.22)" transform="rotate(-20 31 54)" />
      {/* Helmet ring */}
      <circle cx="39" cy="62" r="24" fill="none" stroke="rgba(180,180,220,0.5)" strokeWidth="2" />
      {/* Party hat — colored stripes cone */}
      <g clipPath="url(#aw-hat-clip)">
        <polygon points="39,4 22,44 56,44" fill="#F472B6" />
        <polygon points="39,4 22,44 56,44" fill="none" />
        <rect x="20" y="4"  width="36" height="10" fill="#F472B6" />
        <rect x="20" y="14" width="36" height="10" fill="#A78BFA" />
        <rect x="20" y="24" width="36" height="10" fill="#34D399" />
        <rect x="20" y="34" width="36" height="10" fill="#FB923C" />
      </g>
      <polygon points="39,4 22,44 56,44" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.8" />
      {/* Hat elastic band at base */}
      <path d="M 22 44 Q 39 50 56 44" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
      {/* Pom-pom */}
      <circle cx="39" cy="5" r="5.5" fill="#FDE68A" />
      <circle cx="39" cy="5" r="3.5" fill="white" opacity="0.85" />
    </svg>
  );
}

function RobotWithCart() {
  return (
    <svg width="260" height="195" viewBox="0 0 260 195" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ overflow: "visible" }}>
      <defs>
        <radialGradient id="rb-shell" cx="30%" cy="22%" r="72%">
          <stop offset="0%"   stopColor="#eef2fa" />
          <stop offset="35%"  stopColor="#c0cee4" />
          <stop offset="100%" stopColor="#5a6880" />
        </radialGradient>
        <radialGradient id="rb-hi" cx="25%" cy="15%" r="50%">
          <stop offset="0%"   stopColor="rgba(255,255,255,0.42)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <radialGradient id="rb-ao" cx="50%" cy="50%" r="50%">
          <stop offset="50%"  stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.38)" />
        </radialGradient>
        <radialGradient id="rb-screen" cx="30%" cy="25%" r="70%">
          <stop offset="0%"   stopColor="#1a2440" />
          <stop offset="100%" stopColor="#060c1c" />
        </radialGradient>
        {/* Eye — warm friendly amber */}
        <radialGradient id="rb-eye" cx="38%" cy="34%" r="62%">
          <stop offset="0%"   stopColor="#fff4c8" />
          <stop offset="45%"  stopColor="#fbd060" />
          <stop offset="100%" stopColor="#e88010" />
        </radialGradient>
        <linearGradient id="rb-stripe" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#c85808" />
          <stop offset="50%"  stopColor="#f97316" />
          <stop offset="100%" stopColor="#c85808" />
        </linearGradient>
        <radialGradient id="rb-limb" cx="30%" cy="22%" r="68%">
          <stop offset="0%"   stopColor="#d0dcf0" />
          <stop offset="45%"  stopColor="#8898b8" />
          <stop offset="100%" stopColor="#445070" />
        </radialGradient>
        <linearGradient id="rb-cart" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#283e7c" />
          <stop offset="100%" stopColor="#121e46" />
        </linearGradient>
        <linearGradient id="rb-cart-side" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor="#182858" />
          <stop offset="100%" stopColor="#0b1632" />
        </linearGradient>
        <linearGradient id="ck1" x1="0" y1="0" x2="1" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4f83f5"/><stop offset="0.5" stopColor="#2563EB"/><stop offset="1" stopColor="#1740c0"/>
        </linearGradient>
        <linearGradient id="ck2" x1="0" y1="0" x2="1" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3b6fe0"/><stop offset="0.5" stopColor="#1D4ED8"/><stop offset="1" stopColor="#1132a8"/>
        </linearGradient>
        <linearGradient id="ck-side" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.38)" />
        </linearGradient>
      </defs>

      {/* Ground shadow */}
      <ellipse cx="54" cy="182" rx="58" ry="9" fill="rgba(0,0,0,0.42)" style={{ filter: "blur(5px)" }} />

      {/* ── ROBOT ── */}
      <g style={{ filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.75))" }}>

        {/* Left arm — simple single segment */}
        <rect x="5"  y="80" width="16" height="44" rx="8" fill="url(#rb-limb)" />
        <rect x="5"  y="80" width="16" height="44" rx="8" fill="url(#rb-hi)" />
        <ellipse cx="13" cy="128" rx="11" ry="7" fill="#2a3040" />

        {/* Right arm — goes down then horizontal */}
        <rect x="87" y="80" width="16" height="30" rx="8" fill="url(#rb-limb)" />
        <rect x="87" y="80" width="16" height="30" rx="8" fill="url(#rb-hi)" />
        {/* Elbow — simple circle */}
        <circle cx="95" cy="110" r="9" fill="#3a4258" stroke="rgba(249,115,22,0.40)" strokeWidth="1.8" />
        {/* Forearm horizontal */}
        <rect x="89" y="105" width="50" height="15" rx="7" fill="url(#rb-limb)" />
        <rect x="89" y="105" width="50" height="15" rx="7" fill="url(#rb-hi)" />
        {/* Hand grip */}
        <rect x="131" y="100" width="13" height="22" rx="6" fill="#252838" stroke="rgba(249,115,22,0.55)" strokeWidth="2" />

        {/* Body */}
        <rect x="14" y="68" width="82" height="56" rx="22" fill="url(#rb-shell)" />
        <rect x="14" y="68" width="82" height="56" rx="22" fill="url(#rb-hi)" />
        <rect x="14" y="68" width="82" height="56" rx="22" fill="url(#rb-ao)" />
        <path d="M32 70 Q54 66 76 70" stroke="rgba(255,255,255,0.52)" strokeWidth="2" fill="none" strokeLinecap="round" />
        {/* Orange stripe */}
        <rect x="14" y="100" width="82" height="9" fill="url(#rb-stripe)" />
        {/* Three LED dots on chest — simple */}
        <circle cx="38" cy="84" r="4" fill="#3B82F6" />
        <circle cx="54" cy="84" r="4" fill="#10B981" />
        <circle cx="70" cy="84" r="4" fill="#F59E0B" />
        <circle cx="38" cy="84" r="7" fill="rgba(59,130,246,0.22)" />
        <circle cx="54" cy="84" r="7" fill="rgba(16,185,129,0.22)" />
        <circle cx="70" cy="84" r="7" fill="rgba(245,158,11,0.22)" />

        {/* Neck */}
        <rect x="37" y="61" width="34" height="11" rx="5" fill="#3a4258" />
        <rect x="37" y="61" width="34" height="5"  rx="4" fill="rgba(255,255,255,0.12)" />

        {/* HEAD */}
        <rect x="8"  y="8"  width="92" height="60" rx="28" fill="url(#rb-shell)" />
        <rect x="8"  y="8"  width="92" height="60" rx="28" fill="url(#rb-hi)" />
        <rect x="8"  y="8"  width="92" height="60" rx="28" fill="url(#rb-ao)" />
        <path d="M26 10 Q54 5 82 10" stroke="rgba(255,255,255,0.50)" strokeWidth="2" fill="none" strokeLinecap="round" />
        {/* Face screen */}
        <rect x="16" y="16" width="76" height="46" rx="18" fill="url(#rb-screen)" />
        <rect x="16" y="16" width="76" height="46" rx="18" fill="none" stroke="rgba(96,165,250,0.25)" strokeWidth="1" />

        {/* ── EYES — round, friendly ── */}
        {/* Left eye glow */}
        <circle cx="37" cy="35" r="16" fill="rgba(251,185,50,0.18)" />
        {/* Left eye */}
        <circle cx="37" cy="35" r="13" fill="url(#rb-eye)" />
        <circle cx="37" cy="35" r="13" fill="none" stroke="rgba(249,150,20,0.60)" strokeWidth="2" />
        {/* Left eye specular */}
        <ellipse cx="31" cy="28" rx="6" ry="4" fill="rgba(255,255,255,0.88)" transform="rotate(-15 31 28)" />
        <circle  cx="42" cy="40" r="2.5" fill="rgba(255,255,255,0.30)" />
        {/* Right eye glow */}
        <circle cx="71" cy="35" r="16" fill="rgba(251,185,50,0.18)" />
        {/* Right eye */}
        <circle cx="71" cy="35" r="13" fill="url(#rb-eye)" />
        <circle cx="71" cy="35" r="13" fill="none" stroke="rgba(249,150,20,0.60)" strokeWidth="2" />
        {/* Right eye specular */}
        <ellipse cx="65" cy="28" rx="6" ry="4" fill="rgba(255,255,255,0.88)" transform="rotate(-15 65 28)" />
        <circle  cx="76" cy="40" r="2.5" fill="rgba(255,255,255,0.30)" />

        {/* Smile — simple friendly arc */}
        <path d="M 32 52 Q 54 62 76 52" stroke="#FBBF24" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M 32 52 Q 54 62 76 52" stroke="rgba(255,255,255,0.25)" strokeWidth="1" fill="none" strokeLinecap="round" />

        {/* Right ear nub */}
        <rect x="98" y="26" width="8" height="18" rx="4" fill="#3a4258" />

        {/* Antenna */}
        <rect x="51" y="5"  width="6"  height="8" rx="3" fill="#3a4258" />
        <circle cx="54" cy="4"  r="6"   fill="#1D4ED8" stroke="#60A5FA" strokeWidth="2" />
        <circle cx="54" cy="4"  r="2.5" fill="#93C5FD" />

        {/* Legs — simple two segments */}
        <rect x="19" y="119" width="24" height="38" rx="12" fill="url(#rb-limb)" />
        <rect x="19" y="119" width="24" height="38" rx="12" fill="url(#rb-hi)" />
        <rect x="65" y="119" width="24" height="38" rx="12" fill="url(#rb-limb)" />
        <rect x="65" y="119" width="24" height="38" rx="12" fill="url(#rb-hi)" />
        {/* Feet */}
        <ellipse cx="31" cy="158" rx="21" ry="8" fill="#252838" />
        <ellipse cx="77" cy="158" rx="21" ry="8" fill="#252838" />
        <ellipse cx="26" cy="154" rx="7"  ry="3" fill="rgba(255,255,255,0.10)" />
        <ellipse cx="72" cy="154" rx="7"  ry="3" fill="rgba(255,255,255,0.10)" />
      </g>

      {/* Cart handle bar */}
      <rect x="139" y="66" width="7" height="74" rx="3.5" fill="#34405e" stroke="rgba(96,165,250,0.42)" strokeWidth="1" />

      {/* ── CART + CAKE ── */}
      <g>
        <path d="M 234 108 L 250 102 L 250 162 L 234 168 Z" fill="url(#rb-cart-side)" stroke="rgba(96,165,250,0.18)" strokeWidth="1" />
        <rect x="142" y="110" width="92" height="58" rx="5" fill="url(#rb-cart)" stroke="rgba(96,165,250,0.45)" strokeWidth="1.5" />
        <rect x="142" y="110" width="92" height="5"  rx="3" fill="rgba(96,165,250,0.20)" />
        <rect x="142" y="110" width="92" height="58" rx="5" fill="url(#ck-side)" />
        {[159, 217].map(cx => (
          <g key={cx}>
            <circle cx={cx} cy="170" r="12"  fill="#0e1624" stroke="rgba(96,165,250,0.52)" strokeWidth="1.5" />
            <circle cx={cx} cy="170" r="6"   fill="#2563EB" />
            <circle cx={cx} cy="170" r="3"   fill="#60A5FA" />
            <line x1={cx-11} y1="170" x2={cx+11} y2="170" stroke="rgba(96,165,250,0.32)" strokeWidth="1" />
            <line x1={cx}    y1="158" x2={cx}    y2="182" stroke="rgba(96,165,250,0.32)" strokeWidth="1" />
          </g>
        ))}
        <rect x="150" y="78"  width="86" height="34" rx="4" fill="#221a5a" stroke="rgba(139,92,246,0.52)" strokeWidth="1.2" />
        <path d="M 150 78 L 162 72 L 248 72 L 236 78 Z" fill="#2b2074" />
        <rect x="150" y="78"  width="86" height="9"  fill="url(#ck1)" />
        <rect x="150" y="78"  width="86" height="34" rx="4" fill="url(#ck-side)" />
        {[156,168,180,192,204,216,226].map((x,i) => (
          <ellipse key={x} cx={x} cy={88+(i%3)*2} rx={4} ry={5+(i%2)*2} fill="url(#ck1)" />
        ))}
        <rect x="162" y="52"  width="62" height="28" rx="3" fill="#1a1452" stroke="rgba(139,92,246,0.52)" strokeWidth="1.2" />
        <path d="M 162 52 L 170 46 L 232 46 L 224 52 Z" fill="#231b6c" />
        <rect x="162" y="52"  width="62" height="7"  fill="url(#ck2)" />
        <rect x="162" y="52"  width="62" height="28" rx="3" fill="url(#ck-side)" />
        {[167,176,187,198,209,219].map((x,i) => (
          <ellipse key={x} cx={x} cy={60+(i%2)*2} rx={3.5} ry={4+(i%2)*2} fill="url(#ck2)" />
        ))}
        {[169,178,189,200,210].map((x,i) => (
          <g key={x}>
            <rect x={x-3} y={32} width={6} height={16} rx={2} fill={["#A78BFA","#F472B6","#34D399","#FB923C","#818CF8"][i]} />
            <ellipse cx={x} cy={31} rx={3.5} ry={4.5} fill="#FCD34D" />
            <ellipse cx={x} cy={32} rx={2}   ry={3}   fill="rgba(255,255,255,0.75)" />
          </g>
        ))}
        <line x1="189" y1="12" x2="189" y2="46" stroke="#b89060" strokeWidth="3" strokeLinecap="round" />
        <rect x="162" y="0"  width="54" height="34" rx="5" fill="#f2e0c0" stroke="#c8a060" strokeWidth="1.5" />
        <rect x="162" y="0"  width="54" height="10" rx="4" fill="#e8b84a" />
        <rect x="162" y="8"  width="54" height="2"  fill="#c89030" />
        <rect x="162" y="0"  width="54" height="34" rx="5" fill="url(#ck-side)" />
        <text x="189" y="19" textAnchor="middle" fill="#5a3008" fontSize="7.5" fontWeight="900" fontFamily="system-ui, sans-serif" letterSpacing="1.2">BIG BOSS</text>
        <text x="189" y="29" textAnchor="middle" fill="#8a5020" fontSize="6" fontFamily="system-ui, sans-serif">★ ★ ★</text>
      </g>
    </svg>
  );
}

function MoonScene({ onComplete, warmedUp = false }: { onComplete: () => void; warmedUp?: boolean }) {
  // When warmedUp, skip straight to phase 3 (everything already in place)
  const [phase, setPhase] = useState(warmedUp ? 3 : 0);
  const [robotArrived, setRobotArrived] = useState(warmedUp);
  const [showStretch, setShowStretch] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  const stopSqueakRef = useRef<(() => void) | null>(null);

  // Rocket landing sound (only on first visit)
  useEffect(() => {
    if (!warmedUp && phase === 1) playLandingSound();
  }, [phase]);

  // Cart squeak only when robot rolls in fresh (not when already arrived)
  useEffect(() => {
    if (phase < 3 || warmedUp) return;
    stopSqueakRef.current = startCartDrag();
    return () => { stopSqueakRef.current?.(); stopSqueakRef.current = null; };
  }, [phase]);

  // Show gift/stretch when robot arrives
  useEffect(() => {
    if (!robotArrived) return;
    stopSqueakRef.current?.();
    stopSqueakRef.current = null;
    const t = setTimeout(() => {
      if (warmedUp) setShowCelebration(true);
      else setShowStretch(true);
    }, warmedUp ? 800 : 600);
    return () => clearTimeout(t);
  }, [robotArrived]);

  // Phase auto-advance only on first visit
  useEffect(() => {
    if (warmedUp) return;
    // 0→1: rocket lands, 1→2: astronaut appears, 2→3: robot rolls in
    const delays = [2600, 900, 1200];
    let t: ReturnType<typeof setTimeout>;
    let idx = 0;
    const advance = () => {
      idx += 1;
      if (idx <= delays.length) {
        setPhase(idx);
        if (idx < delays.length) {
          t = setTimeout(advance, delays[idx]);
        }
      }
    };
    t = setTimeout(advance, delays[0]);
    return () => clearTimeout(t);
  }, []);

  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  return (
    <motion.div
      className="fixed inset-0"
      style={{ zIndex: 150, background: "#01030a", overflow: "hidden" }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}
    >
      {/* Stars — only visible in sky strip */}
      <Stars />

      {/* Earth — upper left */}
      <div style={{ position: "absolute", top: "2%", left: "4%", zIndex: 6 }}>
        <EarthInSky />
      </div>

      {/* Sun — upper right */}
      <div style={{ position: "absolute", top: "3%", right: "10%", zIndex: 6 }}>
        <SunInSky />
      </div>

      {/* Horizon glow where sky meets terrain */}
      <div style={{
        position: "absolute", bottom: 224, left: 0, right: 0,
        height: 50, zIndex: 7, pointerEvents: "none",
        background: "linear-gradient(to bottom, rgba(130,140,200,0.18), rgba(130,140,200,0.04), transparent)",
      }} />

      {/* Moon terrain — fills bottom ~75% of screen */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, top: "190px", zIndex: 8 }}>
        <MoonTerrain />
      </div>

      {/* Rocket — descends on first visit, already landed when warmedUp */}
      <motion.div
        style={{ position: "absolute", left: "42%", marginLeft: -65, top: 0, zIndex: 15 }}
        initial={{ y: warmedUp ? vh - 562 : -290 }}
        animate={{ y: vh - 562 }}
        transition={warmedUp ? { duration: 0 } : { duration: 2.3, ease: [0.15, 0, 0.3, 1] }}
      >
        <RocketSvg ignition={!warmedUp && phase === 0} launched={false} hidePhoto={warmedUp || phase >= 2} />
        {!warmedUp && phase === 0 && (
          <motion.div
            style={{ position: "absolute", bottom: -26, left: "50%", marginLeft: -14 }}
            animate={{ scaleY: [1, 1.5, 0.7, 1.3, 1], scaleX: [1, 0.8, 1.1, 0.9, 1] }}
            transition={{ duration: 0.22, repeat: Infinity }}
          >
            <svg width="28" height="55" viewBox="0 0 28 55">
              <defs>
                <linearGradient id="mn-retro" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F97316" />
                  <stop offset="45%" stopColor="#FBBF24" />
                  <stop offset="100%" stopColor="transparent" />
                </linearGradient>
              </defs>
              <ellipse cx="14" cy="8" rx="12" ry="9" fill="#F97316" />
              <ellipse cx="14" cy="22" rx="8" ry="16" fill="url(#mn-retro)" />
            </svg>
          </motion.div>
        )}
      </motion.div>

      {/* Landing dust — only on first arrival */}
      {!warmedUp && phase >= 1 && (
        <div style={{ position: "absolute", bottom: 224, left: "42%", zIndex: 14 }}>
          {[-55, 55].map((dx, i) => (
            <motion.div key={i}
              style={{ position: "absolute", left: dx - 30, width: 60, height: 16, borderRadius: "50%", background: "rgba(160,160,190,0.22)", filter: "blur(8px)" }}
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: [0, 2, 4], opacity: [0, 0.55, 0], x: [0, dx * 0.7] }}
              transition={{ duration: 1.3, ease: "easeOut" }}
            />
          ))}
        </div>
      )}

      {/* Astronaut with flag — appears after landing, already visible when warmedUp */}
      {(warmedUp || phase >= 2) && (
        <motion.div
          style={{ position: "absolute", bottom: 224, left: "calc(42% + 60px)", zIndex: 16, transformOrigin: "center bottom" }}
          initial={{ opacity: warmedUp ? 1 : 0, y: warmedUp ? 0 : 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={warmedUp ? { duration: 0 } : { duration: 0.7, ease: "easeOut" }}
        >
          <div style={{ transform: "scale(1.5)", transformOrigin: "center bottom" }}>
            <AstronautWithFlag />
          </div>
        </motion.div>
      )}

      {/* Robot with cart — rolls in fresh, or already at position when warmedUp */}
      {(warmedUp || phase >= 3) && (
        <motion.div
          style={{ position: "absolute", bottom: 222, zIndex: 16 }}
          initial={{ left: warmedUp ? "calc(42% + 200px)" : "110%" }}
          animate={{ left: "calc(42% + 200px)" }}
          transition={warmedUp ? { duration: 0 } : { duration: 5.5, ease: [0.03, 0, 0.18, 1] }}
          onAnimationComplete={warmedUp ? undefined : () => setRobotArrived(true)}
        >
          <RobotWithCart />
        </motion.div>
      )}

      {showStretch && <StretchModal onStart={() => onCompleteRef.current()} />}
      {showCelebration && <BirthdayCelebration onClose={() => onCompleteRef.current()} />}

    </motion.div>
  );
}

// ── Runaway button ────────────────────────────────────────────────────────────
const ARENA_W = 1200;
const ARENA_H = 700;

const BTN_STYLE = {
  background: "linear-gradient(135deg, #059669, #047857)",
  color: "#ffffff",
  border: "1px solid rgba(52,211,153,0.4)",
  borderRadius: 14,
  padding: "14px 30px",
  fontSize: 14,
  fontWeight: 800,
  letterSpacing: 1.5,
  textTransform: "uppercase" as const,
  boxShadow: "0 4px 24px rgba(5,150,105,0.45), inset 0 1px 0 rgba(255,255,255,0.1)",
  whiteSpace: "nowrap" as const,
  cursor: "pointer",
};

function RunawayButton({ onClick, paused }: {
  onClick: () => void;
  paused?: boolean;
}) {
  const [activated, setActivated] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const btnW = useRef(0);
  const btnH = useRef(0);
  const inlineRef = useRef<HTMLButtonElement>(null);

  const pausedRef = useRef(false);
  useEffect(() => { pausedRef.current = !!paused; }, [paused]);

  // On hover: snapshot inline button position, switch to fixed mode
  const handleMouseEnter = useCallback(() => {
    if (activated || !inlineRef.current) return;
    const r = inlineRef.current.getBoundingClientRect();
    btnW.current = r.width;
    btnH.current = r.height;
    setPos({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    setActivated(true);
  }, [activated]);

  const onWindowMouseMove = useCallback((e: MouseEvent) => {
    setPos(prev => {
      if (!prev || pausedRef.current) return prev;
      const cx = prev.x;
      const cy = prev.y;
      const dx = cx - e.clientX;
      const dy = cy - e.clientY;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;

      if (dist > 150) return prev;

      const push = 220;
      const pad  = 16;
      const BW = btnW.current / 2;
      const BH = btnH.current / 2;

      const aLeft  = (window.innerWidth  - ARENA_W) / 2;
      const aTop   = (window.innerHeight - ARENA_H) / 2;
      const aRight  = aLeft + ARENA_W;
      const aBottom = aTop  + ARENA_H;

      const newX = Math.max(aLeft + BW + pad, Math.min(aRight  - BW - pad, cx + (dx / dist) * push));
      const newY = Math.max(aTop  + BH + pad, Math.min(aBottom - BH - pad, cy + (dy / dist) * push));

      return { x: newX, y: newY };
    });
  }, []);

  useEffect(() => {
    if (!activated) return;
    window.addEventListener("mousemove", onWindowMouseMove);
    return () => window.removeEventListener("mousemove", onWindowMouseMove);
  }, [activated, onWindowMouseMove]);

  // Before first hover — normal inline button in the flex row
  if (!activated) {
    return (
      <motion.button
        ref={inlineRef}
        onClick={() => { playClickSound(); onClick(); }}
        onMouseEnter={handleMouseEnter}
        style={BTN_STYLE}
        whileHover={{ scale: 1.12 }}
        whileTap={{ scale: 1.05 }}
      >
        CLAIM GIFT
      </motion.button>
    );
  }

  // After first hover — fixed, starts at snapshotted position, then runs away
  if (!pos) return null;
  return (
    <motion.button
      onClick={() => { playClickSound(); onClick(); }}
      initial={{ x: pos.x - btnW.current / 2, y: pos.y - btnH.current / 2 }}
      animate={{ x: pos.x - btnW.current / 2, y: pos.y - btnH.current / 2 }}
      whileHover={{ scale: 1.12 }}
      whileTap={{ scale: 1.05 }}
      transition={{ type: "spring", stiffness: 340, damping: 28 }}
      style={{ ...BTN_STYLE, position: "fixed", top: 0, left: 0, zIndex: 20 }}
    >
      CLAIM GIFT
    </motion.button>
  );
}

// ── Warmup Screen ─────────────────────────────────────────────────────────────

function CosmoStand() {
  return (
    <svg width="120" height="252" viewBox="0 0 120 252" fill="none"
      style={{ overflow: "visible", filter: "drop-shadow(0 8px 26px rgba(140,80,255,0.5))" }}>
      <defs>
        <radialGradient id="wx-helm" cx="36%" cy="28%" r="70%">
          <stop offset="0%"   stopColor="#eaf0fc" />
          <stop offset="30%"  stopColor="#c0d0e8" />
          <stop offset="65%"  stopColor="#8898c0" />
          <stop offset="100%" stopColor="#445070" />
        </radialGradient>
        <radialGradient id="wx-hi" cx="32%" cy="22%" r="72%">
          <stop offset="0%"   stopColor="rgba(255,255,255,0.36)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
        <linearGradient id="wx-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#f5c842" />
          <stop offset="50%"  stopColor="#d4a017" />
          <stop offset="100%" stopColor="#f5c842" />
        </linearGradient>
        <clipPath id="wx-visor-clip">
          <ellipse cx="60" cy="52" rx="22" ry="17" />
        </clipPath>
      </defs>
      {/* Body */}
      <path d="M 60 94 L 60 164" stroke="#c8d8ec" strokeWidth="56" strokeLinecap="round" />
      <path d="M 60 94 L 60 164" stroke="rgba(255,255,255,0.22)" strokeWidth="28" strokeLinecap="round" />
      {/* Left arm */}
      <path d="M 32 108 L 18 162" stroke="#c8d8ec" strokeWidth="22" strokeLinecap="round" />
      <path d="M 32 108 L 18 162" stroke="rgba(255,255,255,0.18)" strokeWidth="10" strokeLinecap="round" />
      {/* Right arm */}
      <path d="M 88 108 L 102 162" stroke="#c8d8ec" strokeWidth="22" strokeLinecap="round" />
      <path d="M 88 108 L 102 162" stroke="rgba(255,255,255,0.18)" strokeWidth="10" strokeLinecap="round" />
      {/* Left leg */}
      <path d="M 46 164 L 40 230" stroke="#c8d8ec" strokeWidth="26" strokeLinecap="round" />
      <path d="M 46 164 L 40 230" stroke="rgba(255,255,255,0.18)" strokeWidth="12" strokeLinecap="round" />
      {/* Right leg */}
      <path d="M 74 164 L 80 230" stroke="#c8d8ec" strokeWidth="26" strokeLinecap="round" />
      <path d="M 74 164 L 80 230" stroke="rgba(255,255,255,0.18)" strokeWidth="12" strokeLinecap="round" />
      {/* Boots */}
      <ellipse cx="40" cy="234" rx="18" ry="10" fill="#2a3a5a" />
      <ellipse cx="80" cy="234" rx="18" ry="10" fill="#2a3a5a" />
      {/* Neck */}
      <rect x="47" y="88" width="26" height="12" rx="5" fill="#c8d8ec" />
      {/* Helmet */}
      <circle cx="60" cy="50" r="40" fill="url(#wx-helm)" />
      <circle cx="60" cy="50" r="40" fill="url(#wx-hi)" />
      <ellipse cx="60" cy="52" rx="27" ry="22" fill="url(#wx-gold)" />
      <image href={birthdayPersonImg} x={36} y={33} width={48} height={40} clipPath="url(#wx-visor-clip)" preserveAspectRatio="xMidYMid slice"/>
      <ellipse cx="60" cy="52" rx="22" ry="17" fill="rgba(200,160,20,0.10)"/>
      <ellipse cx="60" cy="52" rx="22" ry="17" fill="none" stroke="url(#wx-gold)" strokeWidth="1.5"/>
      <ellipse cx="50" cy="44" rx="7" ry="5" fill="rgba(255,255,255,0.20)" transform="rotate(-20 50 44)" />
      <ellipse cx="43" cy="32" rx="12" ry="8" fill="rgba(255,255,255,0.18)" transform="rotate(-28 43 32)" />
      {/* Antenna */}
      <rect x="74" y="12" width="4" height="18" rx="2" fill="#b8cce4" />
      <circle cx="76" cy="11" r="5" fill="#b8cce4" />
      <circle cx="76" cy="11" r="3" fill="#93C5FD" />
      {/* Chest panel */}
      <rect x="40" y="108" width="40" height="18" rx="5" fill="rgba(0,0,0,0.22)" />
      <circle cx="49" cy="117" r="3" fill="#22D3EE" />
      <circle cx="60" cy="117" r="3" fill="#4ADE80" />
      <circle cx="71" cy="117" r="3" fill="#F97316" />
      {/* Gloves */}
      <circle cx="18" cy="163" r="10" fill="#aabdd4" />
      <circle cx="102" cy="163" r="10" fill="#aabdd4" />
    </svg>
  );
}

function CosmoWarrior() {
  return (
    <svg width="320" height="240" viewBox="0 0 320 240" fill="none"
      style={{ overflow: "visible", filter: "drop-shadow(0 8px 26px rgba(140,80,255,0.5))" }}>
      <defs>
        <radialGradient id="ww-helm" cx="36%" cy="28%" r="70%">
          <stop offset="0%"   stopColor="#eaf0fc" />
          <stop offset="30%"  stopColor="#c0d0e8" />
          <stop offset="65%"  stopColor="#8898c0" />
          <stop offset="100%" stopColor="#445070" />
        </radialGradient>
        <radialGradient id="ww-hi" cx="32%" cy="22%" r="72%">
          <stop offset="0%"   stopColor="rgba(255,255,255,0.36)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
        <linearGradient id="ww-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#f5c842" />
          <stop offset="50%"  stopColor="#d4a017" />
          <stop offset="100%" stopColor="#f5c842" />
        </linearGradient>
        <clipPath id="ww-visor-clip">
          <ellipse cx="160" cy="50" rx="22" ry="17" />
        </clipPath>
      </defs>
      {/* Body — slight right lean for disco hip */}
      <path d="M 160 90 L 165 158" stroke="#c8d8ec" strokeWidth="56" strokeLinecap="round" />
      <path d="M 160 90 L 165 158" stroke="rgba(255,255,255,0.22)" strokeWidth="28" strokeLinecap="round" />
      {/* RIGHT arm pointing UP-RIGHT — Saturday Night Fever! */}
      <path d="M 192 106 L 298 40" stroke="#c8d8ec" strokeWidth="22" strokeLinecap="round" />
      <path d="M 192 106 L 298 40" stroke="rgba(255,255,255,0.18)" strokeWidth="10" strokeLinecap="round" />
      {/* LEFT arm pointing DOWN-LEFT */}
      <path d="M 128 108 L 22 174" stroke="#c8d8ec" strokeWidth="22" strokeLinecap="round" />
      <path d="M 128 108 L 22 174" stroke="rgba(255,255,255,0.18)" strokeWidth="10" strokeLinecap="round" />
      {/* Gloves */}
      <circle cx="300" cy="39" r="13" fill="#aabdd4" />
      <circle cx="20" cy="175" r="13" fill="#aabdd4" />
      {/* Left leg (hip thrust, knee slightly bent) */}
      <path d="M 148 158 L 136 196 L 124 228" stroke="#c8d8ec" strokeWidth="26" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 148 158 L 136 196 L 124 228" stroke="rgba(255,255,255,0.18)" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx="120" cy="231" rx="22" ry="11" fill="#2a3a5a" />
      {/* Right leg (wide out — disco stance) */}
      <path d="M 184 158 L 204 192 L 218 226" stroke="#c8d8ec" strokeWidth="26" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 184 158 L 204 192 L 218 226" stroke="rgba(255,255,255,0.18)" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx="220" cy="229" rx="22" ry="11" fill="#2a3a5a" />
      {/* Neck */}
      <rect x="147" y="84" width="26" height="12" rx="5" fill="#c8d8ec" />
      {/* Helmet */}
      <circle cx="160" cy="48" r="40" fill="url(#ww-helm)" />
      <circle cx="160" cy="48" r="40" fill="url(#ww-hi)" />
      <ellipse cx="160" cy="50" rx="27" ry="22" fill="url(#ww-gold)" />
      <image href={birthdayPersonImg} x={136} y={31} width={48} height={40} clipPath="url(#ww-visor-clip)" preserveAspectRatio="xMidYMid slice"/>
      <ellipse cx="160" cy="50" rx="22" ry="17" fill="rgba(200,160,20,0.10)"/>
      <ellipse cx="160" cy="50" rx="22" ry="17" fill="none" stroke="url(#ww-gold)" strokeWidth="1.5"/>
      <ellipse cx="150" cy="42" rx="7" ry="5" fill="rgba(255,255,255,0.20)" transform="rotate(-20 150 42)" />
      <ellipse cx="143" cy="30" rx="12" ry="8" fill="rgba(255,255,255,0.18)" transform="rotate(-28 143 30)" />
      {/* Antenna */}
      <rect x="174" y="10" width="4" height="18" rx="2" fill="#b8cce4" />
      <circle cx="176" cy="9" r="5" fill="#b8cce4" />
      <circle cx="176" cy="9" r="3" fill="#93C5FD" />
      {/* Chest panel */}
      <rect x="143" y="104" width="40" height="18" rx="5" fill="rgba(0,0,0,0.22)" />
      <circle cx="152" cy="113" r="3" fill="#22D3EE" />
      <circle cx="163" cy="113" r="3" fill="#4ADE80" />
      <circle cx="174" cy="113" r="3" fill="#F97316" />
    </svg>
  );
}

function CosmoTree() {
  return (
    <svg width="160" height="272" viewBox="0 0 160 272" fill="none"
      style={{ overflow: "visible", filter: "drop-shadow(0 8px 26px rgba(140,80,255,0.5))" }}>
      <defs>
        <radialGradient id="wt-helm" cx="36%" cy="28%" r="70%">
          <stop offset="0%"   stopColor="#eaf0fc" />
          <stop offset="30%"  stopColor="#c0d0e8" />
          <stop offset="65%"  stopColor="#8898c0" />
          <stop offset="100%" stopColor="#445070" />
        </radialGradient>
        <radialGradient id="wt-hi" cx="32%" cy="22%" r="72%">
          <stop offset="0%"   stopColor="rgba(255,255,255,0.36)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
        <linearGradient id="wt-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#f5c842" />
          <stop offset="50%"  stopColor="#d4a017" />
          <stop offset="100%" stopColor="#f5c842" />
        </linearGradient>
        <clipPath id="wt-visor-clip">
          <ellipse cx="80" cy="230" rx="22" ry="17" />
        </clipPath>
      </defs>
      {/* HEADSTAND — legs up, helmet on floor */}
      {/* Left leg up-left */}
      <path d="M 66 112 L 36 24" stroke="#c8d8ec" strokeWidth="26" strokeLinecap="round" />
      <path d="M 66 112 L 36 24" stroke="rgba(255,255,255,0.18)" strokeWidth="12" strokeLinecap="round" />
      {/* Right leg up-right */}
      <path d="M 94 112 L 124 24" stroke="#c8d8ec" strokeWidth="26" strokeLinecap="round" />
      <path d="M 94 112 L 124 24" stroke="rgba(255,255,255,0.18)" strokeWidth="12" strokeLinecap="round" />
      {/* Boots at the TOP */}
      <ellipse cx="34" cy="20" rx="18" ry="10" fill="#2a3a5a" />
      <ellipse cx="126" cy="20" rx="18" ry="10" fill="#2a3a5a" />
      {/* Body going DOWN (upside-down) */}
      <path d="M 80 112 L 80 192" stroke="#c8d8ec" strokeWidth="56" strokeLinecap="round" />
      <path d="M 80 112 L 80 192" stroke="rgba(255,255,255,0.22)" strokeWidth="28" strokeLinecap="round" />
      {/* Chest panel (mid-body when upside down) */}
      <rect x="60" y="138" width="40" height="18" rx="5" fill="rgba(0,0,0,0.22)" />
      <circle cx="69" cy="147" r="3" fill="#22D3EE" />
      <circle cx="80" cy="147" r="3" fill="#4ADE80" />
      <circle cx="91" cy="147" r="3" fill="#F97316" />
      {/* Arms bracing floor beside helmet */}
      <path d="M 56 192 L 20 224" stroke="#c8d8ec" strokeWidth="22" strokeLinecap="round" />
      <path d="M 56 192 L 20 224" stroke="rgba(255,255,255,0.18)" strokeWidth="10" strokeLinecap="round" />
      <path d="M 104 192 L 140 224" stroke="#c8d8ec" strokeWidth="22" strokeLinecap="round" />
      <path d="M 104 192 L 140 224" stroke="rgba(255,255,255,0.18)" strokeWidth="10" strokeLinecap="round" />
      {/* Gloves on floor */}
      <circle cx="18" cy="225" r="12" fill="#aabdd4" />
      <circle cx="142" cy="225" r="12" fill="#aabdd4" />
      {/* Neck (short connector at bottom) */}
      <rect x="67" y="192" width="26" height="12" rx="5" fill="#c8d8ec" />
      {/* Helmet at BOTTOM */}
      <circle cx="80" cy="230" r="38" fill="url(#wt-helm)" />
      <circle cx="80" cy="230" r="38" fill="url(#wt-hi)" />
      <ellipse cx="80" cy="232" rx="27" ry="22" fill="url(#wt-gold)" />
      <image href={birthdayPersonImg} x={56} y={213} width={48} height={40} clipPath="url(#wt-visor-clip)" preserveAspectRatio="xMidYMid slice"/>
      <ellipse cx="80" cy="230" rx="22" ry="17" fill="rgba(200,160,20,0.10)"/>
      <ellipse cx="80" cy="230" rx="22" ry="17" fill="none" stroke="url(#wt-gold)" strokeWidth="1.5"/>
      <ellipse cx="70" cy="222" rx="7" ry="5" fill="rgba(255,255,255,0.20)" transform="rotate(-20 70 222)" />
      <ellipse cx="63" cy="210" rx="12" ry="8" fill="rgba(255,255,255,0.18)" transform="rotate(-28 63 210)" />
      {/* Antenna pointing DOWN (since upside-down) */}
      <rect x="84" y="258" width="4" height="14" rx="2" fill="#b8cce4" />
      <circle cx="86" cy="272" r="5" fill="#b8cce4" />
      <circle cx="86" cy="272" r="3" fill="#93C5FD" />
    </svg>
  );
}

function DiscoBall({ xPct, delay }: { xPct: number; delay: number }) {
  const tileColors = ["#ff4081","#40c4ff","#e040fb","#69ff47","#ffea00","#ff6e40","#e8f8ff","#00e5ff"];
  return (
    <div style={{ position: "absolute", top: 0, left: `${xPct}%`, transform: "translateX(-50%)", zIndex: 4, pointerEvents: "none" }}>
      <div style={{ width: 2, height: 64, background: "rgba(255,255,255,0.25)", margin: "0 auto" }} />
      <motion.div
        animate={{ rotateY: [0, 360] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "linear", delay }}
        style={{
          width: 60, height: 60, borderRadius: "50%",
          background: "radial-gradient(circle at 32% 26%, #ffffff 0%, #cccccc 18%, #666 55%, #222 100%)",
          boxShadow: "0 0 30px 8px rgba(255,255,255,0.22), inset 0 2px 8px rgba(0,0,0,0.5)",
          position: "relative", overflow: "hidden",
        }}
      >
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} style={{
            position: "absolute",
            width: 7, height: 7, borderRadius: 2,
            background: tileColors[i % tileColors.length],
            opacity: 0.75,
            left: `${(i % 6) * 16 + 2}%`,
            top: `${Math.floor(i / 6) * 25 + 2}%`,
          }} />
        ))}
      </motion.div>
    </div>
  );
}

function DiscoRoom() {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#06001a" }}>
      {/* Back wall */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "57%",
        background: "linear-gradient(180deg, #0b0022 0%, #1c003c 55%, #290058 100%)" }} />

      {/* Sweeping disco lights */}
      {([
        { color: "#ff4081", lx: "18%", ly: "42%", dur: 5.2, del: 0 },
        { color: "#40c4ff", lx: "72%", ly: "38%", dur: 4.0, del: 0.9 },
        { color: "#e040fb", lx: "50%", ly: "48%", dur: 6.4, del: 1.8 },
        { color: "#69ff47", lx: "34%", ly: "56%", dur: 3.8, del: 0.5 },
        { color: "#ffea00", lx: "64%", ly: "50%", dur: 5.0, del: 2.2 },
      ] as { color: string; lx: string; ly: string; dur: number; del: number }[]).map((l, i) => (
        <motion.div key={i}
          style={{
            position: "absolute", left: l.lx, top: l.ly,
            width: 260, height: 260, borderRadius: "50%",
            background: `radial-gradient(circle, ${l.color}40 0%, transparent 65%)`,
            transform: "translate(-50%, -50%)", pointerEvents: "none", zIndex: 2,
          }}
          animate={{ x: [-50, 50, -30, 60, -50], y: [-20, 25, -35, 15, -20], opacity: [0.5, 0.95, 0.55, 0.88, 0.5] }}
          transition={{ duration: l.dur, repeat: Infinity, ease: "easeInOut", delay: l.del }}
        />
      ))}

      {/* Horizon neon strip */}
      <div style={{
        position: "absolute", top: "56%", left: 0, right: 0, height: 3,
        background: "linear-gradient(90deg, transparent 0%, #e040fb 22%, #40c4ff 44%, #69ff47 66%, #ff4081 88%, transparent 100%)",
        boxShadow: "0 0 20px 6px rgba(224,64,251,0.55), 0 0 40px 10px rgba(64,196,255,0.3)",
        zIndex: 3,
      }} />

      {/* Perspective floor */}
      <div style={{
        position: "absolute", bottom: 0, left: "-40%", right: "-40%", height: "46%",
        background: "#08001e",
        transform: "perspective(480px) rotateX(60deg)",
        transformOrigin: "50% 0%",
        overflow: "hidden", zIndex: 1,
      }}>
        {Array.from({ length: 11 }).map((_, i) => (
          <div key={`h${i}`} style={{
            position: "absolute", left: 0, right: 0,
            top: `${i * 10}%`, height: 1,
            background: i % 2 === 0 ? "rgba(224,64,251,0.55)" : "rgba(64,196,255,0.35)",
          }} />
        ))}
        {Array.from({ length: 13 }).map((_, i) => (
          <div key={`v${i}`} style={{
            position: "absolute", top: 0, bottom: 0,
            left: `${i * 8.33}%`, width: 1,
            background: i % 2 === 0 ? "rgba(224,64,251,0.45)" : "rgba(64,196,255,0.28)",
          }} />
        ))}
      </div>

      {/* Vertical neon accent strips */}
      {([
        { l: "8%",  c: "#e040fb", o: 0.55 },
        { l: "20%", c: "#ff4081", o: 0.32 },
        { l: "80%", c: "#40c4ff", o: 0.55 },
        { l: "92%", c: "#69ff47", o: 0.38 },
      ] as { l: string; c: string; o: number }[]).map(({ l, c, o }, i) => (
        <div key={i} style={{
          position: "absolute", top: "6%", bottom: "44%", left: l,
          width: 2,
          background: `linear-gradient(180deg, transparent, ${c}, transparent)`,
          boxShadow: `0 0 14px 5px ${c}66`,
          opacity: o, zIndex: 2,
        }} />
      ))}

      {/* Disco balls */}
      <DiscoBall xPct={28} delay={0} />
      <DiscoBall xPct={72} delay={0.7} />
    </div>
  );
}

function WarmupScreen({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState(0);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  // Start disco music and stop it when the screen unmounts
  useEffect(() => {
    const stop = startDiscoMusic();
    return stop;
  }, []);

  // Phase durations ms: 0=room in, 1=cosmo enters, 2=mat unrolls,
  // 3=→warrior, 4=warrior hold, 5=→tree, 6=tree hold, 7=→stand, 8=final hold
  const TIMINGS = [500, 900, 600, 350, 2000, 350, 2000, 600, 1000];

  useEffect(() => {
    if (phase >= TIMINGS.length) { onCompleteRef.current(); return; }
    const t = setTimeout(() => setPhase(p => p + 1), TIMINGS[phase]);
    return () => clearTimeout(t);
  }, [phase]);

  const pose = (phase >= 3 && phase <= 4) ? "warrior" : (phase >= 5 && phase <= 6) ? "tree" : "stand";
  const label = phase === 4 ? "Disco Fever! 🕺" : phase === 6 ? "Headstand! 🙃" : phase >= 8 ? "Ready to rumble! 💪" : null;

  return (
    <motion.div
      style={{ position: "fixed", inset: 0, zIndex: 150, fontFamily: "system-ui, sans-serif" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <DiscoRoom />

      {/* Left wall panel — cosmonaut enters from behind here */}
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: 100, zIndex: 8,
        background: "linear-gradient(to right, #130028, #22004a)",
        borderRight: "3px solid rgba(180,80,255,0.5)",
        boxShadow: "5px 0 28px rgba(130,50,255,0.35)",
      }} />

      {/* Static background props — rocket + robot parked in the room */}
      <div style={{
        position: "absolute", bottom: "25%", right: "5%", zIndex: 3,
        transform: "scale(0.28)", transformOrigin: "center bottom",
        opacity: 0.52, filter: "brightness(0.7) saturate(0.6)",
        pointerEvents: "none",
      }}>
        <RocketSvg ignition={false} launched={false} />
      </div>
      <div style={{
        position: "absolute", bottom: "25%", right: "18%", zIndex: 3,
        transform: "scale(0.34)", transformOrigin: "center bottom",
        opacity: 0.5, filter: "brightness(0.7) saturate(0.6)",
        pointerEvents: "none",
      }}>
        <RobotWithCart />
      </div>

      {/* Yoga mat */}
      {phase >= 2 && (
        <motion.div
          style={{
            position: "absolute", bottom: "24.5%", left: "50%",
            height: 16, borderRadius: 8, zIndex: 5,
            background: "linear-gradient(135deg, #7C3AED, #DB2777)",
            boxShadow: "0 2px 14px rgba(219,39,119,0.5)",
          }}
          initial={{ width: 0, x: -80 }}
          animate={{ width: 220, x: -110 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
        />
      )}

      {/* Cosmonaut */}
      {phase >= 1 && (
        <div style={{ position: "absolute", bottom: "25%", left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 6 }}>
          <motion.div
            initial={{ x: -800 }}
            animate={{ x: 0 }}
            transition={{ duration: 0.88, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div
              key={pose}
              initial={{ opacity: 0.7, scale: 0.92, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
            >
              {pose === "warrior" ? <CosmoWarrior /> : pose === "tree" ? <CosmoTree /> : <CosmoStand />}
            </motion.div>
          </motion.div>
        </div>
      )}

      {/* Pose label */}
      {label && (
        <motion.div
          key={label}
          style={{
            position: "absolute", top: "10%", left: "50%", transform: "translateX(-50%)",
            color: "#fff", fontSize: 26, fontWeight: 800, textAlign: "center", zIndex: 10,
            textShadow: "0 0 28px rgba(200,80,255,0.95), 0 0 60px rgba(200,80,255,0.5)",
            letterSpacing: 1, whiteSpace: "nowrap",
          }}
          initial={{ opacity: 0, y: -18, scale: 0.86 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.32 }}
        >
          {label}
        </motion.div>
      )}

      {/* Subtitle */}
      <motion.div
        style={{
          position: "absolute", bottom: "8%", left: "50%", transform: "translateX(-50%)",
          color: "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: 600,
          letterSpacing: 2.5, textTransform: "uppercase", zIndex: 10, whiteSpace: "nowrap",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9, duration: 0.5 }}
      >
        Space Yoga · Warming Up
      </motion.div>
    </motion.div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [showCaught, setShowCaught] = useState(false);
  const [showLaunch, setShowLaunch] = useState(false);
  const [showTravel, setShowTravel] = useState(false);
  const [showMoon, setShowMoon] = useState(false);
  const [showWarmup, setShowWarmup] = useState(false);
  const [warmedUp, setWarmedUp] = useState(false);
  const [showFinal, setShowFinal] = useState(false);
  const [showRefusal, setShowRefusal] = useState(false);
  const [noThanksClicked, setNoThanksClicked] = useState(false);

  const handleReset = () => {
    setShowCaught(false);
    setShowLaunch(false);
    setShowTravel(false);
    setShowMoon(false);
    setShowWarmup(false);
    setWarmedUp(false);
    setShowFinal(false);
    setShowRefusal(false);
    setNoThanksClicked(false);
  };

  return (
    <div className="size-full relative overflow-hidden flex items-center justify-center"
      style={{ background: "#000000", minHeight: "100vh" }}
    >
      <Nebula />
      <Stars />
      <Confetti />

      {/* Content */}
      <motion.div
        className="flex flex-col items-center"
        style={{ position: "relative", zIndex: 10 }}
        initial={{ opacity: 0, scale: 0.88, y: 40 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        <FloatingDeco />

        {/* Cake */}
        <motion.div
          animate={{ y: [-4, 4, -4] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          style={{ marginBottom: 24, transform: "scale(1.5)", transformOrigin: "center bottom" }}
        >
          <BirthdayCake />
        </motion.div>

        {/* Text */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            fontSize: 30, fontWeight: 800,
            color: "#FBBF24",
            fontFamily: "system-ui, sans-serif", marginBottom: 10,
          }}>
            Hey, Johnny! 👋
          </div>
          <div style={{
            fontSize: 14, color: "rgba(255,255,255,0.45)",
            lineHeight: 1.7, fontFamily: "system-ui, sans-serif",
          }}>
            Looks like someone has a birthday today?<br />
            If that's you — try claiming your gift!
          </div>
        </div>

        {/* Buttons — horizontal */}
        <div className="flex gap-5">
          <RunawayButton onClick={() => setShowCaught(true)} paused={showCaught || showLaunch || showTravel || showMoon || showRefusal} />

          {/* NO THANKS — solid red, disappears once clicked */}
          {!noThanksClicked && <motion.button onClick={() => { playClickSound(); setNoThanksClicked(true); setShowRefusal(true); }}
            style={{
              background: "linear-gradient(135deg, #DC2626, #991B1B)",
              color: "#ffffff",
              border: "1px solid rgba(248,113,113,0.3)",
              borderRadius: 14,
              padding: "14px 30px",
              fontSize: 14,
              fontWeight: 800,
              cursor: "pointer",
              letterSpacing: 1.5,
              textTransform: "uppercase",
              boxShadow: "0 4px 24px rgba(220,38,38,0.4), inset 0 1px 0 rgba(255,255,255,0.1)",
            }}
            whileHover={{
              scale: 1.04,
              boxShadow: "0 6px 36px rgba(220,38,38,0.6), inset 0 1px 0 rgba(255,255,255,0.15)",
            }}
            whileTap={{ scale: 0.97 }}
          >
            NO THANKS
          </motion.button>}
        </div>
      </motion.div>

      {showCaught  && <CaughtModal   onClaim={() => { setShowCaught(false); setShowLaunch(true); }} />}
      {showLaunch  && <LaunchScreen  onComplete={() => { setShowLaunch(false); setShowTravel(true); }} />}
      {showTravel  && <TravelScreen  onComplete={() => { setShowTravel(false); setShowMoon(true); }} />}
      {showMoon    && <MoonScene     warmedUp={warmedUp} onComplete={warmedUp ? () => { setShowMoon(false); setShowFinal(true); } : () => { setShowMoon(false); setShowWarmup(true); }} />}
      {showWarmup  && <WarmupScreen  onComplete={() => { setShowWarmup(false); setWarmedUp(true); setShowMoon(true); }} />}
      {showFinal   && <FinalCelebrationScene onComplete={handleReset} />}
      {showRefusal && <RefusalModal onClose={() => setShowRefusal(false)} />}

      {/* Reset button — visible on moon and warmup screens */}
      {(showMoon || showWarmup || showFinal) && (
        <motion.button
          onClick={() => { playClickSound(); handleReset(); }}
          style={{
            position: "fixed", top: 18, right: 20, zIndex: 300,
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.18)",
            color: "rgba(255,255,255,0.65)",
            borderRadius: 10, padding: "7px 16px",
            fontSize: 12, fontWeight: 700, cursor: "pointer",
            letterSpacing: 1, backdropFilter: "blur(8px)",
            fontFamily: "system-ui, sans-serif",
          }}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          whileHover={{ background: "rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.9)" }}
          whileTap={{ scale: 0.96 }}
        >
          ↺ RESET
        </motion.button>
      )}
    </div>
  );
}
