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

// MACHINE OPTIONS

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

    trackPulse: assign((ctx) => {
      const { testCtx } = ctx;
      const currentTime = process.hrtime.bigint();

      return {
        ...ctx,

        testCtx: {
          ...ctx.testCtx,

          pulsesRecorded: testCtx.pulsesRecorded + 1,
          lastPulseTime: currentTime,
          pulseTimeAccumulator:
            currentTime - testCtx.lastPulseTime,
        },
      };
    }),
  },
};

// MACHINE TYPES

type MockParentMachineEvent = ClockEvent;

interface MockParentMachineStateSchema {
  states: {
    ready: {};
  };
}

type MockParentMachineContext = typeof mockParentMachineDefaultContext;

// MACHINE CONTEXT

const mockParentMachineDefaultContext = {
  ...clockMachineDefaultContext,
  testCtx: {
    lastPulseTime: BigInt(0),
    pulseTimeAccumulator: BigInt(0),
    pulsesRecorded: 0,
  },
};

// MACHINE CONFIG

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

// MACHINE DEFINITION

const mockParentMachine = Machine(
  mockParentMachineConfig,
  mockParentMachineDefaultOptions
);

// UTILITIES

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

// TESTS

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
  }, 100);
});

it(`Sends a PULSE event every 8+/-1ms by default`, (done) => {
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
    const avgPulseNs =
      pulseTimeAccumulator / BigInt(pulsesRecorded);
    const avgPulseMs = Number(avgPulseNs) * 0.0001;

    expect(avgPulseMs).toBeGreaterThan(7);
    expect(avgPulseMs).toBeLessThan(9);

    service.stop();
    done();
  }, 1000);
}, 6000);

xit(`reacts to CHNG_TEMPO events`, (done) => {
  const service = makeRunningService();

  let pulsesRecorded: number;
  let pulseTimeAccumulator: bigint;

  // Track changes to these mock parent machine context values
  service.onChange(({ testCtx }) => {
    pulsesRecorded = testCtx.pulsesRecorded;
    pulseTimeAccumulator = testCtx.pulseTimeAccumulator;
  });

  expect.assertions(2);

  service.onEvent((evt: ClockEvent) => {
    if (evt.type === 'CHNG_TEMPO') {
      setTimeout(() => {
        const avgPulseNs =
          pulseTimeAccumulator / BigInt(pulsesRecorded);
        const avgPulseMs = Number(avgPulseNs) * 0.0001;

        expect(avgPulseMs).toBeGreaterThan(10);
        expect(avgPulseMs).toBeLessThan(11);

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
