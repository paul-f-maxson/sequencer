import { ClockContext, ClockEvent } from '.';
import { InvokeCreator } from 'xstate';
import accurateInterval from 'accurate-interval';

type SetIntervalType = (
  ...args: Partial<Parameters<typeof accurateInterval>>
) => ReturnType<typeof accurateInterval>;

const setInterval: SetIntervalType = (callback, interval) =>
  accurateInterval(callback, interval, {
    aligned: false,
    immediate: false,
  });

const clearInterval = (
  interval: ReturnType<typeof accurateInterval>
) => interval.clear();

// TODO: implement correction for interval drift
export const makeInternalClock: InvokeCreator<
  ClockContext,
  ClockEvent
> = (ctx) => (callback, onReceive) => {
  let interval: ReturnType<typeof setInterval>;
  let cleanup: Function;

  // Sets an interval that sends the 'PULSE' event to the parent every 64th note
  const setClock = (bpm: number) => {
    // conversion from bpm to milliseconds interval
    // e.g. 120 bt per min => 7.8125 ms per 64th note, 90 bpm => 10.4166 ms
    const correctionAmount = 0;
    const conversionFactor = 60 * 1000 * 64 ** -1;
    const minPerBeat = bpm ** -1; // inverse bpm
    const msPerPulse: number =
      minPerBeat * conversionFactor - correctionAmount;

    interval && clearInterval(interval);

    interval = setInterval(() => {
      callback('PULSE');
    }, msPerPulse);

    cleanup = () => clearInterval(interval);
  };

  // Set the clock initially
  setClock(ctx.tempoSetting);

  // If the clock is asked to change tempo, set the clock
  onReceive((evt: ClockEvent) => {
    switch (evt.type) {
      case 'CHNG_TEMPO':
        setClock(evt.data);
    }
  });

  return cleanup;
};
