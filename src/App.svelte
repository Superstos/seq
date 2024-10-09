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
      Array.from({ length: 12 }, (_, i) => ({ active: false })),
  ];
  
  let beatIndicators = Array.from({ length: 12 }, (_, i) => i);
  
  // Schedule repeat to play the kick sample
  Tone.Transport.scheduleRepeat(time => {
      rows.forEach((row) => {
          if (row[beat].active) {
              KICKSAMPLE.stop(); // Stop any currently playing sample
              KICKSAMPLE.start(time);
          }
      });
      beat = (beat + 1) % 12;
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

<main class="subpixel-antialiased min-h-screen h-full dark:bg-gray-800 bg-gray-200">
  <div class="flex flex-col max-w-3xl mx-auto p-3 text-gray-900 dark:text-gray-100 text-balance">
    <p class="max-w-xl mx-auto font-normal text-center text-lg p-3 dark:text-red-600 text-red-700">
      <strong class="inline-flex items-center gap-1 text-xl font-semibold">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>        
        Warning: 
      </strong><br>if your machine is not of today's standard don't push the slider more than 5000
      and even if you do be careful near 8000. <br>
      <span class="font-light">if you do just try to lower the bpm and press stop if it crashes it's ok, <br>
        you may open a new tab
      </span>
    </p>
    <h1 class="text-center text-5xl md:text-7xl font-mono font-bold tracking-tighter mb-6">Step Sequencer Demo</h1>
    <p class="text-base text-center">this Demo showcase's the performance of svelte and tone.js as the tempo increases
      and the fun part is... if you select some random notes and increase the Bpm from the slider
      a non perfect fake sounding car engine will be formed.
    </p>
    <i class="text-base text-center border-l-4 border-gray-500 p-3 my-3 bg-gray-300 dark:bg-gray-700">
      note: sorry for the shubby explanation. but if you know what you are doing; 
      either way have fun.
    </i>
  </div>
  <div id="controls" class="grid grid-cols-1 gap-3 justify-between max-w-xl mx-auto p-3 text-gray-900 dark:text-gray-100">
    <div class="grid grid-cols-1 md:grid-cols-2">
      <div class="inline-flex flex-wrap items-center gap-2">
        <label class="w-32" for="bpm">{bpm} BPM</label>
        <input type="range" id="bpm" name="bpm" min="100" bind:value={bpm} max="15000" step="10" class="">
      </div>
      <div class="inline-flex flex-wrap items-center gap-2">
        <label class="" for="volume">Volume</label>
        <input type="range" id="volume" name="volume" min="-1" max="0" step="0.01" on:input={handleVolumeChange} class="">
      </div>
    </div>
    <div class="grid grid-cols-1 gap-3">
      {#if !isPlaying}
        <button on:click={handlePlayClick} class="btn-gray w-min mx-auto" id="play" name="play">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
          </svg>
        </button>
      {:else}
        <button on:click={handleStopClick} class="btn-gray w-min mx-auto" id="stop" name="stop">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
          </svg>          
        </button>
      {/if}
    </div>
  </div>
  <div class="max-w-[100vw] overflow-x-scroll lg:max-w-full lg:overflow-x-visible pb-32">
    <div class="grid grid-cols-12 gap-3 items-center justify-center justify-items-center p-3 w-[1000px] max-w-5xl mx-auto">
      {#each beatIndicators as beatIndicator, bi}
        <div class="squircle place-self-center h-3 w-3 {bi === beat && isPlaying ? 'bg-lime-500' : ''}"></div>
      {/each}
      {#each rows as row, i}
        {#each row as note, j}
          <button class="w-16 h-16 squircle 
            {note.active ? 'bg-red-600' : 'bg-gray-600'}
            {j % 4 === 0 ? 'bg-gray-700' : ''}"
            on:click={() => {handleNoteClick(i, j)}}  
          >
          </button>
        {/each}
      {/each}
    </div>
  </div>
</main>