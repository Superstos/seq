// Renders the engine offline into WAV files, with no audio device: the page's own src/engine-processor.js
// runs here under small stand-ins for the browser's AudioWorklet globals, fed a scripted drive.
// Each exhaust preset is convolved with its impulse response, scaled exactly as the page's ConvolverNode
// scales it (Web Audio normalisation), mixed with the engine bay, then set to the page's volume and limiter.
// Drive: crank and idle, two blips, the rev limiter in neutral, a launch through the gears, braking, switch-off.
// Run: node scripts/render-engine-sound.mjs [preset ...]. Needs ffmpeg on PATH. Writes renders/.
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readWav, writeWav } from "./wav-file.mjs";
import { EXHAUST_PRESETS } from "../src/exhaust-presets.js";

const SAMPLE_RATE = 48000;
const BLOCK_FRAMES = 128;
const RENDER_SECONDS = 48;
const SHIFT_UP_RPM = 6500;
const SECONDS_BETWEEN_SHIFTS = 1;
const LAUNCH_AT = 17.5;
const LIFT_AT = 35.5;
const TOP_GEAR = 5;
const FOUR_CYLINDER = [true, false, false, true, false, false, true, false, false, true, false, false];
const OUTPUT_FOLDER = new URL("../renders/", import.meta.url);
const IMPULSE_FOLDER = new URL("../public/ir/", import.meta.url);
// Web Audio ConvolverNode normalisation, from the spec's calculateNormalizationScale.
const GAIN_CALIBRATION = 0.00125;
const GAIN_CALIBRATION_SAMPLE_RATE = 44100;
const MIN_POWER = 0.000125;
// The page starts its volume knob at 0.5 and limits at -1 dBFS (0.891).
const PAGE_VOLUME = 0.5;
const LIMIT_LEVEL = 0.891;
// Timed driver inputs, in seconds. Upshifts happen on their own at 6500 RPM while the throttle is down.
const DRIVE = [
    { at: 0, message: { pattern: FOUR_CYLINDER } },
    { at: 0.5, message: { start: true } },
    { at: 6.5, message: { throttle: 0.45 } },
    { at: 6.8, message: { throttle: 0 } },
    { at: 9, message: { throttle: 1 } },
    { at: 9.4, message: { throttle: 0 } },
    { at: 11.5, message: { throttle: 1 } },
    { at: 14, message: { throttle: 0 } },
    { at: 17, message: { gear: 1 } },
    { at: LAUNCH_AT, message: { throttle: 1 } },
    { at: LIFT_AT, message: { throttle: 0 } },
    { at: LIFT_AT + 0.3, message: { brake: 1 } },
    { at: 44, message: { brake: 0, gear: 0 } },
    { at: 45, message: { stop: true } },
];
// Spans of the drive to measure, in seconds.
const SPANS = [
    { name: "cranking", from: 0.8, to: 1.2 },
    { name: "idle", from: 4, to: 6.5 },
    { name: "neutral full throttle", from: 12, to: 14 },
    { name: "idle after limiter", from: 16, to: 17 },
    { name: "launch", from: LAUNCH_AT, to: LAUNCH_AT + 4 },
    { name: "top gears", from: LIFT_AT - 4, to: LIFT_AT },
    { name: "braking", from: LIFT_AT + 0.5, to: LIFT_AT + 4 },
    { name: "switch-off", from: 45, to: 46.5 },
];

class ReportPort {
    constructor() {
        this.onmessage = null;
        this.reports = [];
    }

    postMessage(report) {
        this.reports.push(report);
    }
}

class AudioWorkletProcessorStandIn {
    constructor() {
        this.port = new ReportPort();
    }
}

const processorClasses = new Map();
function registerProcessorStandIn(name, processorClass) {
    processorClasses.set(name, processorClass);
}

globalThis.sampleRate = SAMPLE_RATE;
globalThis.AudioWorkletProcessor = AudioWorkletProcessorStandIn;
globalThis.registerProcessor = registerProcessorStandIn;
await import("../src/engine-processor.js");
const EngineProcessor = processorClasses.get("engine");

function send(engine, message) {
    engine.port.onmessage({ data: message });
}

