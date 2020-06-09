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

import { MachineEvent as SequencerMachineEvent } from '../supervisor';

import clockMachine, {
  MachineContext as ClockMachineContext,
  MachineEvent as ClockMachineEvent,
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

interface MockParentMachineContext {
  clock: Interpreter<
    ClockMachineContext,
    any,
    ClockMachineEvent,
    any
  >;
}

type MockParentMachineEvent = SequencerMachineEvent;

interface MockParentMachineStateSchema {
  states: { ready: {} };
}

const mockConfig: Partial<MachineOptions<
  ClockMachineContext,
  ClockMachineEvent
>> = {
  actions: {
    spawnExternalClock: assign<
      ClockMachineContext,
      ClockMachineEvent
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
      clock: () =>
        spawn(
          clockMachine.withConfig(
            mockConfig
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

    // CONTEXT
    context: {
      clock: undefined,
    },

    states: {
      ready: {
        // EVENTS
        entry: ['spawnClock'],

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

          READY: {
            actions: [
              'logEvent',
              () => {
                recieveSpy('READY');
              },
            ],
          },
        },
      },
    },
  },
  mockParentMachineOptions
);

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
