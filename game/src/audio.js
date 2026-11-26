// All sound is synthesised with WebAudio — no audio files, no network.
// An engine drone follows the throttle, wind noise follows the speed, and
// short blips mark rings, warnings, touchdowns and crashes.

export function createAudio() {
  let context = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;
  let windSource = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;
  let started = false;

  /** Must be called from a user gesture at least once. */
  function start() {
    if (started) {
      if (context && context.state === 'suspended') context.resume();
      return;
    }
    started = true;
    try {
      context = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return;
    }
    // Engine: two detuned saws through a low-pass, pitched by the throttle.
    engineOsc = context.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineOsc2 = context.createOscillator();
    engineOsc2.type = 'square';
    engineOsc2.frequency.value = 82;
    engineFilter = context.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = context.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(context.destination);
    engineOsc.start();
    engineOsc2.start();

    // Wind: looped noise through a band-pass, louder and brighter with speed.
    const length = context.sampleRate * 2;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    windSource = context.createBufferSource();
    windSource.buffer = buffer;
    windSource.loop = true;
    windFilter = context.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 500;
    windFilter.Q.value = 0.6;
    windGain = context.createGain();
    windGain.gain.value = 0;
    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(context.destination);
    windSource.start();
  }

  /** Called every frame with the plane's live state. */
  function update(throttle, speed, airborne, running) {
    if (!context || muted) return;
    const t = context.currentTime;
    const rpm = 0.25 + throttle * 0.75;
    engineOsc.frequency.setTargetAtTime(52 + rpm * 68, t, 0.08);
    engineOsc2.frequency.setTargetAtTime(78 + rpm * 102, t, 0.08);
    engineFilter.frequency.setTargetAtTime(300 + rpm * 900, t, 0.1);
    engineGain.gain.setTargetAtTime(running ? 0.045 + rpm * 0.05 : 0, t, 0.15);
    const wind = airborne ? Math.min(1, speed / 88) : 0;
    windGain.gain.setTargetAtTime(wind * 0.05, t, 0.2);
    windFilter.frequency.setTargetAtTime(350 + wind * 900, t, 0.2);
  }

  function blip(frequency, duration, type = 'sine', volume = 0.16, when = 0) {
    if (!context || muted) return;
    const t = context.currentTime + when;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  function noiseBurst(duration, volume, lowpass = 900) {
    if (!context || muted) return;
    const t = context.currentTime;
    const length = Math.floor(context.sampleRate * duration);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const gain = context.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    source.start(t);
  }

  return {
    start,
    update,
    toggleMute() {
      muted = !muted;
      if (context) {
        if (muted) {
          if (engineGain) engineGain.gain.value = 0;
          if (windGain) windGain.gain.value = 0;
        }
      }
      return muted;
    },
    get muted() {
      return muted;
    },
    ring() {
      blip(880, 0.14, 'sine', 0.2);
      blip(1318, 0.22, 'sine', 0.18, 0.09);
    },
    warning() {
      blip(620, 0.12, 'square', 0.08);
      blip(620, 0.12, 'square', 0.08, 0.16);
    },
    touchdown() {
      noiseBurst(0.18, 0.25, 500);
      blip(90, 0.2, 'sine', 0.22);
    },
    crash() {
      noiseBurst(0.7, 0.4, 700);
      blip(55, 0.6, 'sawtooth', 0.2);
    },
    success() {
      [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.22, 'triangle', 0.16, i * 0.11));
    },
    click() {
      blip(1200, 0.05, 'sine', 0.08);
    },
  };
}
