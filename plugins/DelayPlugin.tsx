import React, { useEffect, useRef, useState } from 'react';

// PARTIE 1: NOUVEAU TYPE DelayParams
export type DelayDivision = '1/1' | '1/2' | '1/2D' | '1/4' | '1/4D' | '1/4T' | '1/8' | '1/8D' | '1/8T' | '1/16' | '1/16D' | '1/16T' | '1/32';
export type DelayMode = 'SYNC' | 'FREE';

export interface DelayParams {
  mode: DelayMode;         // Sync to BPM or free time
  division: DelayDivision; // For sync mode
  timeMs: number;          // For free mode (1 to 2000 ms)
  feedback: number;        // 0 to 0.95
  lowCut: number;          // 20 to 500 Hz (HP on feedback)
  highCut: number;         // 1000 to 20000 Hz (LP on feedback)
  damping: number;         // 1000 to 20000 Hz (tone control)
  mix: number;             // 0 to 1 (dry/wet)
  stereoOffset: number;    // -50 to 50 ms (L/R time offset)
  width: number;           // 0 to 2 (0=mono, 1=stereo, 2=wide)
  modRate: number;         // 0 to 5 Hz (wow/flutter speed)
  modDepth: number;        // 0 to 1 (wow/flutter amount)
  drive: number;           // 0 to 1 (tape saturation amount)
  ducking: number;         // 0 to 1 (sidechain duck amount)
  pingPong: boolean;
  bpm: number;
  isEnabled: boolean;
}

// PARTIE 2: DIVISION FACTORS
const DIVISION_FACTORS: Record<DelayDivision, number> = {
  '1/1': 4,
  '1/2': 2,
  '1/2D': 3,
  '1/4': 1,
  '1/4D': 1.5,
  '1/4T': 0.667,
  '1/8': 0.5,
  '1/8D': 0.75,
  '1/8T': 0.333,
  '1/16': 0.25,
  '1/16D': 0.375,
  '1/16T': 0.167,
  '1/32': 0.125,
};

// PARTIE 3: PRESETS
const DELAY_PRESETS: Array<Partial<DelayParams> & { name: string }> = [
  {
    name: "Tape Slap",
    mode: 'SYNC', division: '1/8', feedback: 0.25, lowCut: 100, highCut: 8000,
    damping: 6000, mix: 0.3, stereoOffset: 0, width: 1.0, modRate: 0.8, modDepth: 0.15,
    drive: 0.4, ducking: 0.1, pingPong: false
  },
  {
    name: "Ping Pong 1/4",
    mode: 'SYNC', division: '1/4', feedback: 0.45, lowCut: 80, highCut: 10000,
    damping: 8000, mix: 0.35, stereoOffset: 0, width: 1.5, modRate: 0.3, modDepth: 0.1,
    drive: 0.2, ducking: 0.15, pingPong: true
  },
  {
    name: "Dotted Eighth",
    mode: 'SYNC', division: '1/8D', feedback: 0.4, lowCut: 120, highCut: 9000,
    damping: 7000, mix: 0.28, stereoOffset: 10, width: 1.2, modRate: 0.5, modDepth: 0.12,
    drive: 0.3, ducking: 0.2, pingPong: false
  },
  {
    name: "Ambient Wash",
    mode: 'SYNC', division: '1/4', feedback: 0.7, lowCut: 200, highCut: 5000,
    damping: 4000, mix: 0.45, stereoOffset: 25, width: 2.0, modRate: 1.5, modDepth: 0.3,
    drive: 0.5, ducking: 0.35, pingPong: true
  },
  {
    name: "Lo-Fi Tape",
    mode: 'SYNC', division: '1/4', feedback: 0.5, lowCut: 150, highCut: 4000,
    damping: 3000, mix: 0.35, stereoOffset: 5, width: 1.0, modRate: 2.0, modDepth: 0.4,
    drive: 0.8, ducking: 0.1, pingPong: false
  },
  {
    name: "Slapback",
    mode: 'FREE', timeMs: 120, feedback: 0.15, lowCut: 100, highCut: 12000,
    damping: 10000, mix: 0.25, stereoOffset: 0, width: 1.0, modRate: 0, modDepth: 0,
    drive: 0.2, ducking: 0, pingPong: false
  }
];

