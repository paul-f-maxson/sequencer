import { ClockContext, ClockEvent } from '.';

import { makeInternalClock } from './internalClock';
import {
  assign,
  spawn,
  InvokeCallback,
  MachineOptions,
  Machine,
  MachineConfig,
  interpret,
} from 'xstate';
import logger from '../../../logger';

type MockParentMachineEvent = ClockEvent;

type MockParentMachineContext = ClockContext;

interface MockParentMachineStateSchema {
  states: {
    ready: {};
  };
}

const mockParentMachineDefaultOptions: Partial<MachineOptions<
  MockParentMachineContext,
  MockParentMachineEvent
>> = {
  actions: {
    spawnInternalClock: assign<
      MockParentMachineContext,
      MockParentMachineEvent
    >({
      internalClock: (ctx, evt) =>
        spawn(makeInternalClock(ctx, evt) as InvokeCallback, {
          name: 'internalClock',
          autoForward: true,
        }),
    }),
  },
};

const mockParentMachineConfig: MachineConfig<
  MockParentMachineContext,
  MockParentMachineStateSchema,
  MockParentMachineEvent
> = {
  id: 'mockParent',
  context: {
    internalClock: undefined,
    tempoSetting: 120,
    swingAmount: 0.5,
  },
  initial: 'ready',
  states: {
    ready: {
      entry: ['spawnInternalClock'],
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
};

const mockParentMachine = Machine(
  mockParentMachineConfig,
  mockParentMachineDefaultOptions
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

it('starts without crashing', (done) => {
  done();
});

it('sends PULSE event(s)', (done) => {
  expect.assertions(1);

  pulsesRecorded = 0;

  setTimeout(() => {
    expect(pulsesRecorded).toBeGreaterThan(0);
    done();
  }, 1000);
});

it(`Sends a PULSE event every 7.81+/-0.15ms (1.92%) by default`, (done) => {
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
