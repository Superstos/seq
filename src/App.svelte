<script>
import * as Tone from "tone";
import kick from "./assets/sounds/kick.mp3";

const KICKSAMPLE = new Tone.Player(kick).toDestination();
const volumeControl = new Tone.Gain(-0.5).toDestination();
KICKSAMPLE.connect(volumeControl);

let bpm = 100;
let beat = 0;
let isPlaying = false;

// Instead of synths, we will use the kick sample
let rows = [
    Array.from({ length: 16 }, (_, i) => ({ active: false })),
    Array.from({ length: 16 }, (_, i) => ({ active: false })),
    Array.from({ length: 16 }, (_, i) => ({ active: false })),
    Array.from({ length: 16 }, (_, i) => ({ active: false })),
];

let beatIndicators = Array.from({ length: 16 }, (_, i) => i);

Tone.Transport.scheduleRepeat(time => {
    rows.forEach((row) => {
        if (row[beat].active) KICKSAMPLE.start(time);
    });
    beat = (beat + 1) % 16;
}, "16n");

const handleNoteClick = (rowIndex, noteIndex) => {
    rows[rowIndex][noteIndex].active = !rows[rowIndex][noteIndex].active;
};

const handleVolumeChange = (event) => {
    const volume = event.target.value;
    volumeControl.gain.value = volume;
};

const handlePlaybackRateChange = (event) => {
    const playbackRate = event.target.value;
    KICKSAMPLE.playbackRate = playbackRate;
};

const handlePlayClick = () => {
    if (!isPlaying) Tone.start();
    Tone.Transport.bpm.value = bpm;
    Tone.Transport.start();
    isPlaying = true;
};

const handleStopClick = () => {
    Tone.Transport.stop();
    isPlaying = false;
};

$: if (isPlaying) {
    Tone.Transport.bpm.value = bpm;
}
</script>

<main class="subpixel-antialiased min-h-screen dark:bg-gray-800 bg-gray-200">
  <div class="grid grid-cols-2 p-3">
    <div class="inline-flex flex-wrap items-center gap-2">
      <label class="text-gray-100 w-48" for="bpm">{bpm} BPM/RPM</label>
      <input type="range" id="bpm" name="bpm" min="100" bind:value={bpm} max="15000"
        class="">
    </div>
    <div class="inline-flex flex-wrap items-center gap-2">
      <label class="text-gray-100" for="volume">Volume</label>
      <input type="range" id="volume" name="volume" min="-1" 
        bind:value={volumeControl.gain.value} max="1" step="0.01" 
        on:input={handleVolumeChange} class=""
      >
    </div>
    <div class="inline-flex flex-wrap items-center gap-2">
      <label class="text-gray-100" for="playbackRate">Playback Rate</label>
      <input type="range" id="playbackRate" name="playbackRate" min="0.5" max="2" step="0.01" on:input={handlePlaybackRateChange} class="">
    </div>
    <div class="grid grid-cols-1 gap-3">
      {#if !isPlaying}
        <button on:click={handlePlayClick} class="btn-gray" id="play" name="play">Play</button>
      {:else}
        <button on:click={handleStopClick} class="btn-gray" id="stop" name="stop">Stop</button>
      {/if}
    </div>
  </div>
  <div class="grid grid-cols-16 gap-3 w-full p-3">
    {#each beatIndicators as beatIndicator, bi}
      <div class="squircle h-3 w-3 {bi === beat - 1 ? 'bg-lime-500' : ''}"></div>
    {/each}
    {#each rows as row, i}
      {#each row as note, j}
        <button class="w-12 h-12 squircle 
          {note.active ? 'bg-red-600' : 'bg-gray-600'}
          {j % 4 === 0? 'bg-gray-700' : ''}"
          on:click={() => {handleNoteClick(i, j)}}  
        >
        </button>
      {/each}
    {/each}
  </div>
</main>
