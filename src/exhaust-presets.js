// Exhaust choices shared by the page and scripts/render-engine-sound.mjs.
// file: an impulse response from engine-sim's sound library (Ange Yaghi, MIT licence), trimmed by
// scripts/trim-exhaust-responses.mjs. headerSpread: how unequal the header pipes are, in meters.
// makeupGain: brings the convolved exhaust back to the dry exhaust's level, measured by the render script.
export const EXHAUST_PRESETS = [
    { name: "Stock", file: "smooth_39.wav", headerSpread: 0.05, airNoise: 1, derivativeMix: 0.01, makeupGain: 3.57 },
    { name: "Sport", file: "mild_exhaust.wav", headerSpread: 0.12, airNoise: 1, derivativeMix: 0.01, makeupGain: 5.54 },
    { name: "Race", file: "sharp_01.wav", headerSpread: 0.25, airNoise: 0.9, derivativeMix: 0.015, makeupGain: 13.35 },
    { name: "Straight pipe", file: "minimal_muffling_02.wav", headerSpread: 0.25, airNoise: 0.9, derivativeMix: 0.015, makeupGain: 3.73 },
];