// PARTIE 3: CLASSE SyncDelayNode COMPLÈTE
export class SyncDelayNode {
  private ctx: AudioContext;
  public input: GainNode;
  public output: GainNode;
  
  // Delay lines
  private delayNodeL: DelayNode;
  private delayNodeR: DelayNode;
  
  // Feedback path
  private feedbackGain: GainNode;
  private lowCutFilter: BiquadFilterNode;
  private highCutFilter: BiquadFilterNode;
  private dampingFilter: BiquadFilterNode;
  
  // Saturation
  private tapeSaturator: WaveShaperNode;
  
  // Modulation (wow/flutter)
  private modLFO: OscillatorNode;
  private modGainL: GainNode;
  private modGainR: GainNode;
  
  // Stereo
  private panL: StereoPannerNode;
  private panR: StereoPannerNode;
  private widthSplitter: ChannelSplitterNode;
  private widthMerger: ChannelMergerNode;
  private midGain: GainNode;
  private sideGain: GainNode;
  
  // Mix
  private wetGain: GainNode;
  private dryGain: GainNode;
  
  // Ducking
  private duckingGain: GainNode;
  private duckingAnalyzer: AnalyserNode;
  private duckingData: Float32Array;
  private duckingInterval: number | null = null;
  
  // Metering
  private inputAnalyzer: AnalyserNode;
  private outputAnalyzer: AnalyserNode;
  private inputData: Float32Array;
  private outputData: Float32Array;

  private params: DelayParams;

  constructor(ctx: AudioContext, initialBpm: number) {
    this.ctx = ctx;
    this.params = {
      mode: 'SYNC',
      division: '1/4',
      timeMs: 250,
      feedback: 0.4,
      lowCut: 80,
      highCut: 12000,
      damping: 8000,
      mix: 0.3,
      stereoOffset: 0,
      width: 1.0,
      modRate: 0.5,
      modDepth: 0.1,
      drive: 0.3,
      ducking: 0,
      pingPong: false,
      bpm: initialBpm,
      isEnabled: true,
    };

    // I/O
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    
    // Metering
    this.inputAnalyzer = ctx.createAnalyser();
    this.inputAnalyzer.fftSize = 256;
    this.inputData = new Float32Array(this.inputAnalyzer.frequencyBinCount);
    
    this.outputAnalyzer = ctx.createAnalyser();
    this.outputAnalyzer.fftSize = 256;
    this.outputData = new Float32Array(this.outputAnalyzer.frequencyBinCount);
    
    // Ducking
    this.duckingAnalyzer = ctx.createAnalyser();
    this.duckingAnalyzer.fftSize = 256;
    this.duckingData = new Float32Array(this.duckingAnalyzer.frequencyBinCount);
    this.duckingGain = ctx.createGain();
    
    // Delay lines
    this.delayNodeL = ctx.createDelay(4.0);
    this.delayNodeR = ctx.createDelay(4.0);
    
    // Feedback chain
    this.feedbackGain = ctx.createGain();
    
    this.lowCutFilter = ctx.createBiquadFilter();
    this.lowCutFilter.type = 'highpass';
    this.lowCutFilter.frequency.value = 80;
    this.lowCutFilter.Q.value = 0.707;
    
    this.highCutFilter = ctx.createBiquadFilter();
    this.highCutFilter.type = 'lowpass';
    this.highCutFilter.frequency.value = 12000;
    this.highCutFilter.Q.value = 0.707;
    
    this.dampingFilter = ctx.createBiquadFilter();
    this.dampingFilter.type = 'lowpass';
    this.dampingFilter.frequency.value = 8000;
    
    // Saturation
    this.tapeSaturator = ctx.createWaveShaper();
    this.tapeSaturator.oversample = '4x';
    this.updateDriveCurve(0.3);
    
    // Modulation LFO
    this.modLFO = ctx.createOscillator();
    this.modLFO.type = 'sine';
    this.modLFO.frequency.value = 0.5;
    
    this.modGainL = ctx.createGain();
    this.modGainL.gain.value = 0.001;
    this.modGainR = ctx.createGain();
    this.modGainR.gain.value = 0.001;
    
    this.modLFO.connect(this.modGainL);
    this.modLFO.connect(this.modGainR);
    this.modGainL.connect(this.delayNodeL.delayTime);
    this.modGainR.connect(this.delayNodeR.delayTime);
    this.modLFO.start();
    
    // Stereo panning
    this.panL = ctx.createStereoPanner();
    this.panR = ctx.createStereoPanner();
    
    // Width processing
    this.widthSplitter = ctx.createChannelSplitter(2);
    this.widthMerger = ctx.createChannelMerger(2);
    this.midGain = ctx.createGain();
    this.sideGain = ctx.createGain();
    
    // Mix
    this.wetGain = ctx.createGain();
    this.dryGain = ctx.createGain();

    this.setupChain();
    this.startDuckingProcess();
  }

