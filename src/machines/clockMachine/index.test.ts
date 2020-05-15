import {
  Machine,
  spawn,
  assign,
  MachineOptions,
  Interpreter,
  interpret,
  InvokeCreator,
  InvokeCallback,
} from 'xstate';

import logger from '../../../logger';
import clockMachine, {
  ClockContext,
  ClockEvent,
  clockMachineDefaultOptions,
} from '.';

// TEST SETUP

let chngTempoRecorded = 0;

const makeMockInternalClock: InvokeCreator<ClockContext> = () => (
  _,
  onReceive
) => {
  onReceive((evt) => {
    switch (evt.type) {
      case 'CHNG_TEMPO':
        chngTempoRecorded++;
    }
  });
};

interface MockParentMachineContext {
  clock: Interpreter<ClockContext, any, ClockEvent, any>;
}

type MockParentMachineEvent = ClockEvent;

interface MockParentMachineStateSchema {
  states: { ready: {} };
}

const mockClockMachine: typeof clockMachine = clockMachine.withConfig(
  {
    ...clockMachineDefaultOptions,
    actions: {
      ...clockMachineDefaultOptions.actions,
      spawnInternalClock: assign<ClockContext, ClockEvent>({
        internalClock: (ctx, evt) =>
          spawn(
            makeMockInternalClock(ctx, evt) as InvokeCallback,
            {
              name: 'internalClock',
              autoForward: true,
            }
          ),
      }),
    },
  }
);

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
        spawn(mockClockMachine, {
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

it(`Forwards recieved 'CHNG_TEMPO' events to internal clock`, (done) => {});
