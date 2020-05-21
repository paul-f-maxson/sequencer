const midi = require('midi');
import makeMidiInputAdaptor, {
  MidiInput,
} from './externalClock';
import {
  Machine,
  interpret,
  Actor,
  assign,
  spawn,
} from 'xstate';
import { log } from 'xstate/lib/actions';

const input = new midi.Input();
input.ignoreTypes(true, false, true);
input.openVirtualPort(`midi-clock-in`);

interface LocalContext {
  midiInputAdaptor: Actor;
  midiInput: MidiInput;
}

type LocalEvent =
  | { type: 'PULSE' }
  | { type: 'STOP' }
  | { type: 'START' }
  | { type: 'CONTINUE' }
  | { type: 'MIDI_INPUT_ERROR'; data: Error };

const spawnMidiClockInput = assign<LocalContext, LocalEvent>({
  midiInputAdaptor: (ctx) =>
    spawn(
      makeMidiInputAdaptor<LocalEvent>(
        new Map([
          [250, () => ({ type: 'START' } as LocalEvent)],
          [252, () => ({ type: 'STOP' } as LocalEvent)],
          [251, () => ({ type: 'CONTINUE' } as LocalEvent)],
          [248, () => ({ type: 'PULSE' } as LocalEvent)],
        ]),
        (e) => ({ type: 'MIDI_INPUT_ERROR', data: e }),
        ctx.midiInput
      ),
      'midi-clock-input'
    ),
});

const machine = Machine<LocalContext, LocalEvent>({
  id: 'test',
  context: {
    midiInputAdaptor: undefined,
    midiInput: input,
  },
  entry: spawnMidiClockInput,
  initial: 'active',
  states: {
    active: {
      entry: log('active'),
      on: {
        PULSE: { actions: log('PULSE') },
        START: { actions: log('START') },
        STOP: { actions: log('STOP') },
        CONTINUE: { actions: log('CONTINUE') },
        MIDI_INPUT_ERROR: { actions: log('ERROR') },
      },
    },
  },
});

interpret(machine).start();