  private updateDriveCurve(drive: number) {
    const amount = 10 + drive * 90; // 10 to 100
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    
    for (let i = 0; i < n_samples; i++) {
      const x = (i * 2) / n_samples - 1;
      if (drive < 0.1) {
        // Clean
        curve[i] = x;
      } else {
        // Tape saturation
        curve[i] = Math.tanh(x * (1 + amount * 0.1)) * 0.9;
      }
    }
    this.tapeSaturator.curve = curve;
  }

  private setupChain() {
    // Input metering
    this.input.connect(this.inputAnalyzer);
    
    // Ducking analyzer
    this.input.connect(this.duckingAnalyzer);
    
    // Dry path
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    
    // Wet path input
    this.input.connect(this.delayNodeL);
    
    // Feedback chain: delay -> filters -> saturator -> feedback gain -> back to delay
    this.delayNodeL.connect(this.lowCutFilter);
    this.lowCutFilter.connect(this.highCutFilter);
    this.highCutFilter.connect(this.dampingFilter);
    this.dampingFilter.connect(this.tapeSaturator);
    this.tapeSaturator.connect(this.feedbackGain);
    
    // Output from delay to panners
    this.delayNodeL.connect(this.panL);
    this.delayNodeR.connect(this.panR);
    
    // Pan to width processing
    this.panL.connect(this.widthSplitter);
    this.panR.connect(this.widthSplitter);
    
    this.widthSplitter.connect(this.midGain, 0);
    this.widthSplitter.connect(this.midGain, 1);
    this.widthSplitter.connect(this.sideGain, 0);
    this.widthSplitter.connect(this.sideGain, 1);
    
    this.midGain.connect(this.widthMerger, 0, 0);
    this.midGain.connect(this.widthMerger, 0, 1);
    this.sideGain.connect(this.widthMerger, 0, 0);
    this.sideGain.connect(this.widthMerger, 0, 1);
    
    // Through ducking to wet
    this.widthMerger.connect(this.duckingGain);
    this.duckingGain.connect(this.wetGain);
    this.wetGain.connect(this.output);
    
    // Output metering
    this.output.connect(this.outputAnalyzer);
    
    this.updateRouting();
  }

