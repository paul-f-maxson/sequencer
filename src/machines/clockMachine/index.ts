import {
  Machine,
  MachineConfig,
  InvokeCreator,
  sendParent,
  ActionFunction,
  forwardTo,
} from "xstate";

// CLOCK CONTEXT DEFINITION

export interface ClockContext {
  tempoSetting: number; // positive integer, usually not above 200, that represents the number of quarter notes (beats) the sequencer should play per minute
  // tempoSetting will be ignored when running external clock
  swingAmount: number; // 0 to 1 - represents the amount that offbeats should be offset
  // Values should be floored and ceilinged to fit.
}

const defaultClockContext: ClockContext = {
  tempoSetting: 120,
  swingAmount: 0.5,
};

// STATE SCHEMA DEFINITION

interface ClockStateSchema {
  states: {
    internal: {};
    external: {};
  };
}

// EVENT DEFINITIONS
export type ClockEvent =
  | { type: "CHNG_SRC_EXT"; data: undefined }
  | { type: "CHNG_SRC_INT"; data: undefined }
  | { type: "CHNG_TEMPO"; data: ClockContext["tempoSetting"] }
  | { type: "CHNG_SWING"; data: ClockContext["swingAmount"] }
  | { type: "PULSE"; data: undefined };

// ACTIONS
const actions: Record<string, ActionFunction<ClockContext, ClockEvent>> = {};

// TODO: implement swing
// TODO: implement correction for interval drift
const makeInternalClock: InvokeCreator<ClockContext, ClockEvent> = (ctx) => (
  callback,
  onReceive
) => {
  let id: ReturnType<typeof setInterval>;
  let cleanup: Function;

  // Sets an interval that sends the 'PULSE' event to the parent every 64th note
  const setClock = (bpm: number) => {
    const correctionAmount = 1.419;
    // const correctionFactor = 0.8103; // amount to correct for timing errors by
    const msPerBeat: number = (60 * 1000) / bpm / 64 - correctionAmount; // conversion from bpm to milliseconds interval
    // e.g. 120 bt per min => 7.8125 ms per 64th note

    clearInterval(id);

    id = setInterval(() => {
      callback("PULSE");
    }, msPerBeat);

    cleanup = () => clearInterval(id);
  };

  // Set the clock initially
  setClock(ctx.tempoSetting);

  // If the clock is asked to change tempo, set the clock
  onReceive((evt: ClockEvent) => setClock(evt.data));

  return cleanup;
};

// TODO: implement external clock
// SERVICES
const services = {
  makeInternalClock,
};

// MACHINE DEFINITION
const clockMachineConfig: MachineConfig<
  ClockContext,
  ClockStateSchema,
  ClockEvent
> = {
  id: "clock",
  initial: "internal",
  on: { PULSE: { actions: sendParent("PULSE") } },
  states: {
    internal: {
      invoke: { id: "internalClock", src: "makeInternalClock" },
      on: {
        CHNG_SRC_EXT: "external",
        CHNG_TEMPO: { actions: forwardTo("internalClock") },
      },
    },

    external: {
      on: { CHNG_SRC_INT: "internal" },
    },
  },
};

/** A machine that sends a "PULSE" event to the parent every 64th note */
const clockMachine = Machine(
  clockMachineConfig,
  { actions, services },
  defaultClockContext
);

export default clockMachine;
