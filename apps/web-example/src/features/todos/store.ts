import { createStore } from "zustand/vanilla";

export type Todo = { id: number; title: string; done: boolean };

export type TodosState = { todos: Todo[]; nextId: number };

export type TodosStoreActions = {
	add(title: string): Todo;
	toggle(id: number): Todo;
	remove(id: number): void;
};

/**
 * Ids count up from the store's own state: logic does not call `Math.random`, so a
 * replayed command sequence produces the same ids twice.
 */
export const createTodosStore = () =>
	createStore<TodosState & TodosStoreActions>()((set, get) => ({
		todos: [],
		nextId: 1,

		add(title) {
			const todo: Todo = { id: get().nextId, title, done: false };
			set((s) => ({ todos: [...s.todos, todo], nextId: s.nextId + 1 }));
			return todo;
		},

		toggle(id) {
			const existing = get().todos.find((t) => t.id === id);
			if (!existing) throw new Error(`there is no todo ${id}`);
			const toggled = { ...existing, done: !existing.done };
			set((s) => ({ todos: s.todos.map((t) => (t.id === id ? toggled : t)) }));
			return toggled;
		},

		remove(id) {
			if (!get().todos.some((t) => t.id === id)) throw new Error(`there is no todo ${id}`);
			set((s) => ({ todos: s.todos.filter((t) => t.id !== id) }));
		},
	}));

export type TodosStore = ReturnType<typeof createTodosStore>;

/** What the screen subscribes to. Commands read `getState()` and pick the same fields. */
export const todosSelectors = {
	todos: (s: TodosState) => s.todos,
};