function renderDrive(exhaust) {
    const engine = new EngineProcessor();
    // A fixed seed makes every render of a preset come out the same.
    send(engine, { seed: 22222 });
    const frameCount = RENDER_SECONDS * SAMPLE_RATE;
    const exhaustSamples = new Float32Array(frameCount);
    const baySamples = new Float32Array(frameCount);
    const outputs = [[new Float32Array(BLOCK_FRAMES)], [new Float32Array(BLOCK_FRAMES)]];
    const trace = [];
    let throttle = 0;
    let nextEvent = 0;
    let lastShiftAt = 0;
    send(engine, { exhaust });
    for (let start = 0; start + BLOCK_FRAMES <= frameCount; start += BLOCK_FRAMES) {
        const seconds = start / SAMPLE_RATE;
        while (nextEvent < DRIVE.length && DRIVE[nextEvent].at <= seconds) {
            const message = DRIVE[nextEvent].message;
            if (message.throttle !== undefined) throttle = message.throttle;
            send(engine, message);
            nextEvent += 1;
        }
        engine.process([], outputs);
        exhaustSamples.set(outputs[0][0], start);
        baySamples.set(outputs[1][0], start);
        const report = engine.port.reports.pop();
        engine.port.reports.length = 0;
        if (!report) continue;
        trace.push({ seconds, throttle, ...report });
        const rested = seconds - lastShiftAt > SECONDS_BETWEEN_SHIFTS;
        const shouldShift = rested && throttle > 0.5 && report.gear >= 1 && report.gear < TOP_GEAR && report.rpm > SHIFT_UP_RPM;
        if (!shouldShift) continue;
        send(engine, { gear: report.gear + 1 });
        lastShiftAt = seconds;
    }
    return { exhaustSamples, baySamples, trace };
}

function rootMeanSquare(samples, from, to) {
    let sum = 0;
    for (let index = from; index < to; index += 1) sum += samples[index] * samples[index];
    return Math.sqrt(sum / Math.max(1, to - from));
}

function peakOf(samples, from, to) {
    let peak = 0;
    for (let index = from; index < to; index += 1) peak = Math.max(peak, Math.abs(samples[index]));
    return peak;
}

function decibels(level) {
    return (20 * Math.log10(level + 1e-12)).toFixed(1);
}

function firstTime(trace, test) {
    for (const row of trace) {
        if (test(row)) return row.seconds;
    }
    return null;
}

function isStarterOff(row) {
    return row.ignition && !row.starter && row.seconds > 0.6;
}

function isAtHundred(row) {
    return row.kmh >= 100;
}

function isStopped(row) {
    return row.seconds > LIFT_AT && row.kmh < 0.5;
}

function summariseSpan(span, trace, levels) {
    let rows = 0;
    let rpmSum = 0;
    let rpmLow = Infinity;
    let rpmHigh = 0;
    let manifoldSum = 0;
    for (const row of trace) {
        if (row.seconds < span.from || row.seconds >= span.to) continue;
        rows += 1;
        rpmSum += row.rpm;
        rpmLow = Math.min(rpmLow, row.rpm);
        rpmHigh = Math.max(rpmHigh, row.rpm);
        manifoldSum += row.manifold;
    }
    const from = Math.round(span.from * SAMPLE_RATE);
    const to = Math.round(span.to * SAMPLE_RATE);
    return {
        span: span.name,
        rpmMean: Math.round(rpmSum / rows),
        rpmLow: Math.round(rpmLow),
        rpmHigh: Math.round(rpmHigh),
        manifoldBar: (manifoldSum / rows).toFixed(2),
        dryDb: decibels(rootMeanSquare(levels.dry, from, to)),
        exhaustDb: decibels(rootMeanSquare(levels.exhaust, from, to)),
        bayDb: decibels(rootMeanSquare(levels.bay, from, to)),
        mixDb: decibels(rootMeanSquare(levels.mix, from, to)),
        mixPeakDb: decibels(peakOf(levels.mix, from, to)),
    };
}

function summariseDrive(trace) {
    const atHundred = firstTime(trace, isAtHundred);
    let topKmh = 0;
    let topRpm = 0;
    let limiterReports = 0;
    let gearAtLift = null;
    for (const row of trace) {
        if (row.seconds >= LIFT_AT && gearAtLift === null) gearAtLift = row.gear;
        topKmh = Math.max(topKmh, row.kmh);
        topRpm = Math.max(topRpm, row.rpm);
        if (row.limiter) limiterReports += 1;
    }
    return {
        starterReleasedAt: firstTime(trace, isStarterOff),
        zeroToHundredSeconds: atHundred === null ? null : Number((atHundred - LAUNCH_AT).toFixed(2)),
        topKmh: Math.round(topKmh),
        topRpm: Math.round(topRpm),
        limiterReports,
        gearAtLift,
        stoppedAt: firstTime(trace, isStopped),
    };
}

function writeTrace(path, trace) {
    const lines = ["seconds,rpm,kmh,gear,throttle,manifold,clutch,limiter,ignition,starter"];
    for (const row of trace) {
        lines.push([row.seconds.toFixed(3), row.rpm.toFixed(0), row.kmh.toFixed(1), row.gear, row.throttle, row.manifold.toFixed(3), row.clutch.toFixed(0), Number(row.limiter), Number(row.ignition), Number(row.starter)].join(","));
    }
    return writeFile(path, lines.join("\n"));
}

async function normalisationScale(impulsePath) {
    const response = await readWav(impulsePath);
    const samples = response.channels[0];
    const power = Math.max(MIN_POWER, rootMeanSquare(samples, 0, samples.length));
    return (GAIN_CALIBRATION / power) * (GAIN_CALIBRATION_SAMPLE_RATE / SAMPLE_RATE);
}

function runFfmpeg(args) {
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
}

