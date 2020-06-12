import { AnyEventObject, InvokeCallback } from 'xstate';

import logger from '../../../logger';

type MidiMessage = [number, number, number];

type MessageHandler = (
  deltaTime: number,
  midiMessage: MidiMessage
) => void;

export interface MidiInput {
  on: (
    eventType: string,
    messageHandler: MessageHandler
  ) => void;
}

type MidiMessageMap<TEvent> = Map<
  number,
  (midiMessage: MidiMessage, deltaTime: number) => TEvent
>;

// NOTE: Uses a Map for the midi messages over a Record because its keys will be numbers and I want to avoid confusion with an array.

/** HOF that produces a spawnable callback. The callback reports MIDI messages to its parent.
 * @description The callback sends creates and sends events as specified by the midiMessageMap in response to Midi messages. If an error occurs while the midi subscription is being set up, the actor sends the provided event to the parent.
 *
 * @param TEvent The event type of the invoking machine.
 *
 * @param midiInput The midi input object. While this actor was designed to work with node-midi out of the box, any midi library can be used as long as it fits the subscription pattern.
 * @param midiMessageMap A mapping between Midi event codes and function that builds an event for the callback to send to its parent when a given midi message is received.
 * @param makeOnError A function that generates the event for the Actor to send to its parent when the subscription process throws an error.
 * @param onReady The event for the Actor to send to its parent when the subscription is succesfully completed.
 *
 * @returns An invokable or spawnable callback
 *
 * @example
 * assign({
 *  midiInputAdaptor: (ctx) => spawn(makeMidiInputAdaptor<LocalEvent>(
 *    ctx.midiInput,
 *    new Map([
 *      [250, () => ({type: 'START'})],
 *      [252, () => ({type: 'STOP'})],
 *      [251, () => ({type: 'CONTINUE'})],
 *      [248, () => ({type: 'PULSE'})],
 *    ]),
 *    (e) => {type: 'MIDI_INPUT_ERROR', data: e},
 *    {type: 'CLOCK_INPUT_READY'}
 *  ), 'midi-clock-input')
 * })
 *
 */
const makeMidiInputAdaptor = <TEvent extends AnyEventObject>(
  midiInput: MidiInput,
  midiMessageMap: MidiMessageMap<TEvent> = new Map(),
  makeOnError: (e: Error) => TEvent = (e) => {
    throw e;
  },
  onReady?: TEvent
): InvokeCallback => (localSendParent) => {
  try {
    midiInput.on(
      'message',
      (deltaTime: number, message: MidiMessage) => {
        logger.log(
          'info',
          `midi input`,
          JSON.stringify(message)
        );
        const currentMessageHandler = midiMessageMap.get(
          message[0]
        );
        if (typeof currentMessageHandler === 'function') {
          localSendParent(
            currentMessageHandler(message, deltaTime)
          );
        }
      }
    );
  } catch (error) {
    localSendParent(makeOnError(error));
  }

  localSendParent(onReady);
};

export default makeMidiInputAdaptor;
