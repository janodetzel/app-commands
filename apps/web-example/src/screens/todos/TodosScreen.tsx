import { useState } from "react";
import { useStore } from "zustand";

import { todosFeature, todosStore } from "../../app/instances";
import { todosSelectors } from "../../features/todos";

export function TodosScreen() {
	const todos = useStore(todosStore, todosSelectors.todos);
	const [title, setTitle] = useState("");

	// The screen calls the feature method, and so does a command: there is one
	// implementation, and `todos.newTodoSubmitted` is the command's name.
	const submit = async (event: React.FormEvent) => {
		event.preventDefault();
		if (!title.trim()) return;
		await todosFeature.newTodoSubmitted({ title });
		setTitle("");
	};

	return (
		<main style={{ maxWidth: 480, margin: "2rem auto", fontFamily: "system-ui, sans-serif" }}>
			<h1>Todos</h1>
			<form onSubmit={(e) => void submit(e)} style={{ display: "flex", gap: 8 }}>
				<input
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					placeholder="What needs doing?"
					aria-label="New todo"
					style={{ flex: 1 }}
				/>
				<button type="submit">Add</button>
			</form>
			<ul style={{ padding: 0, listStyle: "none" }}>
				{todos.map((todo) => (
					<li key={todo.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
						<input
							type="checkbox"
							checked={todo.done}
							aria-label={`Done: ${todo.title}`}
							onChange={() => void todosFeature.todoCheckboxToggled({ id: todo.id })}
						/>
						<span style={{ flex: 1, textDecoration: todo.done ? "line-through" : "none" }}>
							{todo.title}
						</span>
						<button onClick={() => void todosFeature.todoDeleteClicked({ id: todo.id })}>
							Delete
						</button>
					</li>
				))}
			</ul>
		</main>
	);
}
