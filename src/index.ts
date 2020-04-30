import { Machine, Actor } from "xstate";
import { v5 as uuid } from "uuid";

interface SequencerConfig {
  stepMode: "forward" | "reverse" | "random" | "brownian";
}

type SequencerConfigEvent = {
  type: "CHANGE_STEPMODE";
  data: SequencerConfig["stepMode"];
};

interface SequencerStateSchema {
  states: {
    run: {};
    pause: {};
    stop: {};
  };
}

type SequencerEvent =
  | { type: "MODIFY_STEP" }
  | { type: "STEP" }
  | { type: "RUN" }
  | { type: "STOP" }
  | { type: "PAUSE" }
  | SequencerConfigEvent;

interface SequencerContext {
  steps: Map<string, Actor>;
  clock: Actor;
  config: SequencerConfig;
}

const sequencerMachine = Machine<
  SequencerContext,
  SequencerStateSchema,
  SequencerEvent
>({
  id: "sequencer",
  initial: "stop",
  states: {
    run: {},
    pause: {},
    stop: {},
  },
});

export default sequencerMachine;
