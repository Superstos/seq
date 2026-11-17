// The whole car runs on the audio thread: crank, cylinders, clutch, gearbox, wheels, and their sound.
// The exhaust sound follows engine-sim by Ange Yaghi (MIT licence): cylinder pulses travel down the
// headers, then jitter, a DC cut, the pressure derivative mixed with air noise, and a leveler.
// Output 0 is the exhaust, which the page convolves with a recorded exhaust response.
// Output 1 is the engine bay and the road: valves, combustion knock, intake, starter, tyres and wind.

const STEPS_PER_CYCLE = 12;
const DEGREES_PER_CYCLE = 720;
const DEGREES_PER_STEP = DEGREES_PER_CYCLE / STEPS_PER_CYCLE;
const DEGREES_PER_RADIAN = 180 / Math.PI;
const RPM_PER_RADIAN_PER_SECOND = 60 / (2 * Math.PI);
const PASCALS_PER_BAR = 100000;
const BLOCK_FRAMES = 128;
const SECONDS_PER_SAMPLE = 1 / sampleRate;
const BLOCK_SECONDS = BLOCK_FRAMES / sampleRate;
// 12 blocks of 128 samples = 32 ms at 48 kHz, so the page gets about 31 reports a second.
const REPORT_EVERY_BLOCKS = 12;

// One cylinder: 86 mm bore and stroke, 143 mm rod, 10:1 compression, half a litre.
const BORE_METERS = 0.086;
const CRANK_RADIUS_METERS = 0.043;
const ROD_METERS = 0.143;
const COMPRESSION_RATIO = 10;
const POLYTROPIC_EXPONENT = 1.3;
const PISTON_SQUARE_METERS = Math.PI * (BORE_METERS / 2) ** 2;
const CYLINDER_CUBIC_METERS = PISTON_SQUARE_METERS * CRANK_RADIUS_METERS * 2;
const CYLINDER_LITRES = CYLINDER_CUBIC_METERS * 1000;

// Crank degrees after the cylinder's firing top dead centre.
const EXHAUST_OPENS = 130;
const INTAKE_OPENS = 350;
const INTAKE_CLOSES = 580;
const SPARK = 700;
const BURN_DEGREES = 60;
const PEAK_PRESSURE = 15;

const EXHAUST_BACK_PRESSURE_BAR = 1.1;
const FULL_THROTTLE_IMEP_BAR = 14.5;
const EXHAUST_SOUND_METERS_PER_SECOND = 500;
const INTAKE_SOUND_METERS_PER_SECOND = 343;
const HEADER_BASE_METERS = 0.6;
const INTAKE_RUNNER_METERS = 0.3;
// Header length offset per step, as a share of the exhaust's header spread.
const HEADER_OFFSETS = [0, 0.9, -0.4, 0.6, -0.8, 1, 0.2, -0.6, 0.8, -0.2, 0.5, -1];
// Burn strength per step: no two real cylinders burn exactly alike.
const CYLINDER_BALANCE = [1, 0.97, 1.03, 0.98, 1.02, 0.96, 1.01, 0.99, 1.04, 0.97, 1, 1.02];

const IDLE_RPM = 800;
const START_FLARE_RPM = 450;
const START_FLARE_SECONDS = 1.5;
const STARTER_FREE_RPM = 350;
const STARTER_NEWTON_METERS_PER_LITRE = 50;
const STARTER_RELEASE_RPM = 600;
const STARTER_GIVE_UP_SECONDS = 5;
const STARTER_GEAR_RATIO = 13;
const STARTER_COMMUTATOR_BARS = 9;
const STALL_RPM = 250;
const LIMITER_CUT_RPM = 7000;
const LIMITER_RESUME_RPM = 6850;
const OVERRUN_CUT_RPM = 1500;
const OVERRUN_RESUME_RPM = 1300;
const LIFTED_THROTTLE = 0.03;
const PRIME_DEGREES = 540;
const STUMBLE_DEGREES = 1620;
const POP_SECONDS = 1.2;

const FLYWHEEL_KG_M2 = 0.06;
const KG_M2_PER_CYLINDER = 0.025;
// Alternator, water pump and oil pump.
const BASE_FRICTION_NEWTON_METERS = 5;
// Friction mean effective pressure in bar = 0.5 + 0.1 x (RPM / 1000) + 0.03 x (RPM / 1000) squared.
const FRICTION_AT_REST_BAR = 0.5;
const FRICTION_PER_THOUSAND_RPM = 0.1;
const FRICTION_PER_THOUSAND_RPM_SQUARED = 0.03;
// Below this crank speed, static friction holds the crank still unless the torque beats it.
const HOLD_RADIANS_PER_SECOND = 0.3;
const STATIC_FRICTION_SHARE = 1.5;

