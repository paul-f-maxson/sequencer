import {
  Machine,
  MachineConfig,
  sendParent,
  send,
  spawn,
  assign,
  MachineOptions,
  Actor,
  InvokeCallback,
  Interpreter,
  AnyEventObject,
} from 'xstate';
import { log } from 'xstate/lib/actions';

import makeMidiInputAdaptor, {
  MidiInput,
} from '../midiInputAdaptorCallback';
import { makeInternalClock } from './internalClock';
import {
  MachineContext as SequenceControllerContext,
  MachineStateSchema as SequenceControllerStateSchema,
  MachineEvent as SequenceControllerEvent,
} from '../sequenceControllerMachine';

const midiMessages = {
  start: [250],
  stop: [252],
  continue: [251],
  pulse: [248],
};

// CONTEXT

export const machineDefaultContext = {
  tempoSetting: 120, // positive integer, usually not above 200, that represents the number of quarter notes (beats) the sequencer should play per minute
  // tempoSetting will be ignored when running external clock

  swingAmount: 0.5, // 0 to 1 - represents the amount that offbeats should be offset
  // Values should be floored and ceilinged to fit.

  internalClockRef: undefined as Actor<
    { tempoSetting: number; swingAmount: number },
    AnyEventObject
  >,

  midiInputAdaptorRef: undefined as Actor,

  sequenceControllerRef: undefined as Interpreter<
    SequenceControllerContext,
    SequenceControllerStateSchema,
    SequenceControllerEvent
  >,

  midiInput: undefined as MidiInput,
};

export type MachineContext = typeof machineDefaultContext;

// STATE

export interface MachineStateSchema {
  states: {
    idle: {};
    running: {};
    stopped: {};
    error: {};
  };
}

// EVENTS
export const midiInputReadyEvent = () =>
  ({ type: 'MIDI_INPUT_READY' } as const);

export const midiInputErrorEvent = (data: Error) =>
  ({ type: 'MIDI_INPUT_ERROR', data } as const);

type MidiInputEvent =
  | ReturnType<typeof midiInputReadyEvent>
  | ReturnType<typeof midiInputErrorEvent>;

export const pulseEvent = () => ({ type: 'PULSE' } as const);

export const stopEvent = () => ({ type: 'STOP' } as const);

export const startEvent = () => ({ type: 'START' } as const);

export const continueEvent = () =>
  ({ type: 'CONTINUE' } as const);

type ClockEvent =
  | ReturnType<typeof pulseEvent>
  | ReturnType<typeof stopEvent>
  | ReturnType<typeof startEvent>
  | ReturnType<typeof continueEvent>;

export const changeTempoEvent = (
  data: MachineContext['tempoSetting']
) => ({ type: 'CHNG_TEMPO', data } as const);

type ConfigEvent = ReturnType<typeof changeTempoEvent>;

export type MachineEvent =
  | ClockEvent
  | MidiInputEvent
  | ConfigEvent;

// OPTIONS

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

    spawnExternalClockAdaptor: assign<
      MachineContext,
      MachineEvent
    >({
      midiInputAdaptorRef: (ctx) =>
        spawn(
          makeMidiInputAdaptor<MachineEvent>(
            ctx.midiInput,
            new Map<number, () => MachineEvent>([
              [midiMessages.start[0], startEvent],
              [midiMessages.stop[0], stopEvent],
              [midiMessages.continue[0], continueEvent],
              [midiMessages.pulse[0], pulseEvent],
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

    sendSequencePulse: send('PULSE', {
      to: (ctx) => ctx.sequenceControllerRef,
    }),

    sendSequenceReset: send('RESET', {
      to: (ctx) => ctx.sequenceControllerRef,
    }),

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
  entry: ['spawnExternalClockAdaptor'],

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
          actions: ['logEvent'],
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
        PULSE: { actions: ['logEvent', 'sendSequencePulse'] },
        STOP: { actions: ['logEvent'], target: 'stopped' },
      },
    },

    stopped: {
      id: 'stopped',

      // EVENTS
      on: {
        START: {
          actions: ['logEvent', 'sendSequencePulse'],
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
const machine = Machine(machineConfig, machineDefaultOptions);

export default machine;
