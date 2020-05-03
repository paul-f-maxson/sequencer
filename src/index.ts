import {
  Machine,
  Interpreter,
  spawn,
  MachineConfig,
  MachineOptions,
  assign,
} from "xstate";
import { v5 as uuid } from "uuid";
import { Clock } from "xstate/lib/interpreter";

// CONTEXT DEFINITIONS

type SequencerStep = {
  // prettier-ignore
  noteValue: 
  // 1 to 127 - MIDI note value
    1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 
    | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31 | 32 
    | 33 | 34 | 35 | 36 | 37 | 38 | 39 | 40 | 41 | 42 | 43 | 44 | 45 | 46 | 47 
    | 48 | 49 | 50 | 51 | 52 | 53 | 54 | 55 | 56 | 57 | 58 | 59 | 60 | 61 | 62 
    | 63 | 64 | 65 | 66 | 67 | 68 | 69 | 70 | 71 | 72 | 73 | 74 | 75 | 76 | 77 
    | 78 | 79 | 80 | 81 | 82 | 83 | 84 | 85 | 86 | 87 | 88 | 89 | 90 | 91 | 92 
    | 93 | 94 | 95 | 96 | 97 | 98 | 99 | 100 | 101 | 102 | 103 | 104 | 105 
    | 106 | 107 | 108 | 109 | 110 | 111 | 112 | 113 | 114 | 115 | 116 | 117 
    | 118 | 119 | 120 | 121 | 122 | 123 | 124 | 125 | 126 | 127;

  glide: boolean; // Whether to glide INTO the note

  // prettier-ignore
  subdivide: 
  // 1 to 32 - number of beats to subdivide this step into
  1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 
  | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31 | 32;

  start: number; // 0 to 1 - fraction of the full length of the beat at which to start play.
  // Values should be floored and ceilinged to fit.

  end: number; // 0 to 1 - fraction of the full length of the beat at which to end play.
  // Values should be floored and ceilinged to fit.
};

type TimeSignature = {
  top: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12; // Number of beats per measure
  bottom:
    | "whole"
    | "half"
    | "quarter"
    | "eighth"
    | "sixteenth"
    | "thirtysecond"; // What note gets the beat
};

type StepMode = "forward" | "reverse" | "random" | "brownian";

type SequencerConfig = {
  stepMode: StepMode;
  timeSignature: TimeSignature;
};

interface SequencerContext {
  steps: Array<SequencerStep>;
  currentStep: number; // integer representing the current step of the sequence
  clock?: Interpreter<ClockContext, any, ClockEvent, any>; // An actor that sends STEP events to the machine at regular intervals
  config: SequencerConfig;
}

const defaultSequencerConfig: SequencerConfig = {
  stepMode: "forward",
  timeSignature: { top: 4, bottom: "quarter" },
};

const defaultContext: SequencerContext = {
  steps: Array(16).fill({
    noteValue: 64,
    glide: false,
    subdivide: 1,
    start: 0,
    end: 1,
  }),
  currentStep: 0,
  config: defaultSequencerConfig,
};

// CLOCK CONTEXT DEFINTIONS

interface ClockContext {
  tempoSetting: number; // positive integer, usually not above 200, that represents the number of quarter notes (beats) the sequencer should play per minute
  // tempoSetting will be ignored when running external clock
  swingAmount: number; // 0 to 1 - represents the amount that offbeats should be offset
  // Values should be floored and ceilinged to fit.
}

const defaultClockContext: ClockContext = {
  tempoSetting: 120,
  swingAmount: 0.5,
};

// STATE SCHEMA DEFINITIONS

interface SequencerStateSchema {
  states: {
    running: {};
    paused: {};
    stopped: {};
  };
}

// CLOCK STATE SCHEMA

interface ClockStateSchema {
  states: {
    internal: {};
    external: {};
  };
}

// EVENT DEFINITIONS

type ClockEvent =
  | { type: "GOTO_EXT_CLK" }
  | { type: "GOTO_INT_CLK" }
  | { type: "CHANGE_TEMPO"; data: ClockContext["tempoSetting"] }
  | { type: "CHANGE_SWING"; data: ClockContext["swingAmount"] };

type SequencerConfigEvent =
  | {
      type: "CHANGE_STEPMODE";
      data: StepMode;
    }
  | { type: "CHANGE_TIMESIGNATURE_TOP"; data: TimeSignature["top"] }
  | { type: "CHANGE_TIMESIGNATURE_BOTTOM"; data: TimeSignature["bottom"] };

type SequencerEvent =
  | { type: "MODIFY_STEP" }
  | { type: "STEP" }
  | { type: "RUN" }
  | { type: "STOP" }
  | { type: "PAUSE" }
  | SequencerConfigEvent
  | ClockEvent;

// MACHINE CONFIG DEFINITIONS

const clockMachineConfig: MachineConfig<
  ClockContext,
  ClockStateSchema,
  ClockEvent
> = {
  id: "clock",
  initial: "internal",
  states: {
    internal: {
      entry: "startInternalClock", // TODO: define
      exit: "stopInternalClock", // TODO: define
    },
    external: {},
  },
};

const clockMachine = Machine(clockMachineConfig);

const sequencerMachineOptions: Partial<MachineOptions<
  SequencerContext,
  SequencerConfigEvent
>> = {
  actions: {
    spawnClock: assign<SequencerContext, SequencerEvent>({
      clock: spawn(clockMachine),
    }),
  },
};

const sequencerMachineConfig: MachineConfig<
  SequencerContext,
  SequencerStateSchema,
  SequencerEvent
> = {
  entry: "spawnClock", // TODO: Define
  id: "sequencer",
  initial: "stopped",
  states: {
    running: {
      id: "running",
      on: {
        PAUSE: "paused",
        STOP: "stopped",
      },
    },
    paused: {
      id: "paused",
      on: {
        RUN: "running",
        STOP: "stopped",
        STEP: [
          "playCurrentStep", // TODO: Define
          "advanceToNextStep", // TODO: Define
        ],
      },
    },
    stopped: {
      entry: "resetCurrentStep", // TODO: Define
      id: "stopped",
      on: {
        RUN: "running",
        PAUSE: "paused",
      },
    },
  },
};

const sequencerMachine = Machine(
  sequencerMachineConfig,
  sequencerMachineOptions
);
export default sequencerMachine;
