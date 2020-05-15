import {
  Machine,
  MachineConfig,
  sendParent,
  spawn,
  assign,
  MachineOptions,
  Actor,
  InvokeCallback,
} from 'xstate';

import { makeInternalClock } from './internalClock';
import { log, send } from 'xstate/lib/actions';

// CLOCK CONTEXT DEFINITION

export interface ClockContext {
  tempoSetting: number; // positive integer, usually not above 200, that represents the number of quarter notes (beats) the sequencer should play per minute
  // tempoSetting will be ignored when running external clock
  swingAmount: number; // 0 to 1 - represents the amount that offbeats should be offset
  // Values should be floored and ceilinged to fit.
  internalClock?: Actor<ClockContext, ClockEvent>;
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
  | { type: 'CHNG_SRC_EXT'; data: undefined }
  | { type: 'CHNG_SRC_INT'; data: undefined }
  | { type: 'CHNG_TEMPO'; data: ClockContext['tempoSetting'] }
  | { type: 'CHNG_SWING'; data: ClockContext['swingAmount'] }
  | { type: 'PULSE'; data: undefined };

// MACHINE OPTIONS

const clockMachineDefaultOptions: Partial<MachineOptions<
  ClockContext,
  ClockEvent
>> = {
  actions: {
    spawnInternalClock: assign<ClockContext, ClockEvent>({
      internalClock: (ctx, evt) =>
        spawn(makeInternalClock(ctx, evt) as InvokeCallback, {
          name: 'internalClock',
          autoForward: true,
        }),
    }),
    updateTempo: assign<ClockContext, ClockEvent>({
      tempoSetting: (_, evt) => evt.data,
    }),
    log: log((_, evt) => evt, 'clock machine'),
  },
};

// MACHINE DEFINITION
const clockMachineConfig: MachineConfig<
  ClockContext,
  ClockStateSchema,
  ClockEvent
> = {
  id: 'clock',
  initial: 'internal',
  on: {
    PULSE: { actions: [sendParent('PULSE'), 'log'] },
    CHNG_TEMPO: {
      actions: ['updateTempo', 'forwardToInternalClock'],
    },
  },
  states: {
    internal: {
      id: 'internal',
      entry: ['spawnInternalClock', 'log'],
      on: {
        CHNG_SRC_EXT: 'external',
      },
    },

    external: {
      id: 'external',
      on: { CHNG_SRC_INT: 'internal' },
    },
  },
};

/** A machine that sends a "PULSE" event to the parent every 64th note */
const clockMachine = Machine(
  clockMachineConfig,
  clockMachineDefaultOptions,
  defaultClockContext
);

export default clockMachine;
