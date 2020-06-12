import {
  Machine,
  spawn,
  assign,
  MachineOptions,
  interpret,
  InvokeCallback,
  AnyStateNodeDefinition,
} from 'xstate';

import logger from '../../../logger';

import {
  MachineEvent as SupervisorEvent,
  MachineContext as SupervisorContext,
  machineDefaultOptions as supervisorDefaultOptions,
} from '../supervisor';

import clockController, {
  MachineContext as ClockControllerContext,
  MachineEvent as ClockControllerEvent,
  machineDefaultContext as clockControllerDefaultContext,
} from '.';

import sequenceControllerMachine from '../sequenceController';
import { log } from 'xstate/lib/actions';

// TEST SETUP

const recieveSpy = jest.fn();

const mockExternalClock: InvokeCallback = (localSendParent) => {
  localSendParent('MIDI_INPUT_READY');

  setTimeout(() => {
    localSendParent([
      // Clean input
      'START', // Should trigger a reset
      'PULSE', // Should trigger a pulse
      'STOP', // Should have no external result

      'CONTINUE', // Should have no external result
      'PULSE', // Should trigger a pulse
      'STOP', // Should have no external result

      // Dirty input
      'STOP', // Should have no external result
      'PULSE', // Should have no external result, ie not trigger a pulse

      'CONTINUE', // Should have no external result
      'START', // Should have no external result
    ]);
  }, 100);
};

type TestSupervisorContext = SupervisorContext;

type TestSupervisorEvent = SupervisorEvent;

const supervisorOptions: typeof supervisorDefaultOptions = {
  actions: {
    spawnClockController: assign<
      TestSupervisorContext,
      TestSupervisorEvent
    >({
      clockControllerRef: (ctx) =>
        spawn(
          clockController
            .withContext({
              ...clockControllerDefaultContext,

              sequenceControllerRef: ctx.sequenceControllerRef,
            })
            .withConfig(
              clockControllerMockOptions
            ) as typeof clockController,
          {
            name: 'clock-controller',
          }
        ),
    }),

    spawnSequenceController: assign<
      TestSupervisorContext,
      TestSupervisorEvent
    >({
      sequenceControllerRef: () => spawn(mockSequenceController),
    }),

    logEvent: log((_, evt) => evt, 'mock clock parent'),
  },
};

const clockControllerMockOptions: Partial<MachineOptions<
  ClockControllerContext,
  ClockControllerEvent
>> = {
  actions: {
    spawnExternalClockAdaptor: assign<
      ClockControllerContext,
      ClockControllerEvent
    >({
      midiInputAdaptorRef: () =>
        spawn(
          mockExternalClock,

          'mock-external-clock'
        ),
    }),
  },
};

const supervisor = Machine<
  TestSupervisorContext,
  AnyStateNodeDefinition,
  TestSupervisorEvent
>(
  {
    //
    id: 'mockParent',
    initial: 'ready',

    // CONTEXT
    context: {
      sequenceControllerRef: undefined,
      clockControllerRef: undefined,
    },

    entry: ['spawnSequenceController', 'spawnClockController'],

    states: {
      ready: {
        // EVENTS

        on: {
          CLOCK_READY: {
            actions: [
              'logEvent',
              () => {
                recieveSpy('CLOCK_READY');
              },
            ],
          },
        },
      },
    },
  },
  supervisorOptions
);

const mockSequenceController: typeof sequenceControllerMachine = Machine(
  {
    // CONFIG
    id: 'mockSequenceController',
    initial: 'ready',

    states: {
      ready: {
        // EVENTS
        on: {
          PULSE: {
            actions: [
              'logEvent',
              () => {
                recieveSpy('PULSE');
              },
            ],
          },

          RESET: {
            actions: [
              'logEvent',
              () => {
                recieveSpy('RESET');
              },
            ],
          },
        },
      },
    },
  },
  {
    // OPTIONS
    actions: {
      logEvent: log((_, evt) => evt, 'sequence controller'),
    },
  }
);

// TESTS
it(`Follows expected behavior`, (done) => {
  const service = interpret(supervisor, {
    logger: (message: string, ...meta: [any]) =>
      logger.log('debug', message, ...meta),
  }).start();

  const cleanup = (error?: Error) => {
    service.stop();

    done(error);
  };

  expect.assertions(1);

  setTimeout(() => {
    try {
      expect(recieveSpy.mock.calls).toEqual([
        ['CLOCK_READY'],
        ['RESET'],
        ['PULSE'],
        ['PULSE'],
      ]);
    } catch (e) {
      cleanup(e);
    }
    cleanup();
  }, 200);
});
