<script>
  import { createEventDispatcher } from "svelte";

  export let value = 0.5;

  const SWEEP_DEGREES = 270;
  const DRAG_PIXELS_FOR_FULL_TURN = 200;
  const KEY_STEP = 0.05;

  const dispatch = createEventDispatcher();
  let dragStartY = 0;
  let dragStartValue = 0;

  const setValue = (next) => {
    value = Math.min(1, Math.max(0, next));
    dispatch("change", value);
  };

  const handlePointerDown = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartY = event.clientY;
    dragStartValue = value;
  };

  const handlePointerMove = (event) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    setValue(dragStartValue + (dragStartY - event.clientY) / DRAG_PIXELS_FOR_FULL_TURN);
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowUp" || event.key === "ArrowRight") setValue(value + KEY_STEP);
    if (event.key === "ArrowDown" || event.key === "ArrowLeft") setValue(value - KEY_STEP);
  };

  $: angle = (value - 0.5) * SWEEP_DEGREES;
  $: ticks = Array.from({ length: 11 }, (_, index) => (index / 10 - 0.5) * SWEEP_DEGREES);
</script>

<div class="knob-wrap">
  {#each ticks as tickAngle}
    <span class="knob-tick" style="transform: rotate({tickAngle}deg)"></span>
  {/each}
  <div
    class="knob"
    role="slider"
    tabindex="0"
    aria-label="Volume"
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow={Math.round(value * 100)}
    on:pointerdown={handlePointerDown}
    on:pointermove={handlePointerMove}
    on:keydown={handleKeyDown}
  >
    <span class="knob-pointer" style="transform: rotate({angle}deg)"></span>
  </div>
</div>
