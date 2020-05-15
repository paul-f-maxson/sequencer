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
              const currentTime = process.hrtime.bigint();
              if (lastPulseTime !== undefined) {
                pulseTimeAccumulator +=
                  currentTime - lastPulseTime;
              }
              pulsesRecorded++;
              lastPulseTime = currentTime;
            },
          },
        },
      },
    },
  },
  mockParentMachineOptions
);

const service = interpret(mockParentMachine, logger.log);

let lastPulseTime: ReturnType<typeof process.hrtime.bigint>;
let pulsesRecorded = 0;
let pulseTimeAccumulator = BigInt(0);

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

xit(`Sends a PULSE event every 7.81+/-0.15ms (1.92%) by default`, (done) => {
  expect.assertions(2);

  lastPulseTime = undefined;
  pulsesRecorded = 0;
  pulseTimeAccumulator = BigInt(0);

  setTimeout(() => {
    const avgPulseDuration =
      Number(pulseTimeAccumulator / BigInt(pulsesRecorded)) *
      0.000001;

    // Expect the time between pulse events to be within 1.92% of expected
    expect(avgPulseDuration).toBeGreaterThan(7.66);
    expect(avgPulseDuration).toBeLessThan(7.96);

    done();
  }, 1000);
}, 6000);

xit(`responds to CHNG_TEMPO events`, (done) => {
  expect.assertions(2);

  service.onEvent((evt) => {
    if (evt.type === 'CHNG_TEMPO') {
      setTimeout(() => {
        const avgPulseDuration =
          Number(pulseTimeAccumulator / BigInt(pulsesRecorded)) *
          0.000001;

        // Expect the time between pulse events to be within 1.92% of expected
        expect(avgPulseDuration).toBeGreaterThan(10);
        expect(avgPulseDuration).toBeLessThan(11);

        done();
      }, 1000);
    }
  });

  lastPulseTime = undefined;
  pulsesRecorded = 0;
  pulseTimeAccumulator = BigInt(0);

  service.send({ type: 'CHNG_TEMPO', data: 90 });
}, 6000);
