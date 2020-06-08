const midi = require('midi');

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
import { log } from 'xstate/lib/actions';
import makeMidiInputAdaptor from '../midiInputAdaptorCallback';

// UTILS
const makeMidiInput = (name: string) => {
  const input = new midi.Input();
  input.ignoreTypes(true, false, true);
  input.openVirtualPort(name);
  return input;
};

const midiMessages = {
  start: [250],
  stop: [252],
  continue: [251],
  pulse: [248],
};

// CLOCK CONTEXT DEFINITION

export const machineDefaultContext = {
  tempoSetting: 120, // positive integer, usually not above 200, that represents the number of quarter notes (beats) the sequencer should play per minute
  // tempoSetting will be ignored when running external clock

  swingAmount: 0.5, // 0 to 1 - represents the amount that offbeats should be offset
  // Values should be floored and ceilinged to fit.

  internalClockRef: undefined as Actor<
    { tempoSetting: number; swingAmount: number },
    MachineEvent | undefined
  >,

  midiInputAdaptorRef: undefined as Actor,

  midiInput: makeMidiInput('squ-clock-in'),
};

export type MachineContext = typeof machineDefaultContext;

// STATE SCHEMA DEFINITION

interface MachineStateSchema {
  states: {
    idle: {};
    running: {};
    stopped: {};
    error: {};
  };
}

// EVENT DEFINITIONS
type MidiClockEvent =
  | { type: 'PULSE' }
  | { type: 'STOP' }
  | { type: 'START' }
  | { type: 'CONTINUE' }
  | { type: 'MIDI_INPUT_READY' }
  | { type: 'MIDI_INPUT_ERROR'; data: Error };

export type MachineEvent =
  | { type: 'CHNG_SRC_EXT' }
  | { type: 'CHNG_SRC_INT' }
  | { type: 'CHNG_TEMPO'; data: MachineContext['tempoSetting'] }
  | { type: 'CHNG_SWING'; data: MachineContext['swingAmount'] }
  | { type: 'PULSE' }
  | { type: 'READY' }
  | MidiClockEvent;

// MACHINE OPTIONS

export const machineDefaultOptions: Partial<MachineOptions<
  MachineContext,
  MachineEvent
>> = {
  actions: {
    // BUG: current implementation is crap. DO NOT USE
    spawnInternalClock: assign<MachineContext, MachineEvent>({
      internalClockRef: (ctx, evt) =>
        spawn(makeInternalClock(ctx, evt) as InvokeCallback, {
          name: 'internalClock',
        }),
    }),

    spawnExternalClock: assign<MachineContext, MachineEvent>({
      midiInputAdaptorRef: (ctx) =>
        spawn(
          makeMidiInputAdaptor<MachineEvent>(
            ctx.midiInput,
            new Map([
              [
                midiMessages.start[0],
                () => ({ type: 'START' } as MachineEvent),
              ],
              [
                midiMessages.stop[0],
                () => ({ type: 'STOP' } as MachineEvent),
              ],
              [
                midiMessages.continue[0],
                () => ({ type: 'CONTINUE' } as MachineEvent),
              ],
              [
                midiMessages.pulse[0],
                () => ({ type: 'PULSE' } as MachineEvent),
              ],
            ]),
            (e) => ({ type: 'MIDI_INPUT_ERROR', data: e }),
            { type: 'MIDI_INPUT_READY' }
          ),

          'midi-ext-clock-in'
        ),
    }),

    updateTempo: assign<MachineContext, MachineEvent>({
      // for a to-be-implemented internal clock
      tempoSetting: (
        _,
        evt: Extract<MachineEvent, { type: 'CHNG_TEMPO' }>
      ) => evt.data,
    }),

    sendParentPulse: sendParent('PULSE'),

    sendParentReset: sendParent('RESET'),

    sendParentReady: sendParent('READY'),

    sendParentError: sendParent(
      (_: MachineContext, evt: MachineEvent) => ({
        ...evt,
        type: 'CLOCK_ERROR',
      })
    ),

    logEvent: log((_, evt) => evt, 'clock controller'),
  },
};

// MACHINE DEFINITION
const machineConfig: MachineConfig<
  MachineContext,
  MachineStateSchema,
  MachineEvent
> = {
  id: 'clock',
  initial: 'idle',
  entry: ['spawnExternalClock'],

  // STATES
  states: {
    idle: {
      // EVENTS
      on: {
        MIDI_INPUT_ERROR: {
          actions: ['logEvent', 'sendParentError'],
          target: 'error',
        },

        MIDI_INPUT_READY: {
          actions: ['logEvent', 'sendParentReady'],
          target: 'stopped',
        },
      },
    },

    error: {
      type: 'final',
    },

    running: {
      id: 'running',

      // EVENTS
      on: {
        PULSE: { actions: ['logEvent', 'sendParentPulse'] },
        STOP: { actions: ['logEvent'], target: 'stopped' },
      },
    },

    stopped: {
      id: 'stopped',

      // EVENTS
      on: {
        START: {
          actions: ['logEvent', 'sendParentReset'],
          target: 'running',
        },

        CONTINUE: {
          actions: ['logEvent'],
          target: 'running',
        },
      },
    },
  },
};

/** A machine that sends and responds to messages according to the midi realtime spec.
 * @description In running state, pulse messages are forwarded to the parent.
 * Stop messages send it to the stopped state.
 *
 * In stopped state, recieved pulse messages will NOT be forwarded to the parent.
 * Continue messages send it back to running.
 * Start messages do the same, but also send a reset message to the parent.
 * As per midi spec, clock rate is 96ppqn
 */
const machine = Machine(
  machineConfig,
  machineDefaultOptions,
  machineDefaultContext
);

export default machine;
