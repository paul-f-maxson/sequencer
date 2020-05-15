import clockMachine, { ClockContext, ClockEvent } from '.';
import {
  Machine,
  spawn,
  assign,
  MachineOptions,
  Interpreter,
  interpret,
} from 'xstate';

import logger from '../../../logger';

// TEST SETUP

interface MockParentMachineContext {
  clock: Interpreter<ClockContext, any, ClockEvent, any>;
}

type MockParentMachineEvent = ClockEvent;

interface MockParentMachineStateSchema {
  states: { ready: {} };
}

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
        spawn(clockMachine, {
          name: 'clock',
          autoForward: true,
        }),
    }),
  },
};

const mockParentMachine = Machine<
  MockParentMachineContext,
  MockParentMachineStateSchema,
  MockParentMachineEvent
>(
  {
    id: 'mockParent',
    context: {
      clock: undefined,
    },
    entry: ['spawnClock'],
    initial: 'ready',
    states: {
      ready: {
        on: {
          PULSE: {
            actions: () => {
              pulsesRecorded++;
            },
          },
        },
      },
    },
  },
  mockParentMachineOptions
);

const service = interpret(mockParentMachine, logger.info);

let pulsesRecorded = 0;

beforeAll((done) => {
  service.start();
  done();
});

afterAll((done) => {
  service.stop();
  done();
});

// TESTS

it('starts without crashing', (done) => {
  done();
});

it(`Forwards recieved PULSE events to parent`, (done) => {
  expect.assertions(1);

  pulsesRecorded = 0;

  setTimeout(() => {
    expect(pulsesRecorded).toBe<number>(1);

    done();
  }, 1000);

  service.children.get('clock').send({ type: 'PULSE' });
}, 6000);
