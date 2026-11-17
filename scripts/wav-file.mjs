// Reads and writes WAV files as one Float32Array per channel, with samples from -1 to 1.
// Reads 16-bit PCM and 32-bit float. Writes 16-bit PCM (for players) or 32-bit float (for ffmpeg, never clips).
import { readFile, writeFile } from "node:fs/promises";

// 1 = PCM, 3 = IEEE float, 0xfffe = extensible (the real format sits in the first 2 bytes of its subformat).
const PCM_FORMAT = 1;
const FLOAT_FORMAT = 3;
const EXTENSIBLE_FORMAT = 0xfffe;
const INT16_SCALE = 32768;

function readFormat(view, start) {
    const tag = view.getUint16(start, true);
    return {
        tag: tag === EXTENSIBLE_FORMAT ? view.getUint16(start + 24, true) : tag,
        channelCount: view.getUint16(start + 2, true),
        sampleRate: view.getUint32(start + 4, true),
        bitsPerSample: view.getUint16(start + 14, true),
    };
}

function readSample(view, offset, format) {
    if (format.tag === FLOAT_FORMAT) return view.getFloat32(offset, true);
    return view.getInt16(offset, true) / INT16_SCALE;
}

export async function readWav(path) {
    const bytes = await readFile(path);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let format = null;
    let dataStart = 0;
    let dataSize = 0;
    for (let offset = 12; offset + 8 <= bytes.length; ) {
        const id = bytes.toString("ascii", offset, offset + 4);
        const size = view.getUint32(offset + 4, true);
        if (id === "fmt ") format = readFormat(view, offset + 8);
        if (id === "data") {
            dataStart = offset + 8;
            dataSize = Math.min(size, bytes.length - dataStart);
        }
        offset += 8 + size + (size % 2);
    }
    const bytesPerSample = format.bitsPerSample / 8;
    const frameCount = Math.floor(dataSize / (bytesPerSample * format.channelCount));
    const channels = [];
    for (let channel = 0; channel < format.channelCount; channel += 1) channels.push(new Float32Array(frameCount));
    for (let frame = 0; frame < frameCount; frame += 1) {
        for (let channel = 0; channel < format.channelCount; channel += 1) {
            const offset = dataStart + (frame * format.channelCount + channel) * bytesPerSample;
            channels[channel][frame] = readSample(view, offset, format);
        }
    }
    return { sampleRate: format.sampleRate, channels };
}

export async function writeWav(path, channels, sampleRate, bitsPerSample) {
    const bytesPerSample = bitsPerSample / 8;
    const frameCount = channels[0].length;
    const dataSize = frameCount * channels.length * bytesPerSample;
    const bytes = Buffer.alloc(44 + dataSize);
    bytes.write("RIFF", 0, "ascii");
    bytes.writeUInt32LE(36 + dataSize, 4);
    bytes.write("WAVEfmt ", 8, "ascii");
    bytes.writeUInt32LE(16, 16);
    bytes.writeUInt16LE(bitsPerSample === 32 ? FLOAT_FORMAT : PCM_FORMAT, 20);
    bytes.writeUInt16LE(channels.length, 22);
    bytes.writeUInt32LE(sampleRate, 24);
    bytes.writeUInt32LE(sampleRate * channels.length * bytesPerSample, 28);
    bytes.writeUInt16LE(channels.length * bytesPerSample, 32);
    bytes.writeUInt16LE(bitsPerSample, 34);
    bytes.write("data", 36, "ascii");
    bytes.writeUInt32LE(dataSize, 40);
    for (let frame = 0; frame < frameCount; frame += 1) {
        for (let channel = 0; channel < channels.length; channel += 1) {
            const offset = 44 + (frame * channels.length + channel) * bytesPerSample;
            const sample = channels[channel][frame];
            if (bitsPerSample === 32) bytes.writeFloatLE(sample, offset);
            else bytes.writeInt16LE(Math.max(-INT16_SCALE, Math.min(INT16_SCALE - 1, Math.round(sample * INT16_SCALE))), offset);
        }
    }
    await writeFile(path, bytes);
}