// Exhaust gas left in the cylinder dilutes the fresh charge, more so at low manifold pressure.
// 0.1 = one part in the compression ratio stays behind at 1 bar.
const RESIDUAL_AT_ONE_BAR = 1 / COMPRESSION_RATIO;
const FRESH_AT_ONE_BAR = 1 - RESIDUAL_AT_ONE_BAR * EXHAUST_BACK_PRESSURE_BAR ** (1 / POLYTROPIC_EXPONENT);
// A small charge loses a bigger share of its heat to the cylinder walls: 10% at 1 bar, 33% at 0.3 bar.
const HEAT_LOSS_AT_ONE_BAR = 0.1;
// While idling, the ECU retards the spark and keeps this share of the torque, so it has some in reserve.
// The burn still happens, so the exhaust gets the energy the crank did not.
const IDLE_SPARK_TORQUE_SHARE = 0.85;

// Air: throttle area against what the cylinders swallow sets the manifold pressure.
const IDLE_AIR_BASE = 0.0016;
const IDLE_AIR_MAX = 0.012;
const IDLE_GAIN = 5e-6;
const IDLE_INTEGRAL_GAIN = 6e-6;
// Extra air per RPM-per-second of falling revs, so the idle catches a falling engine early.
const IDLE_DERIVATIVE_GAIN = 1.2e-6;
const AIR_DEMAND_PER_RPM = 0.04 / 6000;
const MINIMUM_MANIFOLD_BAR = 0.18;
const MANIFOLD_SMOOTHING = 1 - Math.exp(-BLOCK_SECONDS / 0.04);
const RPM_SMOOTHING = 1 - Math.exp(-BLOCK_SECONDS / 0.08);

// Car: 1300 kg on 0.35 m wheels, five gears, and a centrifugal clutch that bites from 1100 RPM.
const GEAR_RATIOS = [0, 3.58, 2.02, 1.35, 1.0, 0.81];
const FINAL_DRIVE = 4.1;
const WHEEL_RADIUS_METERS = 0.35;
const CAR_KG = 1300;
const GRAVITY = 9.81;
const ROLLING_RESISTANCE = 0.012;
const DRAG_AREA_SQUARE_METERS = 0.66;
const AIR_KG_PER_CUBIC_METER = 1.2;
const BRAKE_NEWTONS = 9000;
const DRIVETRAIN_EFFICIENCY = 0.92;
const CLUTCH_BITE_RPM = 1100;
const CLUTCH_FULL_RPM = 3200;
// Once the clutch stops slipping it stays locked until the engine falls below this.
const CLUTCH_RELEASE_RPM = 1000;
const CLUTCH_NEWTON_METERS_PER_CYLINDER = 60;
const CLUTCH_SLIP_RADIANS_PER_SECOND = 3;
const SHIFT_SECONDS = 0.3;
// During a shift the electronic throttle closes, or opens this far to raise the revs on a downshift.
const REV_MATCH_THROTTLE = 0.45;
const KMH_PER_METER_PER_SECOND = 3.6;

// engine-sim's synthesizer settings.
const INPUT_CUTOFF_HZ = 1900;
const JITTER_HISTORY = 10;
const JITTER_SCALE = 0.5;
const JITTER_SMOOTHING = 1 - Math.exp((-2 * Math.PI * 10000) / sampleRate);
const DC_SMOOTHING = 1 - Math.exp((-2 * Math.PI * 10) / sampleRate);
const LEVEL_TARGET = 0.6;
const LEVEL_MAX_GAIN = 0.032;
const LEVEL_MIN_GAIN = 0.00001;
const PEAK_RELEASE = Math.exp(-SECONDS_PER_SAMPLE / 0.6);
const GAIN_SMOOTHING = 1 - Math.exp(-SECONDS_PER_SAMPLE / 0.03);

const POP_BAR = 2;
const CRACKLE_LEVEL = 60;
const CRACKLE_DECAY = Math.exp(-SECONDS_PER_SAMPLE / 0.012);
const INTAKE_PULSE_BAR = 0.08;
const AIRBOX_LEVEL = 0.01;
const SNORKEL_LEVEL = 0.002;
const VALVE_TICK_LEVEL = 30;
const KNOCK_LEVEL = 70;
const THUD_LEVEL = 400;
const ZING_LEVEL = 120;
const STARTER_LEVEL = 2.5;
const HISS_LEVEL = 1;
const ROAD_LEVEL = 2;
const WIND_LEVEL = 2.4;
// The engine bay and the road keep a fixed gain: only the exhaust rides the leveler.
const BAY_GAIN = LEVEL_MAX_GAIN;

function pistonTravel(degrees) {
    const radians = degrees / DEGREES_PER_RADIAN;
    const offset = CRANK_RADIUS_METERS * Math.sin(radians);
    return CRANK_RADIUS_METERS * (1 - Math.cos(radians)) + ROD_METERS - Math.sqrt(ROD_METERS ** 2 - offset ** 2);
}

// Meters the piston travels per radian of crank: force on the piston times this is crank torque.
function pistonLever(degrees) {
    const radians = degrees / DEGREES_PER_RADIAN;
    const sine = Math.sin(radians);
    const offset = CRANK_RADIUS_METERS * sine;
    return offset + (CRANK_RADIUS_METERS * offset * Math.cos(radians)) / Math.sqrt(ROD_METERS ** 2 - offset ** 2);
}