function convolveGraph(scale) {
    return `[1:a]aresample=${SAMPLE_RATE},volume=${scale}[ir];[0:a][ir]afir=irnorm=-1:gtype=none`;
}

function mixGraph() {
    return `[0:a][1:a]amix=inputs=2:normalize=0,volume=${PAGE_VOLUME},alimiter=limit=${LIMIT_LEVEL}:level=false`;
}

// Sends one unit click through the convolution. The result must equal the resampled response times the scale,
// which proves ffmpeg added no gain of its own, just like the page's normalised ConvolverNode.
async function checkConvolutionGain(impulsePath, scale) {
    const clickPath = fileURLToPath(new URL("check-click.wav", OUTPUT_FOLDER));
    const heardPath = fileURLToPath(new URL("check-heard.wav", OUTPUT_FOLDER));
    const expectedPath = fileURLToPath(new URL("check-expected.wav", OUTPUT_FOLDER));
    const click = new Float32Array(SAMPLE_RATE / 2);
    click[0] = 1;
    await writeWav(clickPath, [click], SAMPLE_RATE, 32);
    runFfmpeg(["-i", clickPath, "-i", impulsePath, "-filter_complex", convolveGraph(scale), "-c:a", "pcm_f32le", heardPath]);
    runFfmpeg(["-i", impulsePath, "-af", `aresample=${SAMPLE_RATE}`, "-c:a", "pcm_f32le", expectedPath]);
    const heard = (await readWav(heardPath)).channels[0];
    const expected = (await readWav(expectedPath)).channels[0];
    let worstError = 0;
    let expectedPeak = 0;
    for (let index = 0; index < expected.length; index += 1) {
        worstError = Math.max(worstError, Math.abs(heard[index] - expected[index] * scale));
        expectedPeak = Math.max(expectedPeak, Math.abs(expected[index] * scale));
    }
    if (worstError > expectedPeak * 0.01) throw new Error(`convolution gain is off: error ${worstError} against peak ${expectedPeak}`);
}

function slugOf(preset) {
    return preset.name.toLowerCase().replaceAll(" ", "-");
}

async function renderPreset(preset) {
    const slug = slugOf(preset);
    const sound = renderDrive(preset);
    const dryPath = fileURLToPath(new URL(`${slug}-exhaust-dry.wav`, OUTPUT_FOLDER));
    const wetPath = fileURLToPath(new URL(`${slug}-exhaust-wet.wav`, OUTPUT_FOLDER));
    const bayPath = fileURLToPath(new URL(`${slug}-engine-bay.wav`, OUTPUT_FOLDER));
    const impulsePath = fileURLToPath(new URL(preset.file, IMPULSE_FOLDER));
    const mixPath = fileURLToPath(new URL(`engine-${slug}.wav`, OUTPUT_FOLDER));
    const spectrogramPath = fileURLToPath(new URL(`engine-${slug}-spectrogram.png`, OUTPUT_FOLDER));
    await writeWav(dryPath, [sound.exhaustSamples], SAMPLE_RATE, 32);
    await writeWav(bayPath, [sound.baySamples], SAMPLE_RATE, 32);
    await writeTrace(fileURLToPath(new URL(`${slug}-drive-trace.csv`, OUTPUT_FOLDER)), sound.trace);
    const scale = await normalisationScale(impulsePath);
    await checkConvolutionGain(impulsePath, scale);
    runFfmpeg(["-i", dryPath, "-i", impulsePath, "-filter_complex", convolveGraph(scale * preset.makeupGain), "-c:a", "pcm_f32le", wetPath]);
    runFfmpeg(["-i", wetPath, "-i", bayPath, "-filter_complex", mixGraph(), "-c:a", "pcm_s16le", mixPath]);
    runFfmpeg(["-i", mixPath, "-lavfi", "showspectrumpic=s=1400x500:legend=1:fscale=log:stop=6000", spectrogramPath]);
    const levels = {
        dry: sound.exhaustSamples,
        exhaust: (await readWav(wetPath)).channels[0],
        bay: sound.baySamples,
        mix: (await readWav(mixPath)).channels[0],
    };
    const wetLevel = rootMeanSquare(levels.exhaust, 0, levels.exhaust.length);
    const dryLevel = rootMeanSquare(sound.exhaustSamples, 0, sound.exhaustSamples.length);
    const measuredMakeup = (preset.makeupGain * dryLevel) / wetLevel;
    console.log(`\n${preset.name}: ${mixPath}`);
    console.log(`response scale ${scale.toFixed(5)}, makeup gain stored ${preset.makeupGain}, measured ${measuredMakeup.toFixed(2)}`);
    const spans = [];
    for (const span of SPANS) spans.push(summariseSpan(span, sound.trace, levels));
    console.table(spans);
    console.log(summariseDrive(sound.trace));
}

await mkdir(OUTPUT_FOLDER, { recursive: true });
const wanted = process.argv.slice(2);
for (const preset of EXHAUST_PRESETS) {
    if (wanted.length === 0 || wanted.includes(slugOf(preset))) await renderPreset(preset);
}