  private startDuckingProcess() {
    this.duckingInterval = window.setInterval(() => {
      if (this.params.ducking > 0) {
        this.duckingAnalyzer.getFloatTimeDomainData(this.duckingData);
        let max = 0;
        for (let i = 0; i < this.duckingData.length; i++) {
          const abs = Math.abs(this.duckingData[i]);
          if (abs > max) max = abs;
        }
        const duckAmount = Math.min(1, max * 3) * this.params.ducking;
        const targetGain = 1 - duckAmount;
        this.duckingGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.015);
      } else {
        this.duckingGain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.02);
      }
    }, 1000 / 60);
  }

  private updateRouting() {
    this.feedbackGain.disconnect();
    this.delayNodeR.disconnect();
    
    if (this.params.pingPong) {
      // Ping pong: L -> R -> L
      this.feedbackGain.connect(this.delayNodeR);
      this.delayNodeR.connect(this.lowCutFilter);
      this.delayNodeR.connect(this.panR);
      this.panL.pan.value = -0.85;
      this.panR.pan.value = 0.85;
    } else {
      // Normal: L -> L
      this.feedbackGain.connect(this.delayNodeL);
      this.panL.pan.value = -0.3;
      this.panR.pan.value = 0.3;
    }
  }

  public updateParams(p: Partial<DelayParams>) {
    const oldPingPong = this.params.pingPong;
    const oldDrive = this.params.drive;
    
    this.params = { ...this.params, ...p };
    
    if (p.pingPong !== undefined && p.pingPong !== oldPingPong) {
      this.updateRouting();
    }
    
    if (p.drive !== undefined && p.drive !== oldDrive) {
      this.updateDriveCurve(this.params.drive);
    }
    
    this.applyParams();
  }

  private applyParams() {
    const now = this.ctx.currentTime;
    const safe = (v: number, def: number) => Number.isFinite(v) ? v : def;
    
    // Calculate delay time
    let delaySeconds: number;
    if (this.params.mode === 'SYNC') {
      const beatDuration = 60 / (this.params.bpm || 120);
      delaySeconds = beatDuration * DIVISION_FACTORS[this.params.division];
    } else {
      delaySeconds = this.params.timeMs / 1000;
    }
    
    // Stereo offset
    const offsetSeconds = this.params.stereoOffset / 1000;
    const delayL = Math.max(0.001, delaySeconds - offsetSeconds / 2);
    const delayR = Math.max(0.001, delaySeconds + offsetSeconds / 2);

    if (this.params.isEnabled) {
      this.delayNodeL.delayTime.setTargetAtTime(delayL, now, 0.05);
      this.delayNodeR.delayTime.setTargetAtTime(delayR, now, 0.05);
      this.feedbackGain.gain.setTargetAtTime(safe(this.params.feedback, 0.4), now, 0.02);
      
      // Filters
      this.lowCutFilter.frequency.setTargetAtTime(safe(this.params.lowCut, 80), now, 0.02);
      this.highCutFilter.frequency.setTargetAtTime(safe(this.params.highCut, 12000), now, 0.02);
      this.dampingFilter.frequency.setTargetAtTime(safe(this.params.damping, 8000), now, 0.02);
      
      // Modulation
      this.modLFO.frequency.setTargetAtTime(safe(this.params.modRate, 0.5), now, 0.02);
      const modAmount = safe(this.params.modDepth, 0.1) * 0.005;
      this.modGainL.gain.setTargetAtTime(modAmount, now, 0.02);
      this.modGainR.gain.setTargetAtTime(modAmount * 1.1, now, 0.02); // Slight difference for stereo
      
      // Width
      const width = safe(this.params.width, 1);
      this.midGain.gain.setTargetAtTime(2 - width, now, 0.02);
      this.sideGain.gain.setTargetAtTime(width, now, 0.02);
      
      // Mix
      const mix = safe(this.params.mix, 0.3);
      this.dryGain.gain.setTargetAtTime(1 - mix * 0.5, now, 0.02);
      this.wetGain.gain.setTargetAtTime(mix, now, 0.02);
      
    } else {
      this.dryGain.gain.setTargetAtTime(1, now, 0.02);
      this.wetGain.gain.setTargetAtTime(0, now, 0.02);
    }
  }

  public getInputLevel(): number {
    this.inputAnalyzer.getFloatTimeDomainData(this.inputData);
    let max = 0;
    for (let i = 0; i < this.inputData.length; i++) {
      const abs = Math.abs(this.inputData[i]);
      if (abs > max) max = abs;
    }
    return max > 0 ? 20 * Math.log10(max) : -100;
  }

  public getOutputLevel(): number {
    this.outputAnalyzer.getFloatTimeDomainData(this.outputData);
    let max = 0;
    for (let i = 0; i < this.outputData.length; i++) {
      const abs = Math.abs(this.outputData[i]);
      if (abs > max) max = abs;
    }
    return max > 0 ? 20 * Math.log10(max) : -100;
  }

  public getDelayTimeMs(): number {
    if (this.params.mode === 'SYNC') {
      const beatDuration = 60 / (this.params.bpm || 120);
      return beatDuration * DIVISION_FACTORS[this.params.division] * 1000;
    }
    return this.params.timeMs;
  }

  public getAudioParam(paramId: string): AudioParam | null {
    switch (paramId) {
      case 'feedback': return this.feedbackGain.gain;
      case 'mix': return this.wetGain.gain;
      case 'damping': return this.dampingFilter.frequency;
      case 'lowCut': return this.lowCutFilter.frequency;
      case 'highCut': return this.highCutFilter.frequency;
      default: return null;
    }
  }

  public getParams() { return { ...this.params }; }
  
  public destroy() {
    if (this.duckingInterval) clearInterval(this.duckingInterval);
    this.modLFO.stop();
  }
}