function cylinderVolume(degrees) {
    return CYLINDER_CUBIC_METERS / (COMPRESSION_RATIO - 1) + PISTON_SQUARE_METERS * pistonTravel(degrees);
}

// Wiebe curve: the share of fuel burned, from the spark until 40 degrees after top dead centre.
function burnedFraction(degrees) {
    const sinceSpark = (degrees - SPARK + DEGREES_PER_CYCLE) % DEGREES_PER_CYCLE;
    if (sinceSpark > DEGREES_PER_CYCLE - INTAKE_CLOSES + EXHAUST_OPENS) return 0;
    const progress = Math.min(1, sinceSpark / BURN_DEGREES);
    return 1 - Math.exp(-5 * progress ** 3);
}

function meanOf(table) {
    let sum = 0;
    for (let degree = 0; degree < DEGREES_PER_CYCLE; degree += 1) sum += table[degree];
    return sum / DEGREES_PER_CYCLE;
}

// Torque tables per crank degree, in newton metres per bar of trapped or manifold pressure.
const CLOSED_LEVER = new Float32Array(DEGREES_PER_CYCLE + 1);
const INTAKE_LEVER = new Float32Array(DEGREES_PER_CYCLE + 1);
const FIXED_LEVER = new Float32Array(DEGREES_PER_CYCLE + 1);
const BURN_LEVER = new Float32Array(DEGREES_PER_CYCLE + 1);
const DISPLACEMENT_SHAPE = new Float32Array(DEGREES_PER_CYCLE + 1);
for (let degree = 0; degree <= DEGREES_PER_CYCLE; degree += 1) {
    const angle = degree % DEGREES_PER_CYCLE;
    const lever = PISTON_SQUARE_METERS * pistonLever(angle) * PASCALS_PER_BAR;
    const closed = angle >= INTAKE_CLOSES || angle < EXHAUST_OPENS;
    const exhaustOpen = angle >= EXHAUST_OPENS && angle < INTAKE_OPENS;
    const motoring = (cylinderVolume(INTAKE_CLOSES) / cylinderVolume(angle)) ** POLYTROPIC_EXPONENT;
    if (closed) {
        CLOSED_LEVER[degree] = motoring * lever;
        BURN_LEVER[degree] = motoring * burnedFraction(angle) * lever;
    } else if (!exhaustOpen) {
        INTAKE_LEVER[degree] = lever;
    }
    FIXED_LEVER[degree] = ((exhaustOpen ? EXHAUST_BACK_PRESSURE_BAR : 0) - 1) * lever;
    if (angle >= 180 && angle < 360) DISPLACEMENT_SHAPE[degree] = Math.sin(((angle - 180) * Math.PI) / 180);
}
const MOTORING_AT_EXHAUST_OPENS = (cylinderVolume(INTAKE_CLOSES) / cylinderVolume(EXHAUST_OPENS)) ** POLYTROPIC_EXPONENT;
const FULL_THROTTLE_TORQUE = (FULL_THROTTLE_IMEP_BAR * PASCALS_PER_BAR * CYLINDER_CUBIC_METERS) / (4 * Math.PI);
// How many times the trapped pressure a full burn adds, sized so full throttle gives 13 bar IMEP.
const BURN_PRESSURE_RISE = (FULL_THROTTLE_TORQUE - meanOf(CLOSED_LEVER) - meanOf(INTAKE_LEVER) - meanOf(FIXED_LEVER)) / meanOf(BURN_LEVER);

function wrapDegrees(degrees) {
    return ((degrees % DEGREES_PER_CYCLE) + DEGREES_PER_CYCLE) % DEGREES_PER_CYCLE;
}

// True when the crank passed the mark going forwards between two samples.
function crossed(previous, current, mark) {
    if (current >= previous) return previous < mark && mark <= current;
    if (previous - current < DEGREES_PER_CYCLE / 2) return false;
    return previous < mark || mark <= current;
}

function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
}

function smoothstep(value) {
    const inside = clamp(value, 0, 1);
    return inside * inside * (3 - 2 * inside);
}

function volumetricEfficiency(rpm) {
    return 0.8 + 0.15 * Math.exp(-(((rpm - 4500) / 2800) ** 2));
}

function createPulse() {
    return { amplitude: 0, slow: 0, fast: 0, slowDecay: 0, fastDecay: 0 };
}

// A pressure pulse shaped as slow decay minus fast decay: it rises in riseSeconds, peaks at amplitude, then fades.
function startPulse(pulse, amplitude, riseSeconds, decaySeconds) {
    const peakSeconds = (Math.log(decaySeconds / riseSeconds) * decaySeconds * riseSeconds) / (decaySeconds - riseSeconds);
    const peak = Math.exp(-peakSeconds / decaySeconds) - Math.exp(-peakSeconds / riseSeconds);
    pulse.amplitude = amplitude / peak;
    pulse.slow = 1;
    pulse.fast = 1;
    pulse.slowDecay = Math.exp(-SECONDS_PER_SAMPLE / decaySeconds);
    pulse.fastDecay = Math.exp(-SECONDS_PER_SAMPLE / riseSeconds);
}

