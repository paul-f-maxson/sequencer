import {
  Machine,
  spawn,
  assign,
  MachineOptions,
  Interpreter,
  interpret,
  InvokeCallback,
} from 'xstate';

import logger from '../../../logger';

import {
  MachineEvent as SupervisorEvent,
  MachineContext as SupervisorContext,
} from '../supervisor';

import clockMachine, {
  MachineContext as ClockControllerContext,
  MachineEvent as ClockControllerEvent,
  MachineStateSchema as ClockControllerStateSchema,
  machineDefaultContext as clockControllerDefaultContext,
} from '.';
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

type MockParentMachineContext = SupervisorContext;

type MockParentMachineEvent = SupervisorEvent;

interface MockParentMachineStateSchema {
  states: { ready: {} };
}

const mockMachineOptions: Partial<MachineOptions<
  ClockControllerContext,
  ClockControllerEvent
>> = {
  actions: {
    spawnExternalClock: assign<
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

const mockParentMachineOptions: Partial<MachineOptions<
  MockParentMachineContext,
  MockParentMachineEvent
>> = {
  actions: {
    spawnClock: assign<
      MockParentMachineContext,
      MockParentMachineEvent
    >({
      clockControllerRef: (ctx) =>
        spawn(
          clockMachine
            .withContext({
              ...clockControllerDefaultContext,

              sequenceControllerRef: ctx.sequenceControllerRef,
            })
            .withConfig(
              mockMachineOptions
            ) as typeof clockMachine,
          {
            name: 'clock',
          }
        ),
    }),

    logEvent: log((_, evt) => evt, 'mock clock parent'),
  },
};

const mockParentMachine = Machine<
  MockParentMachineContext,
  MockParentMachineStateSchema,
  MockParentMachineEvent
>(
  {
    id: 'mockParent',
    initial: 'ready',

    states: {
      ready: {
        // EVENTS
        entry: [
          'spawnSequenceController',
          'spawnClockController',
        ],

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
  mockParentMachineOptions
);

const mockSequenceControllerMachine = Machine({
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
});

// TESTS
xit('starts without crashing', (done) => {
  interpret(
    Machine({
      id: 'mockParent',
      initial: 'ready',

      context: { clock: undefined },

      states: {
        ready: {
          entry: assign({
            clock: () =>
              spawn(clockMachine, {
                name: 'clock',

                autoForward: true,
              }),
          }),
        },
      },
    }),
    {
      logger: (message: string, ...meta: [any]) =>
        logger.log('info', message, ...meta),
    }
  )
    .start()
    .stop();
  done();
});

it(`Follows defined behavior`, (done) => {
  const service = interpret(mockParentMachine, {
    logger: (message: string, ...meta: [any]) =>
      logger.log('info', message, ...meta),
  }).start();

  const cleanup = (error?: Error) => {
    service.stop();

    done(error);
  };

  expect.assertions(1);

  setTimeout(() => {
    try {
      expect(recieveSpy.mock.calls).toEqual([
        ['READY'],
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