// PARTIE 4: UI COMPLÈTE SyncDelayUI
export const SyncDelayUI: React.FC<{ 
  node: SyncDelayNode, 
  initialParams: DelayParams, 
  onParamsChange?: (p: DelayParams) => void 
}> = ({ node, initialParams, onParamsChange }) => {
  const [params, setParams] = useState<DelayParams>(initialParams);
  const [inputLevel, setInputLevel] = useState(-100);
  const [outputLevel, setOutputLevel] = useState(-100);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleParamChange = (key: keyof DelayParams, value: any) => {
    const newParams = { ...params, [key]: value };
    setParams(newParams);
    node.updateParams(newParams);
    if (onParamsChange) onParamsChange(newParams);
  };

  const loadPreset = (index: number) => {
    const preset = DELAY_PRESETS[index];
    if (preset) {
      const newParams = { ...params, ...preset };
      setParams(newParams);
      node.updateParams(newParams);
      if (onParamsChange) onParamsChange(newParams);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let frameId = 0;

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      
      // Update meters
      setInputLevel(node.getInputLevel());
      setOutputLevel(node.getOutputLevel());

      const delayTimeMs = node.getDelayTimeMs();
      const progress = (Date.now() % delayTimeMs) / delayTimeMs;

      // Animated ring
      ctx.beginPath();
      ctx.strokeStyle = `rgba(0, 242, 255, ${1 - progress})`;
      ctx.lineWidth = 3;
      ctx.arc(w / 2, h / 2, 20 + progress * 30, 0, Math.PI * 2);
      ctx.stroke();

      // Center dot
      ctx.beginPath();
      ctx.fillStyle = params.isEnabled ? '#00f2ff' : '#334155';
      ctx.arc(w / 2, h / 2, 5, 0, Math.PI * 2);
      ctx.fill();

      // Feedback taps visualization
      for (let i = 1; i <= 6; i++) {
        const x = 60 + (i * 50);
        const opacity = Math.pow(params.feedback, i);
        const flicker = 0.85 + Math.random() * 0.15;
        
        ctx.fillStyle = `rgba(0, 242, 255, ${opacity * 0.4 * flicker})`;
        ctx.fillRect(x - 2, h / 2 - 15, 4, 30);
        
        // Ping pong alternation
        if (params.pingPong) {
          const yOffset = i % 2 === 0 ? -10 : 10;
          ctx.fillRect(x - 2, h / 2 + yOffset - 5, 4, 10);
        }
      }

      // Time display
      ctx.fillStyle = '#00f2ff';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(delayTimeMs)}ms`, w / 2, h - 15);

      frameId = requestAnimationFrame(draw);
    };
    
    frameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameId);
  }, [node, params]);

  // Level meter component
  const LevelMeter: React.FC<{ level: number; label: string }> = ({ level, label }) => {
    const percent = Math.max(0, Math.min(100, ((level + 60) / 60) * 100));
    return (
      <div className="flex flex-col items-center">
        <span className="text-[6px] font-black text-slate-600 uppercase mb-1">{label}</span>
        <div className="w-3 h-20 bg-black/60 rounded relative overflow-hidden border border-white/5">
          <div 
            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-cyan-500 via-cyan-400 to-white transition-all duration-75"
            style={{ height: `${percent}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="w-[680px] bg-[#0c0d10] border border-white/10 rounded-[40px] p-8 shadow-2xl flex flex-col space-y-6 animate-in fade-in zoom-in duration-300 select-none">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 flex items-center justify-center text-cyan-400 border border-cyan-500/20">
            <i className="fas fa-history text-xl"></i>
          </div>
          <div>
            <h2 className="text-xl font-black italic text-white uppercase tracking-tighter">
              Tape <span className="text-cyan-400">Delay</span>
            </h2>
            <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mt-1">
              Saturated Echo Engine v2.0
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => handleParamChange('pingPong', !params.pingPong)}
            className={`px-3 py-2 rounded-xl text-[8px] font-black uppercase transition-all border ${
              params.pingPong 
                ? 'bg-cyan-500 border-cyan-400 text-black shadow-lg shadow-cyan-500/20' 
                : 'bg-white/5 border-white/10 text-slate-500 hover:text-white'
            }`}
          >
            Ping-Pong
          </button>
          <button 
            onClick={() => handleParamChange('isEnabled', !params.isEnabled)}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border ${
              params.isEnabled 
                ? 'bg-cyan-500 border-cyan-400 text-black shadow-lg shadow-cyan-500/40' 
                : 'bg-white/5 border-white/10 text-slate-600 hover:text-white'
            }`}
          >
            <i className="fas fa-power-off text-sm"></i>
          </button>
        </div>
      </div>

      {/* Presets */}
      <div className="flex space-x-2">
        {DELAY_PRESETS.map((preset, i) => (
          <button
            key={i}
            onClick={() => loadPreset(i)}
            className="px-3 py-1.5 bg-white/5 hover:bg-cyan-500/20 border border-white/10 hover:border-cyan-500/50 rounded-lg text-[7px] font-black text-slate-400 hover:text-cyan-400 uppercase tracking-wider transition-all"
          >
            {preset.name}
          </button>
        ))}
      </div>

      {/* Mode toggle + Division/Time */}
      <div className="flex space-x-4">
        {/* Mode toggle */}
        <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
          {(['SYNC', 'FREE'] as DelayMode[]).map(m => (
            <button
              key={m}
              onClick={() => handleParamChange('mode', m)}
              className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${
                params.mode === m 
                  ? 'bg-cyan-500 text-black' 
                  : 'text-slate-500 hover:text-white'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        
        {/* Division selector (SYNC mode) */}
        {params.mode === 'SYNC' && (
          <div className="flex-1 flex bg-black/40 p-1 rounded-xl border border-white/5 overflow-x-auto">
            {(['1/4', '1/4D', '1/8', '1/8D', '1/8T', '1/16', '1/16D'] as DelayDivision[]).map(d => (
              <button
                key={d}
                onClick={() => handleParamChange('division', d)}
                className={`flex-1 py-2 rounded-lg text-[8px] font-black uppercase transition-all min-w-[40px] ${
                  params.division === d 
                    ? 'bg-white text-black' 
                    : 'text-slate-500 hover:text-white'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        )}
        
        {/* Time slider (FREE mode) */}
        {params.mode === 'FREE' && (
          <div className="flex-1 flex items-center space-x-3 bg-black/40 px-4 rounded-xl border border-white/5">
            <span className="text-[8px] font-black text-slate-500 uppercase">Time</span>
            <input
              type="range"
              min={10}
              max={2000}
              value={params.timeMs}
              onChange={(e) => handleParamChange('timeMs', Number(e.target.value))}
              className="flex-1 accent-cyan-500"
            />
            <span className="text-[9px] font-mono text-cyan-400 w-14 text-right">{params.timeMs}ms</span>
          </div>
        )}
      </div>

      {/* Visualization + Meters */}
      <div className="flex space-x-4">
        <div className="flex-1 h-28 bg-black/60 rounded-[24px] border border-white/5 relative overflow-hidden">
          <canvas ref={canvasRef} width={520} height={112} className="w-full h-full" />
          <div className="absolute top-2 left-3 text-[7px] font-black text-slate-600 uppercase tracking-widest">
            {params.bpm} BPM • {params.pingPong ? 'PING-PONG' : 'MONO'}
          </div>
        </div>
        
        <div className="flex space-x-2 bg-black/40 rounded-[24px] border border-white/5 p-3">
          <LevelMeter level={inputLevel} label="IN" />
          <LevelMeter level={outputLevel} label="OUT" />
        </div>
      </div>

      {/* Main controls */}
      <div className="grid grid-cols-7 gap-3">
        <DelayKnob label="Feedback" value={params.feedback} min={0} max={0.95} factor={100} suffix="%" color="#00f2ff" onChange={v => handleParamChange('feedback', v)} />
        <DelayKnob label="Low Cut" value={params.lowCut} min={20} max={500} log suffix="Hz" color="#f43f5e" onChange={v => handleParamChange('lowCut', v)} />
        <DelayKnob label="High Cut" value={params.highCut} min={1000} max={20000} log suffix="Hz" color="#f43f5e" onChange={v => handleParamChange('highCut', v)} />
        <DelayKnob label="Damping" value={params.damping} min={1000} max={20000} log suffix="Hz" color="#00f2ff" onChange={v => handleParamChange('damping', v)} />
        <DelayKnob label="Drive" value={params.drive} min={0} max={1} factor={100} suffix="%" color="#f97316" onChange={v => handleParamChange('drive', v)} />
        <DelayKnob label="Mix" value={params.mix} min={0} max={1} factor={100} suffix="%" color="#fff" onChange={v => handleParamChange('mix', v)} />
        <DelayKnob label="Ducking" value={params.ducking} min={0} max={1} factor={100} suffix="%" color="#a855f7" onChange={v => handleParamChange('ducking', v)} />
      </div>

      {/* Advanced controls */}
      <div className="grid grid-cols-5 gap-4 pt-4 border-t border-white/5">
        <DelayKnob label="Stereo" value={params.stereoOffset} min={-50} max={50} suffix="ms" color="#06b6d4" onChange={v => handleParamChange('stereoOffset', v)} />
        <DelayKnob label="Width" value={params.width} min={0} max={2} factor={100} suffix="%" color="#06b6d4" onChange={v => handleParamChange('width', v)} />
        <DelayKnob label="Mod Rate" value={params.modRate} min={0} max={5} suffix="Hz" color="#8b5cf6" onChange={v => handleParamChange('modRate', v)} />
        <DelayKnob label="Mod Depth" value={params.modDepth} min={0} max={1} factor={100} suffix="%" color="#8b5cf6" onChange={v => handleParamChange('modDepth', v)} />
        
        {/* BPM display */}
        <div className="flex flex-col items-center justify-center">
          <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-1">Tempo</span>
          <div className="bg-black/60 px-3 py-1 rounded border border-white/5">
            <span className="text-[12px] font-mono font-bold text-cyan-400">{params.bpm} BPM</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// PARTIE 5: METTRE À JOUR DelayKnob
