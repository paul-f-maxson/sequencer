const midi = require('midi');

import {
  Machine,
  Actor,
  spawn,
  MachineConfig,
  MachineOptions,
  assign,
  Interpreter,
} from 'xstate';
import { log } from 'xstate/lib/actions'

import { 
  MachineContext as SequenceControllerContext,
  MachineStateSchema as SequenceControllerStateSchema,
  MachineEvent as SequenceControllerEvent,
 } from  '../sequenceControllerMachine'

import clockController, {
  MachineContext as ClockControllerContext,
  MachineStateSchema as ClockControllerStateSchema,
  MachineEvent as ClockControllerEvent,
  machineDefaultContext as clockControllerDefaultContext
} from '../clockController';

// UTIL

const midiClockInput = new midi.Input();
  midiClockInput.ignoreTypes(true, false, true);
  midiClockInput.openVirtualPort('squ-clock-in');

// STATE

interface MachineStateSchema {
  states: {
    running: {};
    error: {};
  };
}

// CONTEXT

const machineDefaultContext = {
  sequenceControllerRef: undefined as Interpreter<
    SequenceControllerContext,
    SequenceControllerStateSchema, 
    SequenceControllerEvent
  >,

  clockControllerRef: undefined as Interpreter<
    ClockControllerContext, 
    ClockControllerStateSchema, 
    ClockControllerEvent
  >
}

export type MachineContext = typeof machineDefaultContext;

// EVENTS

export type MachineEvent = null;

// CONFIG

export const machineDefaultOptions: Partial<MachineOptions<
  MachineContext,
  MachineEvent
>> = {
  actions: {
    spawnClock: assign<MachineContext, MachineEvent>({
      clockControllerRef: (ctx: MachineContext) =>
        spawn<
          ClockControllerContext, 
          ClockControllerEvent
        >(
          clockController.withContext({
            ...clockControllerDefaultContext,

            midiInput: midiClockInput,

            sequenceControllerRef: ctx.sequenceControllerRef 
          }),
          
          { name: 'clock-controller' }
        ),
    }),

    logEvent: log((_, evt) => evt, 'master controller'),
  },
};

const machineConfig: MachineConfig<
  MachineContext,
  MachineStateSchema,
  MachineEvent
> = {
  id: 'sequencer',
  initial: 'running',

  entry: ['spawnSequenceController', 'spawnClockController', ],

  states: {
    running: {},

    error: {},
  },
};

const sequencerMachine = Machine(
  machineConfig,
  machineDefaultOptions,
  machineDefaultContext
);

export default sequencerMachine;