import { Machine } from "xstate";
import { v5 as uuid } from "uuid";
console.log(uuid.URL);

interface SequencerStateSchema {
  states: {
    run: {};
    pause: {};
    stop: {};
  };
}

type SequencerEvent =
  | { type: "MODIFY_STEP" }
  | { type: "NEXT_STEP" }
  | { type: "RUN" }
  | { type: "STOP" }
  | { type: "PAUSE" };

interface SequencerContext {
  steps: Map<>;
}