const DelayKnob: React.FC<{ 
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  suffix: string;
  color: string;
  log?: boolean;
  factor?: number;
}> = ({ label, value, min, max, onChange, suffix, color, log, factor = 1 }) => {
  const safeValue = Number.isFinite(value) ? value : min;
  const norm = log 
    ? Math.max(0, Math.min(1, Math.log10(Math.max(safeValue, min) / min) / Math.log10(max / min)))
    : (safeValue - min) / (max - min);

  const calculateValue = (delta: number, startNorm: number) => {
    const newNorm = Math.max(0, Math.min(1, startNorm + delta / 200));
    return log ? min * Math.pow(max / min, newNorm) : min + newNorm * (max - min);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startNorm = norm;
    const onMouseMove = (m: MouseEvent) => onChange(calculateValue(startY - m.clientY, startNorm));
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    const startY = e.touches[0].clientY;
    const startNorm = norm;
    const onTouchMove = (t: TouchEvent) => {
      if (t.cancelable) t.preventDefault();
      onChange(calculateValue(startY - t.touches[0].clientY, startNorm));
    };
    const onTouchEnd = () => {
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
  };

  const displayValue = log ? Math.round(safeValue) : Math.round(safeValue * factor * 10) / 10;

  return (
    <div className="flex flex-col items-center space-y-2 select-none touch-none">
      <div 
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        className="relative w-10 h-10 rounded-full bg-[#14161a] border-2 border-white/10 flex items-center justify-center cursor-ns-resize hover:border-cyan-500/50 transition-all shadow-xl"
      >
        <div className="absolute inset-1 rounded-full border border-white/5 bg-black/40" />
        <div 
          className="absolute top-1/2 left-1/2 w-1 h-3.5 -ml-0.5 -mt-3.5 origin-bottom rounded-full transition-transform duration-75"
          style={{ 
            backgroundColor: color,
            boxShadow: `0 0 8px ${color}44`,
            transform: `rotate(${(norm * 270) - 135}deg) translateY(2px)` 
          }}
        />
      </div>
      <div className="text-center">
        <span className="block text-[6px] font-black text-slate-500 uppercase tracking-widest mb-0.5">{label}</span>
        <div className="bg-black/60 px-1.5 py-0.5 rounded border border-white/5 min-w-[38px]">
          <span className="text-[7px] font-mono font-bold text-white">{displayValue}{suffix}</span>
        </div>
      </div>
    </div>
  );
};

export default SyncDelayUI;
