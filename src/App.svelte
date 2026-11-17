<script>
  import { onMount } from "svelte";
  import * as Tone from "tone";
  import engineProcessorUrl from "./engine-processor.js?url";
  import Gauge from "./Gauge.svelte";
  import VolumeKnob from "./VolumeKnob.svelte";
  import { EXHAUST_PRESETS } from "./exhaust-presets.js";

  // 12 steps = one four-stroke cycle = 2 crank turns = 720 degrees, so each step is 60 degrees.
  const STEPS_PER_CYCLE = 12;
  const DEGREES_PER_STEP = 720 / STEPS_PER_CYCLE;
  // Steps 0, 3, 6 and 9 = an inline four-cylinder that fires every 180 degrees.
  const FOUR_CYLINDER_STEPS = [0, 3, 6, 9];
  // Gear 0 = neutral. Keys 0 to 5 pick the gear with the same number.
  const GEAR_NAMES = ["N", "1", "2", "3", "4", "5"];
  const GEAR_KEYS = ["0", "1", "2", "3", "4", "5"];
  const THROTTLE_KEYS = ["w", "W"];
  const BRAKE_KEYS = ["s", "S"];
  // The tachometer turns red from 6,500 RPM.
  const REDLINE_THOUSANDS = 6.5;
  // The LCD redraws 10 times a second, like a car's digital display. The needles move on every report.
  const READOUT_INTERVAL_MS = 100;

  // Output 0 of the engine is exhaust gas pressure, played through the chosen exhaust's impulse response.
  // Output 1 is the engine bay: starter, intake, valves, road and wind. Both meet at the volume control.
  const limiter = new Tone.Limiter(-1).toDestination();
  const volumeControl = new Tone.Gain(0.5).connect(limiter);
  const exhaustMakeup = new Tone.Gain(EXHAUST_PRESETS[0].makeupGain).connect(volumeControl);
  const exhaustResponse = new Tone.Convolver({ normalize: true }).connect(exhaustMakeup);

  let engineNode = null;
  let volume = 0.5;
  let throttle = 0;
  let isBraking = false;
  let gear = 0;
  let presetIndex = 0;
  let steps = fourCylinderPattern();
  let report = { rpm: 0, kmh: 0, ignition: false, starter: false, gear: 0, limiter: false, manifold: 1 };
  let readout = report;
  let lastReadoutAt = 0;

  function fourCylinderPattern() {
      const pattern = [];
      for (let step = 0; step < STEPS_PER_CYCLE; step += 1) pattern.push(FOUR_CYLINDER_STEPS.includes(step));
      return pattern;
  }

  function sendToEngine(message) {
      if (engineNode) engineNode.port.postMessage(message);
  }

  function readReport(event) {
      report = event.data;
      const now = performance.now();
      if (now - lastReadoutAt < READOUT_INTERVAL_MS) return;
      lastReadoutAt = now;
      readout = event.data;
  }

  async function choosePreset(index) {
      presetIndex = index;
      const preset = EXHAUST_PRESETS[index];
      await exhaustResponse.load(`${import.meta.env.BASE_URL}ir/${preset.file}`);
      exhaustMakeup.gain.rampTo(preset.makeupGain, 0.05);
      sendToEngine({ exhaust: preset });
  }

  async function buildEngine() {
      const context = Tone.getContext();
      await context.addAudioWorkletModule(engineProcessorUrl);
      const node = context.createAudioWorkletNode("engine", {
          numberOfInputs: 0,
          numberOfOutputs: 2,
          outputChannelCount: [1, 1],
      });
      Tone.connect(node, exhaustResponse, 0, 0);
      Tone.connect(node, volumeControl, 1, 0);
      node.port.onmessage = readReport;
      engineNode = node;
      await choosePreset(presetIndex);
  }

  onMount(buildEngine);

  async function startEngine() {
      await Tone.start();
      sendToEngine({ start: true });
  }

  function stopEngine() {
      sendToEngine({ stop: true });
  }

  function pickGear(event) {
      gear = Number(event.currentTarget.dataset.gear);
  }

  function pickPreset(event) {
      choosePreset(Number(event.currentTarget.dataset.preset));
  }

  function toggleStep(event) {
      const step = Number(event.currentTarget.dataset.step);
      steps[step] = !steps[step];
  }

  function pressBrake() {
      isBraking = true;
  }

  function releaseBrake() {
      isBraking = false;
  }

  function pressKey(event) {
      if (THROTTLE_KEYS.includes(event.key)) throttle = 100;
      if (BRAKE_KEYS.includes(event.key)) isBraking = true;
      if (GEAR_KEYS.includes(event.key)) gear = GEAR_KEYS.indexOf(event.key);
  }

  function releaseKey(event) {
      if (THROTTLE_KEYS.includes(event.key)) throttle = 0;
      if (BRAKE_KEYS.includes(event.key)) isBraking = false;
  }

  const handleVolumeChange = (event) => {
      volumeControl.gain.rampTo(event.detail, 0.05);
  };

  function firingEvenness(pattern) {
      const litSteps = [];
      for (let step = 0; step < pattern.length; step += 1) {
          if (pattern[step]) litSteps.push(step);
      }
      if (litSteps.length === 0) return "";
      const firstGap = (litSteps[1] ?? litSteps[0] + STEPS_PER_CYCLE) - litSteps[0];
      for (let index = 1; index < litSteps.length; index += 1) {
          const nextStep = litSteps[index + 1] ?? litSteps[0] + STEPS_PER_CYCLE;
          if (nextStep - litSteps[index] !== firstGap) return "uneven";
      }
      return "even";
  }

  function engineStatus(state) {
      if (!state.ignition) return "Off";
      if (state.starter) return "Cranking";
      if (state.rpm < 100) return "Stalled";
      if (state.limiter) return "Rev limiter";
      return "Running";
  }

  $: if (engineNode) engineNode.port.postMessage({ pattern: steps });
  $: if (engineNode) engineNode.port.postMessage({ gear });
  $: if (engineNode) engineNode.port.postMessage({ throttle: throttle / 100 });
  $: if (engineNode) engineNode.port.postMessage({ brake: isBraking ? 1 : 0 });
  $: litCount = steps.filter(Boolean).length;
  // 2 crank turns per cycle and 60 seconds per minute: fires per second = lit steps x RPM / 120.
  $: firingHz = (litCount * readout.rpm) / 120;
  // Two steps make one beat and one crank turn is 6 steps, so BPM = 3 x RPM.
  $: bpm = 3 * readout.rpm;
  $: evenness = firingEvenness(steps);
  $: status = engineStatus(readout);
