const midi = require('midi');

import makeMidiInputAdaptor, { MidiInput } from './';

import {
  Machine,
  interpret,
  Actor,
  assign,
  spawn,
} from 'xstate';

const makeConnectedPorts = () => {
  const input = new midi.Input();
  input.ignoreTypes(true, false, true);
  input.openVirtualPort('my-test-port');

  const output = new midi.Output();

  let found = false;

  for (let i = 0; i < output.getPortCount(); i++) {
    if (output.getPortName(i) === 'my-test-port') {
      output.openPort(i);
      found = true;
    }
  }
  if (!found) throw new Error('port not found');

  return [input, output];
};

interface LocalContext {
  midiInputAdaptor: Actor;
  midiInput: MidiInput;
}

type LocalEvent =
  | { type: 'PULSE' }
  | { type: 'STOP' }
  | { type: 'START' }
  | { type: 'CONTINUE' }
  | { type: 'MIDI_INPUT_READY' }
  | { type: 'MIDI_INPUT_ERROR'; data: Error };

const machine = Machine<LocalContext, LocalEvent>({
  id: 'test',
  entry: 'spawnMidiClockInput',
  initial: 'active',
  states: {
    active: {
      on: {
        PULSE: { actions: 'spy' },
        START: { actions: 'spy' },
        STOP: { actions: 'spy' },
        CONTINUE: { actions: 'spy' },
        MIDI_INPUT_ERROR: { actions: 'spy' },
      },
    },
  },
});

const midiStartMessage = [250];
const midiStopMessage = [252];
const midiContinueMessage = [251];
const midiPulseMessage = [248];

const spawnMidiClockInput = assign<LocalContext, LocalEvent>({
  midiInputAdaptor: (ctx) =>
    spawn(
      makeMidiInputAdaptor<LocalEvent>(
        ctx.midiInput,
        new Map([
          [
            midiStartMessage[0],
            () => ({ type: 'START' } as LocalEvent),
          ],
          [
            midiStopMessage[0],
            () => ({ type: 'STOP' } as LocalEvent),
          ],
          [
            midiContinueMessage[0],
            () => ({ type: 'CONTINUE' } as LocalEvent),
          ],
          [
            midiPulseMessage[0],
            () => ({ type: 'PULSE' } as LocalEvent),
          ],
        ]),
        (e) => ({ type: 'MIDI_INPUT_ERROR', data: e }),
        { type: 'MIDI_INPUT_READY' }
      ),
      'midi-clock-input'
    ),
});

it('Adapts midi messages to events', (done) => {
  const [input, output] = makeConnectedPorts();

  const eventSpy = jest.fn();

  const service = interpret(
    machine.withConfig(
      {
        actions: {
          spawnMidiClockInput,
          spy: (_, e) => {
            eventSpy(e);
          },
        },
      },
      {
        midiInputAdaptor: undefined,
        midiInput: input,
      }
    )
  );

  expect.assertions(1);

  setTimeout(() => {
    try {
      expect(eventSpy).toHaveBeenCalledWith({ type: 'PULSE' });
    } catch (e) {
      done(e);
    }

    service.stop();
    output.closePort();
    input.closePort();
    done();
  }, 100);

  output.sendMessage(midiPulseMessage);
  service.start();
});
