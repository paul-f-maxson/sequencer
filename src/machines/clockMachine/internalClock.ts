import { ClockContext, ClockEvent } from '.';
import { InvokeCreator } from 'xstate';

// TODO: implement correction for interval drift
export const makeInternalClock: InvokeCreator<ClockContext> = (
  ctx
) => (callback, onReceive) => {
  let id: ReturnType<typeof setInterval>;
  let cleanup: Function;

  // Sets an interval that sends the 'PULSE' event to the parent every 64th note
  const setClock = (bpm: number) => {
    const correctionAmount = 0.82;
    const msPerBeat: number =
      (60 * 1000) / bpm / 64 - correctionAmount; // conversion from bpm to milliseconds interval
    // e.g. 120 bt per min => 7.8125 ms per 64th note

    clearInterval(id);

    id = setInterval(() => {
      callback('PULSE');
    }, msPerBeat);

    cleanup = () => clearInterval(id);
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
