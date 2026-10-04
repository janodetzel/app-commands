import { createTodosFeature, createTodosStore } from "../features/todos";

/**
 * The only file that creates instances. Screens and the command registry both
 * import from here, so a command runs against the very store the page renders
 * from: a store built inside a component would be unreachable for the bridge.
 */
export const todosStore = createTodosStore();

export const todosFeature = createTodosFeature({ store: todosStore });
