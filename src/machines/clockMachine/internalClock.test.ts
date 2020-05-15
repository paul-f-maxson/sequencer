import { ClockEvent, clockMachineDefaultContext } from '.';

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
    trackPulse: ({ testCtx: debugCtx }) => {
      const currentTime = process.hrtime.bigint();
      if (debugCtx.lastPulseTime !== undefined) {
        debugCtx.pulseTimeAccumulator +=
          currentTime - debugCtx.lastPulseTime;
      }
      debugCtx.pulsesRecorded++;
      debugCtx.lastPulseTime = currentTime;
    },
  },
};

const mockParentMachineDefaultContext = {
  ...clockMachineDefaultContext,
  testCtx: {
    lastPulseTime: BigInt(0),
    pulseTimeAccumulator: BigInt(0),
    pulsesRecorded: 0,
  },
};

type MockParentMachineContext = typeof mockParentMachineDefaultContext;

const mockParentMachineConfig: MachineConfig<
  MockParentMachineContext,
  MockParentMachineStateSchema,
  MockParentMachineEvent
> = {
  id: 'mockParent',
  initial: 'ready',
  states: {
    ready: {
      entry: 'spawnInternalClock',
      on: {
        PULSE: {
          actions: 'trackPulse',
        },
      },
    },
  },
};

const makeRunningService = () => {
  const service = interpret(
    mockParentMachine.withContext(
      mockParentMachineDefaultContext
    ),
    logger.info
  );

  service.start();

  return service;
};

const mockParentMachine = Machine(
  mockParentMachineConfig,
  mockParentMachineDefaultOptions
);

it('starts without crashing', (done) => {
  const service = makeRunningService();

  service.stop();
  done();
});

it('sends PULSE event(s)', (done) => {
  const service = makeRunningService();

  let pulsesRecorded: number;

  // Track changes to these mock parent machine context values
  service.onChange(({ testCtx }) => {
    pulsesRecorded = testCtx.pulsesRecorded;
  });

  expect.assertions(1);

  setTimeout(() => {
    expect(pulsesRecorded).toBeGreaterThan(0);

    service.stop();
    done();
  }, 1000);
});

it(`Sends a PULSE event every 8+/1ms by default`, (done) => {
  const service = makeRunningService();

  let pulsesRecorded: number;
  let pulseTimeAccumulator: bigint;

  // Track changes to these mock parent machine context values
  service.onChange(({ testCtx }) => {
    pulsesRecorded = testCtx.pulsesRecorded;
    pulseTimeAccumulator = testCtx.pulseTimeAccumulator;
  });

  expect.assertions(2);

  setTimeout(() => {
    const avgPulseDuration =
      Number(pulseTimeAccumulator / BigInt(pulsesRecorded)) *
      0.000001;

    // Expect the time between pulse events to be within 1.92% of expected
    expect(avgPulseDuration).toBeGreaterThan(7);
    expect(avgPulseDuration).toBeLessThan(9);

    service.stop();
    done();
  }, 1000);
}, 6000);

it(`reacts to CHNG_TEMPO events`, (done) => {
  const service = makeRunningService();

  let pulsesRecorded: number;
  let pulseTimeAccumulator: bigint;

  // Track changes to these mock parent machine context values
  service.onChange(({ testCtx }) => {
    pulsesRecorded = testCtx.pulsesRecorded;
    pulseTimeAccumulator = testCtx.pulseTimeAccumulator;
  });

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

        service.stop();
        done();
      }, 1000);
    }
  });

  service.send({
    type: 'CHNG_TEMPO',
    data: 90,
  } as ClockEvent);
}, 6000);
