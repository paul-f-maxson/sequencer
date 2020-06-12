import { Machine, interpret } from 'xstate';

import logger from '../../../logger';

import sequencerMachine, { machineDefaultOptions } from '.';

let lastNoteTime: ReturnType<typeof process.hrtime.bigint>;
let notesRecorded = 0;
let noteTimeAccumulator = BigInt(0);

const mockPlayerMachine = Machine({
  id: 'mockPlayer',
  initial: 'ready',
  states: {
    ready: {
      on: {
        NOTE: {
          actions: () => {
            const currentTime = process.hrtime.bigint();
            if (lastNoteTime !== undefined) {
              noteTimeAccumulator += currentTime - lastNoteTime;
            }
            notesRecorded++;
            lastNoteTime = currentTime;
          },
        },
      },
    },
  },
});

const service = interpret(
  sequencerMachine.withConfig({
    ...machineDefaultOptions,
  }),
  {
    logger: (message: string, ...meta: [any]) =>
      logger.log('test', message, ...meta),
  }
);

beforeAll((done) => {
  service.start();
  done();
});

afterAll((done) => {
  service.stop();
  done();
});

xit('Sends a NOTE to the passed player machine every 500ms by default', (done) => {
  lastNoteTime = undefined;
  noteTimeAccumulator = BigInt(0);
  notesRecorded = 0;

  setTimeout(() => {
    const avgNoteDuration =
      Number(noteTimeAccumulator / BigInt(notesRecorded)) *
      0.000001;

    // Expect the time between note events to be within 1.92% of expected
    expect(avgNoteDuration).toBeGreaterThan(490);
    expect(avgNoteDuration).toBeLessThan(510);
    done();
  }, 1000);
});
