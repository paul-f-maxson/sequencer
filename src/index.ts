import { Machine, Actor } from "xstate";
import { v5 as uuid } from "uuid";

interface SequencerGlobalConfigStates {
  stepMode: {
    states: {
      forward: {};
      reverse: {};
      random: {};
      brownian: {};
    };
  };
}

interface SequencerStateSchema {
  states: {
    run: {};
    pause: {};
    stop: {};
  };
}

type SequencerEvent =
  | { type: "MODIFY_STEP" }
  | { type: "MODIFY_GLOBAL" }
  | { type: "STEP" }
  | { type: "RUN" }
  | { type: "STOP" }
  | { type: "PAUSE" };

interface SequencerContext {
  steps: Map<string, Actor>;
  clock: Actor;
  globalConfig: Actor;
}
