import {
  Machine,
  MachineConfig,
  InvokeCreator,
  sendParent,
  ActionFunction,
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
  | { type: "CHANGE_TEMPO"; data: ClockContext["tempoSetting"] }
  | { type: "CHANGE_SWING"; data: ClockContext["swingAmount"] }
  | { type: "PULSE"; data: undefined };

// ACTIONS
const actions: Record<string, ActionFunction<ClockContext, ClockEvent>> = {
  forwardToParent: (_, e) => sendParent(e),
};

// TODO: implement swing
// TODO: implement correction for interval drift
const makeInternalClock: InvokeCreator<ClockContext, ClockEvent> = (ctx) => (
  callback,
  onReceive
) => {
  let id: number;
  let cleanup: Function;

  // Sets an interval that sends the 'STEP' event to the parent every 64th note
  const setClock = (bpm: number) => {
    const msPerBeat: number = (60 * 1000) / bpm / 64; // conversion from bpm to milliseconds interval
    // e.g. 120 bt per min => 7.8125 ms per 64th note

    clearInterval(id);

    id = setInterval(() => callback("PULSE"), msPerBeat);

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
  on: { PULSE: "forwardToParent" },
  states: {
    internal: {
      invoke: { id: "internalClock", src: "makeInternalClock" },
      on: { CHNG_SRC_EXT: "external" },
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
