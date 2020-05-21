import { AnyEventObject, InvokeCallback } from 'xstate';

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

/** HOF that produces a spawnable callback. The callback reports MIDI messages to its parent.
 * @description The callback sends creates and sends events as specified by the midiMessageMap in response to Midi messages. If an error occurs while the midi subscription is being set up, the actor sends the provided event to the parent.
 * @param midiMessageMap A mapping between Midi event codes and function that builds an event for the callback to send to its parent when a given midi message is received.
 * @param eventOnError A function that generates the event for the Actor to send to its parent when the subscription process throws an error.
 * @param midiInput The midi input object. While this actor was designed to work with node-midi out of the box, any midi library can be used as long as it fits the subscription pattern.
 * @returns An invokable or spawnable callback
 *
 * @example
 * assign({
 *  midiInputAdaptor: (ctx) => spawn(makeMidiInputAdaptor<LocalEvent>(
 *    new Map([
 *      [250, () => ({type: 'START'})],
 *      [252, () => ({type: 'STOP'})],
 *      [251, () => ({type: 'CONTINUE'})],
 *      [248, () => ({type: 'PULSE'})],
 *    ]),
 *    (e) => {type: 'MIDI_INPUT_ERROR', data: e},
 *    ctx.midiInput
 *  ), 'midi-clock-input')
 * })
 */
const makeMidiInputAdaptor = <TEvent extends AnyEventObject>(
  midiMessageMap: MidiMessageMap<TEvent>,
  eventOnError: (e: Error) => TEvent,
  midiInput: MidiInput
) =>
  ((sendParent) => {
    try {
      midiInput.on(
        'message',
        (deltaTime: number, message: MidiMessage) => {
          const currentMessageHandler = midiMessageMap.get(
            message[0]
          );
          if (typeof currentMessageHandler === 'function') {
            sendParent(
              currentMessageHandler(message, deltaTime)
            );
          }
        }
      );
    } catch (error) {
      sendParent(eventOnError);
    }
  }) as InvokeCallback;

export default makeMidiInputAdaptor;