</script>

<svelte:window on:keydown={pressKey} on:keyup={releaseKey} />

<main class="min-h-screen bg-zinc-950 text-zinc-100 subpixel-antialiased">
  <header class="max-w-3xl mx-auto px-4 pt-10 pb-6 text-center">
    <h1 class="text-4xl md:text-6xl font-mono font-bold tracking-tight text-balance">Step Sequencer Demo</h1>
    <p class="mt-4 text-zinc-300 text-pretty max-w-[65ch] mx-auto">
      Each lit step is one cylinder firing. Start the engine, hold <kbd>W</kbd> for throttle and <kbd>S</kbd> to brake,
      and press <kbd>1</kbd> to <kbd>5</kbd> for a gear (<kbd>0</kbd> is neutral). Below about 20 fires a second you
      hear separate bangs. Above it they blur into one engine note.
    </p>
    <p class="mt-3 text-sm text-amber-400">Turn the volume knob down before you start.</p>
  </header>

  <section class="cluster max-w-4xl mx-auto mx-4 md:mx-auto px-4 py-6 md:px-8" aria-label="Engine dashboard">
    <div class="grid grid-cols-2 md:grid-cols-[1fr_auto_1fr] items-center gap-4 md:gap-6">
      <div class="flex flex-col items-center gap-2">
        <div class="dial">
          <Gauge label="Tachometer" value={report.rpm / 1000} max={8} redFrom={REDLINE_THOUSANDS} unit="x1000 r/min" />
        </div>
        <span class="readout-label">Tachometer</span>
      </div>

      <dl class="lcd md:w-60 order-last col-span-2 md:order-none md:col-span-1 grid grid-cols-2 md:grid-cols-1 gap-x-6 gap-y-3">
        <div>
          <dt class="readout-label">Gear</dt>
          <dd class="lcd-value text-4xl">{GEAR_NAMES[readout.gear]}</dd>
        </div>
        <div>
          <dt class="readout-label">Engine</dt>
          <dd class="lcd-value">{Math.round(readout.rpm).toLocaleString()} RPM</dd>
        </div>
        <div>
          <dt class="readout-label">Status</dt>
          <dd class="lcd-value text-base">{status}</dd>
        </div>
        <div>
          <dt class="readout-label">Firing pitch</dt>
          <dd class="lcd-value">{firingHz.toFixed(1)} Hz</dd>
        </div>
        <div>
          <dt class="readout-label">Fires per cycle</dt>
          <dd class="lcd-value">{litCount} <span class="text-sm text-zinc-400">{evenness}</span></dd>
        </div>
        <div>
          <dt class="readout-label">Intake manifold</dt>
          <dd class="lcd-value text-base">{readout.manifold.toFixed(2)} bar</dd>
        </div>
        <div class="col-span-2 md:col-span-1">
          <dt class="readout-label">Sequencer tempo</dt>
          <dd class="lcd-value text-base">{Math.round(bpm).toLocaleString()} BPM</dd>
        </div>
      </dl>

      <div class="flex flex-col items-center gap-2">
        <div class="dial">
          <Gauge label="Speedometer" value={report.kmh} max={280} labelEvery={40} ticksPerLabel={4} unit="km/h" />
        </div>
        <span class="readout-label">{Math.round(readout.kmh)} km/h</span>
      </div>
    </div>

    <div class="mt-8 grid grid-cols-1 md:grid-cols-[1fr_auto_auto] items-end gap-6">
      <div class="flex flex-col gap-4">
        <label class="flex flex-col gap-3">
          <span class="readout-label">Throttle {throttle}% · hold W</span>
          <input id="throttle" class="fader" type="range" min="0" max="100" step="1" bind:value={throttle} />
        </label>
        <button
          id="brake"
          class="key key-wide self-start"
          class:key-on={isBraking}
          aria-pressed={isBraking}
          on:pointerdown={pressBrake}
          on:pointerup={releaseBrake}
          on:pointerleave={releaseBrake}
        >Brake · hold S</button>
      </div>

      <fieldset class="flex flex-col gap-3">
        <legend class="readout-label mb-3">Gear</legend>
        <div class="flex gap-2">
          {#each GEAR_NAMES as gearName, index}
            <button
              class="key"
              class:key-on={gear === index}
              aria-pressed={gear === index}
              data-gear={index}
              on:click={pickGear}
            >{gearName}</button>
          {/each}
        </div>
      </fieldset>

      <div class="flex flex-col items-center gap-2">
        <VolumeKnob bind:value={volume} on:change={handleVolumeChange} />
        <span class="readout-label">Volume {Math.round(volume * 100)}</span>
      </div>
    </div>

    <div class="mt-8 flex flex-wrap items-end justify-between gap-6">
      <fieldset class="flex flex-col gap-3">
        <legend class="readout-label mb-3">Exhaust</legend>
        <div class="flex flex-wrap gap-2">
          {#each EXHAUST_PRESETS as preset, index}
            <button
              class="key key-wide"
              class:key-on={presetIndex === index}
              aria-pressed={presetIndex === index}
              data-preset={index}
              on:click={pickPreset}
            >{preset.name}</button>
          {/each}
        </div>
      </fieldset>

      {#if report.ignition}
        <button id="stop" class="ignition ignition-on" on:click={stopEngine}>Stop engine</button>
      {:else}
        <button id="play" class="ignition" on:click={startEngine} disabled={!engineNode}>Start engine</button>
      {/if}
    </div>
  </section>

  <section class="max-w-4xl mx-auto px-4 pt-10 pb-24" aria-label="Firing pattern">
    <h2 class="readout-label text-center mb-4">Firing pattern · one step is 60° of crank turn</h2>
    <div class="overflow-x-auto">
      <div class="grid grid-cols-12 gap-2 md:gap-3 min-w-[40rem]">
        {#each steps as isLit, index}
          <div class="flex flex-col items-center gap-2">
            <span class="step-led" class:step-led-on={isLit && report.rpm > 50}></span>
            <button
              data-step={index}
              class="lamp"
              class:lamp-on={isLit}
              aria-pressed={isLit}
              aria-label="Fire at {index * DEGREES_PER_STEP} degrees"
              on:click={toggleStep}
            ></button>
            <span class="text-xs tabular-nums text-zinc-500">{index * DEGREES_PER_STEP}°</span>
          </div>
        {/each}
      </div>
    </div>
    <p class="mt-6 text-sm text-zinc-400 text-center text-pretty max-w-[65ch] mx-auto">
      Each lit step is one cylinder firing. Light 4 evenly (0°, 180°, 360°, 540°) for a four-cylinder,
      6 for a straight six, all 12 for a V12. Uneven gaps give the lumpy sound of a V-twin.
    </p>
  </section>
</main>
