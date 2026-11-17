// Trims each exhaust impulse response in public/ir/ the way engine-sim loads it
// (Synthesizer::initializeImpulseResponse, Ange Yaghi, MIT licence): keep up to the last sample
// louder than 100 out of 32,768, and never more than 10,000 samples (0.23 s at 44.1 kHz).
// Run it after adding a WAV there: node scripts/trim-exhaust-responses.mjs. Running it twice changes nothing.
import { readdir } from "node:fs/promises";
import { readWav, writeWav } from "./wav-file.mjs";

const IMPULSE_FOLDER = new URL("../public/ir/", import.meta.url);
const QUIET_LEVEL = 100 / 32768;
const MAXIMUM_SAMPLES = 10000;

for (const name of await readdir(IMPULSE_FOLDER)) {
    if (!name.endsWith(".wav")) continue;
    const path = new URL(name, IMPULSE_FOLDER);
    const response = await readWav(path);
    const samples = response.channels[0];
    let loudEnd = 0;
    for (let index = 0; index < samples.length; index += 1) {
        if (Math.abs(samples[index]) > QUIET_LEVEL) loudEnd = index + 1;
    }
    const kept = samples.slice(0, Math.min(MAXIMUM_SAMPLES, loudEnd));
    await writeWav(path, [kept], response.sampleRate, 16);
    console.log(`${name}: ${samples.length} -> ${kept.length} samples`);
}
