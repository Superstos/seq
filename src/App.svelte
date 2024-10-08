<script>
  import * as Tone from "tone";
  import kick from "./assets/sounds/kick.ogg"; // Use Ogg for better performance
  
  const KICKSAMPLE = new Tone.Player(kick).toDestination();
  const volumeControl = new Tone.Gain(-0.5).toDestination(); // Start with muted volume
  KICKSAMPLE.connect(volumeControl);
  
  let bpm = 100; // Initial BPM
  let beat = 0;
  let isPlaying = false;

  // Define rows for beat activation
  let rows = [
      Array.from({ length: 8 }, (_, i) => ({ active: false })),
      Array.from({ length: 8 }, (_, i) => ({ active: false })),
      Array.from({ length: 8 }, (_, i) => ({ active: false })),
      Array.from({ length: 8 }, (_, i) => ({ active: false })),
  ];
  
  let beatIndicators = Array.from({ length: 8 }, (_, i) => i);
  
  // Schedule repeat to play the kick sample
  Tone.Transport.scheduleRepeat(time => {
      rows.forEach((row) => {
          if (row[beat].active) {
              KICKSAMPLE.stop(); // Stop any currently playing sample
              KICKSAMPLE.start(time); // Start the sample
          }
      });
      beat = (beat + 1) % 8;
  }, "8n");
  
  const handleNoteClick = (rowIndex, noteIndex) => {
      rows[rowIndex][noteIndex].active = !rows[rowIndex][noteIndex].active;
  };
  
  const handlePlayClick = () => {
      if (!isPlaying) Tone.start();
      Tone.Transport.bpm.value = bpm; // Set the BPM
      Tone.Transport.start();
      isPlaying = true;
  };
  
  const handleStopClick = () => {
      Tone.Transport.stop();
      isPlaying = false;
  };
  
  const handleVolumeChange = (event) => {
      const volume = event.target.value;
      volumeControl.gain.value = volume; // Update gain value based on slider
  };
  
  $: if (isPlaying) {
      Tone.Transport.bpm.value = bpm; // Update BPM while playing
  }
</script>

<main class="subpixel-antialiased min-h-screen dark:bg-gray-800 bg-gray-200">
  <div class="grid grid-cols-2 p-3 max-w-xl mx-auto">
    <div class="inline-flex flex-wrap items-center gap-2">
      <label class="text-gray-100 w-32" for="bpm">{bpm} BPM/RPM</label>
      <input type="range" id="bpm" name="bpm" min="100" bind:value={bpm} max="4000" step="10" class="">
    </div>
    <div class="inline-flex flex-wrap items-center gap-2">
      <label class="text-gray-100" for="volume">Volume</label>
      <input type="range" id="volume" name="volume" min="-1" max="0" step="0.01" on:input={handleVolumeChange} class="">
    </div>
    <div class="grid grid-cols-1 gap-3">
      {#if !isPlaying}
        <button on:click={handlePlayClick} class="btn-gray" id="play" name="play">Play</button>
      {:else}
        <button on:click={handleStopClick} class="btn-gray" id="stop" name="stop">Stop</button>
      {/if}
    </div>
  </div>
  <div class="grid grid-cols-8 items-center justify-center gap-3 w-full p-3 max-w-xl mx-auto">
    {#each beatIndicators as beatIndicator, bi}
      <div class="squircle place-self-center h-3 w-3 {bi === beat - 1 ? 'bg-lime-500' : ''}"></div>
    {/each}
    {#each rows as row, i}
      {#each row as note, j}
        <button class="w-12 h-12 squircle 
          {note.active ? 'bg-red-600' : 'bg-gray-600'}
          {j % 4 === 0 ? 'bg-gray-700' : ''}"
          on:click={() => {handleNoteClick(i, j)}}  
        >
        </button>
      {/each}
    {/each}
  </div>
</main>