<script>
  export let value = 0;
  export let max = 8;
  export let labelEvery = 1;
  export let ticksPerLabel = 5;
  export let redFrom = Infinity;
  export let unit = "";
  export let label = "";

  // The needle sweeps 270 degrees: 0 sits at 7:30 on a clock face and the maximum at 4:30.
  const SWEEP_DEGREES = 270;
  const START_DEGREES = -135;
  const CENTER = 100;

  function angleOf(reading, maximum) {
      return START_DEGREES + (Math.min(Math.max(reading, 0), maximum) / maximum) * SWEEP_DEGREES;
  }

  function pointAt(degrees, radius) {
      const radians = (degrees * Math.PI) / 180;
      return { x: CENTER + radius * Math.sin(radians), y: CENTER - radius * Math.cos(radians) };
  }

  function buildTicks(maximum, every, perLabel, redStart) {
      const ticks = [];
      const count = Math.round((maximum / every) * perLabel);
      for (let index = 0; index <= count; index += 1) {
          const reading = (index * every) / perLabel;
          const isMajor = index % perLabel === 0;
          const degrees = angleOf(reading, maximum);
          ticks.push({
              reading,
              isMajor,
              isRed: reading >= redStart,
              outer: pointAt(degrees, 90),
              inner: pointAt(degrees, isMajor ? 76 : 83),
              text: pointAt(degrees, 63),
          });
      }
      return ticks;
  }

  $: ticks = buildTicks(max, labelEvery, ticksPerLabel, redFrom);
  $: needleAngle = angleOf(value, max);
</script>

<div class="gauge" role="img" aria-label="{label}: {Math.round(value)} {unit}">
<svg class="gauge-face" viewBox="0 0 200 200" aria-hidden="true">
  <defs>
    <radialGradient id="face-{label}" cx="50%" cy="38%" r="70%">
      <stop offset="0%" stop-color="#2a2a30" />
      <stop offset="100%" stop-color="#09090b" />
    </radialGradient>
  </defs>
  <circle cx="100" cy="100" r="98" fill="url(#face-{label})" />
  {#each ticks as tick}
    <line
      x1={tick.inner.x}
      y1={tick.inner.y}
      x2={tick.outer.x}
      y2={tick.outer.y}
      class="gauge-tick"
      class:gauge-tick-major={tick.isMajor}
      class:gauge-red={tick.isRed}
    />
    {#if tick.isMajor}
      <text x={tick.text.x} y={tick.text.y} class="gauge-number" class:gauge-red={tick.isRed}>{tick.reading}</text>
    {/if}
  {/each}
  <text x="100" y="140" class="gauge-unit">{unit}</text>
</svg>
<svg class="gauge-needle" viewBox="0 0 200 200" aria-hidden="true" style="transform: rotate({needleAngle}deg)">
  <polygon points="96.5,114 103.5,114 100,20" />
  <circle cx="100" cy="100" r="10" class="gauge-hub" />
</svg>
</div>