function stepPulse(pulse) {
    pulse.slow *= pulse.slowDecay;
    pulse.fast *= pulse.fastDecay;
    return pulse.amplitude * (pulse.slow - pulse.fast);
}

// RBJ cookbook biquads.
function createBiquad(type, frequency, quality) {
    const omega = (2 * Math.PI * frequency) / sampleRate;
    const alpha = Math.sin(omega) / (2 * quality);
    const cosine = Math.cos(omega);
    const norm = 1 + alpha;
    const low = (1 - cosine) / 2;
    const feedforward = type === "lowpass" ? [low, 1 - cosine, low] : [alpha, 0, -alpha];
    return {
        b0: feedforward[0] / norm,
        b1: feedforward[1] / norm,
        b2: feedforward[2] / norm,
        a1: (-2 * cosine) / norm,
        a2: (1 - alpha) / norm,
        x1: 0,
        x2: 0,
        y1: 0,
        y2: 0,
    };
}

function stepBiquad(filter, input) {
    const output = filter.b0 * input + filter.b1 * filter.x1 + filter.b2 * filter.x2 - filter.a1 * filter.y1 - filter.a2 * filter.y2;
    filter.x2 = filter.x1;
    filter.x1 = input;
    filter.y2 = filter.y1;
    filter.y1 = output;
    return output;
}

function freshChargeShare(manifold) {
    const residual = RESIDUAL_AT_ONE_BAR * (EXHAUST_BACK_PRESSURE_BAR / manifold) ** (1 / POLYTROPIC_EXPONENT);
    return (1 - residual) / FRESH_AT_ONE_BAR;
}

function heatKeptShare(manifold) {
    return (1 - HEAT_LOSS_AT_ONE_BAR / manifold) / (1 - HEAT_LOSS_AT_ONE_BAR);
}

function createCylinder(step, headerSpread, crank, trapped) {
    const phase = wrapDegrees(crank - step * DEGREES_PER_STEP);
    return {
        step,
        topDeadCentre: step * DEGREES_PER_STEP,
        balance: CYLINDER_BALANCE[step],
        headerMeters: HEADER_BASE_METERS + headerSpread * HEADER_OFFSETS[step],
        trapped,
        burn: 0,
        torqueShare: 1,
        pop: false,
        phase,
        exhaustPhase: phase,
        intakePhase: phase,
        exhaust: createPulse(),
        intake: createPulse(),
    };
}

class EngineProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.seed = 22222;
        this.cylinders = [];
        this.litres = 0;
        this.inertia = FLYWHEEL_KG_M2;
        this.crank = 0;
        this.omega = 0;
        this.smoothRpm = 0;
        this.previousSmoothRpm = 0;
        this.manifold = 1;
        this.effectivePressure = 1;
        this.idleAir = IDLE_AIR_BASE;
        this.idleIntegral = 0;
        this.governingIdle = false;
        this.throttle = 0;
        this.brake = 0;
        this.gear = 0;
        this.shiftSeconds = 0;
        this.clutchCapacity = 0;
        this.clutchLocked = false;
        this.speed = 0;
        this.ignition = false;
        this.starter = false;
        this.starterSeconds = 0;
        this.crankedDegrees = 0;
        this.runSeconds = 0;
        this.limiterCut = false;
        this.overrunCut = false;
        this.overrunSeconds = 0;
        this.headerSpread = 0.1;
        this.airNoise = 1;
        this.derivativeMix = 0.01;
        this.blocks = 0;
        this.resetVoice();
        this.port.onmessage = this.receive.bind(this);
    }

    resetVoice() {
        this.exhaustPressure = 0;
        this.intakePressure = 0;
        this.previousIntake = 0;
        this.jitterHistory = new Float32Array(JITTER_HISTORY);
        this.jitterOffset = 0;
        this.jitterNoise = 0;
        this.dcLevel = 0;
        this.previousJittered = 0;
        this.peak = 0;
        this.levelGain = LEVEL_MAX_GAIN;
        this.displacementLevel = 0;
        this.hissLevel = 0;
        this.roadLevel = 0;
        this.starterPhase = 0;
        this.crackle = 0;
        this.popPulse = createPulse();
        this.valveExcitation = 0;
        this.knockExcitation = 0;
        this.thudExcitation = 0;
        this.inputFilter = createBiquad("lowpass", INPUT_CUTOFF_HZ, Math.SQRT1_2);
        this.airNoiseFilter = createBiquad("lowpass", 2000, Math.SQRT1_2);
        this.valveResonator = createBiquad("bandpass", 3200, 30);
        this.knockResonator = createBiquad("bandpass", 1700, 8);
        this.thudResonator = createBiquad("bandpass", 95, 15);
        this.airboxFilter = createBiquad("bandpass", 140, 2);
        this.hissFilter = createBiquad("bandpass", 3500, 0.7);
        this.roadFilter = createBiquad("bandpass", 500, 0.4);
    }

    receive(event) {
        const message = event.data;
        if (message.seed) this.seed = message.seed;
        if (message.exhaust) this.setExhaust(message.exhaust);
        if (message.pattern) this.setPattern(message.pattern);
        if (message.start) this.startCranking();
        if (message.stop) this.switchOff();
        if (message.throttle !== undefined) this.throttle = clamp(message.throttle, 0, 1);
        if (message.brake !== undefined) this.brake = clamp(message.brake, 0, 1);
        if (message.gear !== undefined) this.changeGear(message.gear);
    }

    setExhaust(exhaust) {
        this.headerSpread = exhaust.headerSpread;
        this.airNoise = exhaust.airNoise;
        this.derivativeMix = exhaust.derivativeMix;
        for (const cylinder of this.cylinders) {
            cylinder.headerMeters = HEADER_BASE_METERS + this.headerSpread * HEADER_OFFSETS[cylinder.step];
        }
    }

    setPattern(pattern) {
        const kept = [];
        for (let step = 0; step < STEPS_PER_CYCLE; step += 1) {
            if (!pattern[step]) continue;
            kept.push(this.findCylinder(step) ?? createCylinder(step, this.headerSpread, this.crank, this.effectivePressure));
        }
        this.cylinders = kept;
        this.litres = kept.length * CYLINDER_LITRES;
        this.inertia = FLYWHEEL_KG_M2 + KG_M2_PER_CYLINDER * kept.length;
    }

    findCylinder(step) {
        for (const cylinder of this.cylinders) {
            if (cylinder.step === step) return cylinder;
        }
        return null;
    }

    startCranking() {
        if (this.ignition) return;
        this.ignition = true;
        this.starter = true;
        this.starterSeconds = 0;
        this.crankedDegrees = 0;
        this.thudExcitation += THUD_LEVEL;
    }

    switchOff() {
        this.ignition = false;
        this.starter = false;
    }

    changeGear(gear) {
        if (gear === this.gear) return;
        this.gear = gear;
        this.shiftSeconds = SHIFT_SECONDS;
    }

    random() {
        let state = this.seed;
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        this.seed = state >>> 0;
        return this.seed / 4294967296;
    }

    gaussian() {
        return Math.sqrt(-2 * Math.log(1 - this.random())) * Math.cos(2 * Math.PI * this.random());
    }

    process(inputs, outputs) {
        const exhaustOut = outputs[0][0];
        const bayOut = outputs[1][0];
        this.updateControls();
        for (let frame = 0; frame < exhaustOut.length; frame += 1) {
            this.exhaustPressure = stepPulse(this.popPulse);
            this.intakePressure = 0;
            this.advance();
            this.crackle *= CRACKLE_DECAY;
            const exhaust = this.exhaustSample(this.exhaustPressure) + this.crackle * (this.random() - 0.5) * CRACKLE_LEVEL;
            const bay = this.baySample();
            this.trackLevel(exhaust);
            exhaustOut[frame] = exhaust * this.levelGain;
            bayOut[frame] = bay * BAY_GAIN;
        }
        this.blocks += 1;
        if (this.blocks % REPORT_EVERY_BLOCKS === 0) this.report();
        return true;
    }

    report() {
        this.port.postMessage({
            rpm: this.omega * RPM_PER_RADIAN_PER_SECOND,
            kmh: this.speed * KMH_PER_METER_PER_SECOND,
            crank: this.crank,
            ignition: this.ignition,
            starter: this.starter,
            gear: this.gear,
            limiter: this.limiterCut,
            manifold: this.manifold,
            clutch: this.clutchCapacity,
        });
    }

    updateControls() {
        const rpm = this.omega * RPM_PER_RADIAN_PER_SECOND;
        this.smoothRpm += (rpm - this.smoothRpm) * RPM_SMOOTHING;
        this.updateStarter();
        this.updateCuts(rpm);
        this.updateIdleAir();
        const throttle = this.drivenThrottle();
        const area = throttle * throttle + this.idleAir;
        const demand = AIR_DEMAND_PER_RPM * Math.max(0, this.smoothRpm);
        const target = clamp(area / (area + demand), MINIMUM_MANIFOLD_BAR, 1);
        this.manifold += (target - this.manifold) * MANIFOLD_SMOOTHING;
        this.effectivePressure = this.manifold * volumetricEfficiency(this.smoothRpm);
        this.updateClutch();
        this.shiftSeconds = Math.max(0, this.shiftSeconds - BLOCK_SECONDS);
        const revs = Math.max(0, this.smoothRpm) / 3000;
        const airflow = this.manifold * revs;
        this.displacementLevel = 0.03 * revs * revs * (0.3 + this.manifold);
        this.hissLevel = HISS_LEVEL * airflow * (1 - this.manifold);
        this.roadLevel = ROAD_LEVEL * Math.min(1, this.speed / 25) ** 1.5 + WIND_LEVEL * Math.min(2, (this.speed / 40) ** 3);
    }

    updateStarter() {
        if (!this.starter) return;
        this.starterSeconds += BLOCK_SECONDS;
        if (this.smoothRpm > STARTER_RELEASE_RPM) {
            this.starter = false;
            this.runSeconds = 0;
            this.valveExcitation += ZING_LEVEL;
        } else if (this.starterSeconds > STARTER_GIVE_UP_SECONDS) {
            this.switchOff();
        }
    }

    updateCuts(rpm) {
        if (rpm > LIMITER_CUT_RPM) this.limiterCut = true;
        if (rpm < LIMITER_RESUME_RPM) this.limiterCut = false;
        const lifted = this.throttle < LIFTED_THROTTLE;
        if (lifted && this.ignition && !this.starter && this.smoothRpm > OVERRUN_CUT_RPM) this.overrunCut = true;
        if (!lifted || this.smoothRpm < OVERRUN_RESUME_RPM) this.overrunCut = false;
        this.overrunSeconds = this.overrunCut ? this.overrunSeconds + BLOCK_SECONDS : 0;
        if (this.ignition && !this.starter && this.smoothRpm < STALL_RPM) this.switchOff();
    }

    updateIdleAir() {
        this.runSeconds += BLOCK_SECONDS;
        const rpmRate = (this.smoothRpm - this.previousSmoothRpm) / BLOCK_SECONDS;
        this.previousSmoothRpm = this.smoothRpm;
        const governing = this.ignition && !this.starter && !this.overrunCut && this.throttle < LIFTED_THROTTLE;
        this.governingIdle = governing;
        if (!governing) {
            this.idleIntegral *= 0.98;
            this.idleAir = IDLE_AIR_BASE;
            return;
        }
        const target = IDLE_RPM + START_FLARE_RPM * Math.exp(-this.runSeconds / START_FLARE_SECONDS);
        const error = target - this.smoothRpm;
        this.idleIntegral = clamp(this.idleIntegral + IDLE_INTEGRAL_GAIN * error * BLOCK_SECONDS, -IDLE_AIR_BASE, IDLE_AIR_MAX);
        this.idleAir = clamp(IDLE_AIR_BASE + IDLE_GAIN * error - IDLE_DERIVATIVE_GAIN * rpmRate + this.idleIntegral, 0, IDLE_AIR_MAX);
    }

    drivenThrottle() {
        if (this.shiftSeconds <= 0) return this.throttle;
        const gearboxOmega = (this.speed / WHEEL_RADIUS_METERS) * GEAR_RATIOS[this.gear] * FINAL_DRIVE;
        return this.omega < gearboxOmega ? REV_MATCH_THROTTLE : 0;
    }

    updateClutch() {
        if (GEAR_RATIOS[this.gear] === 0 || this.shiftSeconds > 0 || this.smoothRpm < CLUTCH_RELEASE_RPM) {
            this.clutchLocked = false;
            this.clutchCapacity = 0;
            return;
        }
        const gearboxOmega = (this.speed / WHEEL_RADIUS_METERS) * GEAR_RATIOS[this.gear] * FINAL_DRIVE;
        if (Math.abs(this.omega - gearboxOmega) < CLUTCH_SLIP_RADIANS_PER_SECOND) this.clutchLocked = true;
        const full = CLUTCH_NEWTON_METERS_PER_CYLINDER * Math.max(1, this.cylinders.length);
        const bite = smoothstep((this.smoothRpm - CLUTCH_BITE_RPM) / (CLUTCH_FULL_RPM - CLUTCH_BITE_RPM));
        this.clutchCapacity = this.clutchLocked ? full : bite * bite * full;
    }

    advance() {
        const rpm = this.omega * RPM_PER_RADIAN_PER_SECOND;
        const degreesPerSecond = Math.max(600, this.omega * DEGREES_PER_RADIAN);
        let torque = this.starterTorque(rpm) - this.frictionTorque(rpm);
        for (const cylinder of this.cylinders) torque += this.runCylinder(cylinder, rpm, degreesPerSecond);
        const gearboxOmega = (this.speed / WHEEL_RADIUS_METERS) * GEAR_RATIOS[this.gear] * FINAL_DRIVE;
        const clutch = this.clutchCapacity * Math.tanh((this.omega - gearboxOmega) / CLUTCH_SLIP_RADIANS_PER_SECOND);
        this.omega += ((torque - clutch) / this.inertia) * SECONDS_PER_SAMPLE;
        if (this.isHeldStill(torque - clutch)) this.omega = 0;
        const turned = this.omega * SECONDS_PER_SAMPLE * DEGREES_PER_RADIAN;
        this.crank = wrapDegrees(this.crank + turned);
        if (this.ignition) this.crankedDegrees += turned;
        this.moveCar(clutch);
    }

    isHeldStill(torque) {
        if (this.starter || Math.abs(this.omega) > HOLD_RADIANS_PER_SECOND) return false;
        const staticFriction = (FRICTION_AT_REST_BAR * PASCALS_PER_BAR * this.litres) / 1000 / (4 * Math.PI) + BASE_FRICTION_NEWTON_METERS;
        return Math.abs(torque) < staticFriction * STATIC_FRICTION_SHARE;
    }

    starterTorque(rpm) {
        if (!this.starter) return 0;
        return STARTER_NEWTON_METERS_PER_LITRE * Math.max(1, this.litres) * Math.max(0, 1 - rpm / STARTER_FREE_RPM);
    }

    // Friction mean effective pressure in bar, rising with speed, applied against the turning direction.
    frictionTorque(rpm) {
        const thousands = Math.abs(rpm) / 1000;
        const frictionBar = FRICTION_AT_REST_BAR + FRICTION_PER_THOUSAND_RPM * thousands + FRICTION_PER_THOUSAND_RPM_SQUARED * thousands * thousands;
        const cylinderFriction = (frictionBar * PASCALS_PER_BAR * this.litres) / 1000 / (4 * Math.PI);
        return (cylinderFriction + BASE_FRICTION_NEWTON_METERS) * Math.tanh(this.omega);
    }

    moveCar(clutchTorque) {
        const ratio = GEAR_RATIOS[this.gear] * FINAL_DRIVE;
        const drive = (clutchTorque * ratio * DRIVETRAIN_EFFICIENCY) / WHEEL_RADIUS_METERS;
        const resistance = (ROLLING_RESISTANCE * CAR_KG * GRAVITY + this.brake * BRAKE_NEWTONS) * Math.tanh(this.speed / 0.3);
        const drag = 0.5 * AIR_KG_PER_CUBIC_METER * DRAG_AREA_SQUARE_METERS * this.speed * this.speed;
        this.speed = Math.max(0, this.speed + ((drive - resistance - drag) / CAR_KG) * SECONDS_PER_SAMPLE);
    }

    runCylinder(cylinder, rpm, degreesPerSecond) {
        const phase = wrapDegrees(this.crank - cylinder.topDeadCentre);
        const exhaustPhase = wrapDegrees(phase - (degreesPerSecond * cylinder.headerMeters) / EXHAUST_SOUND_METERS_PER_SECOND);
        const intakePhase = wrapDegrees(phase - (degreesPerSecond * INTAKE_RUNNER_METERS) / INTAKE_SOUND_METERS_PER_SECOND);
        if ((phase | 0) !== (cylinder.phase | 0)) this.cylinderEvents(cylinder, cylinder.phase, phase, rpm);
        if (crossed(cylinder.exhaustPhase, exhaustPhase, EXHAUST_OPENS)) this.openExhaust(cylinder, degreesPerSecond);
        if (crossed(cylinder.intakePhase, intakePhase, INTAKE_OPENS)) this.openIntake(degreesPerSecond, cylinder);
        cylinder.phase = phase;
        cylinder.exhaustPhase = exhaustPhase;
        cylinder.intakePhase = intakePhase;
        this.exhaustPressure += stepPulse(cylinder.exhaust) + DISPLACEMENT_SHAPE[exhaustPhase | 0] * this.displacementLevel;
        this.intakePressure += stepPulse(cylinder.intake);
        const index = phase | 0;
        const fraction = phase - index;
        const closed = CLOSED_LEVER[index] + (CLOSED_LEVER[index + 1] - CLOSED_LEVER[index]) * fraction;
        const intake = INTAKE_LEVER[index] + (INTAKE_LEVER[index + 1] - INTAKE_LEVER[index]) * fraction;
        const fixed = FIXED_LEVER[index] + (FIXED_LEVER[index + 1] - FIXED_LEVER[index]) * fraction;
        const burn = BURN_LEVER[index] + (BURN_LEVER[index + 1] - BURN_LEVER[index]) * fraction;
        return cylinder.trapped * (closed + BURN_PRESSURE_RISE * cylinder.burn * cylinder.torqueShare * burn) + this.manifold * intake + fixed;
    }

    cylinderEvents(cylinder, previous, phase, rpm) {
        if (crossed(previous, phase, INTAKE_CLOSES)) this.closeIntake(cylinder);
        if (crossed(previous, phase, PEAK_PRESSURE)) {
            this.knockExcitation += KNOCK_LEVEL * cylinder.burn * Math.sqrt(cylinder.trapped) * (0.7 + 0.6 * this.random());
        }
        if (crossed(previous, phase, EXHAUST_OPENS) || crossed(previous, phase, INTAKE_OPENS)) {
            this.valveExcitation += VALVE_TICK_LEVEL * (0.4 + Math.abs(rpm) / 5000) * (0.7 + 0.6 * this.random());
        }
    }

    closeIntake(cylinder) {
        cylinder.trapped = this.effectivePressure;
        cylinder.burn = this.decideBurn(cylinder);
        cylinder.torqueShare = this.governingIdle ? IDLE_SPARK_TORQUE_SHARE : 1;
    }

    decideBurn(cylinder) {
        cylinder.pop = false;
        if (!this.ignition || this.crankedDegrees < PRIME_DEGREES) return 0;
        if (this.limiterCut || this.overrunCut) {
            cylinder.pop = this.random() < this.popChance();
            return 0;
        }
        if (this.random() < this.misfireChance(cylinder)) return 0;
        const spread = 0.03 + 0.07 * (1 - Math.min(1, cylinder.trapped));
        const efficiency = freshChargeShare(this.manifold) * heatKeptShare(this.manifold);
        return Math.max(0.2, cylinder.balance * efficiency * (1 + spread * this.gaussian()));
    }

    popChance() {
        if (this.limiterCut) return 0.3;
        if (this.smoothRpm < 2500) return 0;
        return 0.2 * Math.max(0, 1 - this.overrunSeconds / POP_SECONDS);
    }

    misfireChance(cylinder) {
        if (this.crankedDegrees < STUMBLE_DEGREES) return 0.35;
        if (cylinder.trapped < 0.4) return 0.003;
        return 0.0003;
    }

    openExhaust(cylinder, degreesPerSecond) {
        const opening = cylinder.trapped * MOTORING_AT_EXHAUST_OPENS * (1 + BURN_PRESSURE_RISE * cylinder.burn);
        const excess = opening - EXHAUST_BACK_PRESSURE_BAR;
        const pushed = excess < 0 ? excess * 0.5 : excess;
        const runner = pushed / (1 + Math.abs(pushed) * 0.35);
        startPulse(cylinder.exhaust, runner, 0.00012 + 6 / degreesPerSecond, 0.0009 + 22 / degreesPerSecond);
        if (!cylinder.pop) return;
        startPulse(this.popPulse, POP_BAR * (0.6 + 0.8 * this.random()), 0.00005, 0.0025);
        this.crackle = 1;
    }

    // 18,000 degrees a second = 3000 RPM.
    openIntake(degreesPerSecond, cylinder) {
        const flow = this.manifold * Math.min(1.5, degreesPerSecond / 18000);
        startPulse(cylinder.intake, -INTAKE_PULSE_BAR * flow, 25 / degreesPerSecond, 70 / degreesPerSecond);
    }

    exhaustSample(pressure) {
        this.jitterHistory[this.jitterOffset] = stepBiquad(this.inputFilter, pressure);
        this.jitterOffset = (this.jitterOffset + 1) % JITTER_HISTORY;
        this.jitterNoise += (this.random() * (JITTER_HISTORY - 1) * JITTER_SCALE - this.jitterNoise) * JITTER_SMOOTHING;
        const whole = this.jitterNoise | 0;
        const fraction = this.jitterNoise - whole;
        const first = this.jitterHistory[(this.jitterOffset + whole) % JITTER_HISTORY];
        const second = this.jitterHistory[(this.jitterOffset + whole + 1) % JITTER_HISTORY];
        const jittered = first + (second - first) * fraction;
        this.dcLevel += (jittered - this.dcLevel) * DC_SMOOTHING;
        const centred = jittered - this.dcLevel;
        const derivative = (jittered - this.previousJittered) * sampleRate;
        this.previousJittered = jittered;
        const air = stepBiquad(this.airNoiseFilter, this.random() * 2 - 1);
        const airMixed = this.airNoise * air + (1 - this.airNoise);
        return derivative * this.derivativeMix + centred * airMixed * (1 - this.derivativeMix);
    }

    baySample() {
        const valves = stepBiquad(this.valveResonator, this.valveExcitation);
        const knock = stepBiquad(this.knockResonator, this.knockExcitation);
        const thud = stepBiquad(this.thudResonator, this.thudExcitation);
        this.valveExcitation = 0;
        this.knockExcitation = 0;
        this.thudExcitation = 0;
        const intakeDerivative = (this.intakePressure - this.previousIntake) * sampleRate;
        this.previousIntake = this.intakePressure;
        const intake = stepBiquad(this.airboxFilter, intakeDerivative) * AIRBOX_LEVEL + intakeDerivative * SNORKEL_LEVEL;
        const hiss = stepBiquad(this.hissFilter, this.random() * 2 - 1) * this.hissLevel;
        const road = stepBiquad(this.roadFilter, this.random() * 2 - 1) * this.roadLevel;
        return valves + knock + thud + intake + hiss + road + this.starterSample();
    }

    // The starter whines at its commutator rate, which follows the crank and sags on each compression.
    starterSample() {
        if (!this.starter) return 0;
        const rpm = Math.max(0, this.omega * RPM_PER_RADIAN_PER_SECOND);
        this.starterPhase = (this.starterPhase + (rpm * STARTER_GEAR_RATIO) / 60 / sampleRate) % 1;
        const angle = this.starterPhase * 2 * Math.PI;
        const labour = 0.4 + 0.6 * Math.max(0, 1 - rpm / STARTER_FREE_RPM);
        const whine = Math.sin(angle * STARTER_COMMUTATOR_BARS) * 0.5 + Math.sin(angle) * 0.35 + (this.random() - 0.5) * 0.25;
        return whine * labour * STARTER_LEVEL;
    }

    trackLevel(exhaust) {
        this.peak = Math.max(Math.abs(exhaust), this.peak * PEAK_RELEASE);
        const wanted = clamp(LEVEL_TARGET / (this.peak + 1e-9), LEVEL_MIN_GAIN, LEVEL_MAX_GAIN);
        this.levelGain = Math.min(wanted, this.levelGain + (wanted - this.levelGain) * GAIN_SMOOTHING);
    }
}

registerProcessor("engine", EngineProcessor);
