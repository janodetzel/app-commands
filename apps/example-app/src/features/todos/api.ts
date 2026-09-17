import type { ApolloClient, Reference } from "@apollo/client";
import { type Todo, ADD_TODO, REMOVE_TODO, SET_TODO_DONE, TODO_FIELDS, TODOS } from "./gql";

/**
 * One operation function per mutation, each owning its cache update. The screen
 * and the command both call these, so the cache is updated one way only. A
 * `useMutation` with its own `update` would put that logic out of a command's reach.
 */

export async function getTodos(client: ApolloClient, source: "cache" | "network"): Promise<Todo[]> {
	const { data } = await client.query({
		query: TODOS,
		fetchPolicy: source === "cache" ? "cache-only" : "network-only",
	});
	return (data as { todos?: Todo[] } | null)?.todos ?? [];
}

export async function addTodo(
	client: ApolloClient,
	title: string,
	description?: string,
): Promise<Todo> {
	const { data, error } = await client.mutate({
		mutation: ADD_TODO,
		// An omitted description is sent as null, which the API stores as "".
		variables: { title, description: description ?? null },
		update(cache, { data }) {
			const added = (data as { addTodo?: Todo } | null)?.addTodo;
			if (!added) return;
			cache.modify({
				fields: {
					todos(existing: readonly Reference[] = []): readonly Reference[] {
						const ref = cache.writeFragment({ data: added, fragment: TODO_FIELDS });
						return ref ? [...existing, ref] : existing;
					},
				},
			});
		},
	});
	// With errorPolicy "all" the errors arrive here instead of being thrown, so
	// check either way: a command must fail when the mutation failed.
	if (error) throw error;
	return (data as { addTodo: Todo }).addTodo;
}

export async function setTodoDone(client: ApolloClient, id: string, done: boolean): Promise<Todo> {
	const { data, error } = await client.mutate({
		mutation: SET_TODO_DONE,
		variables: { id, done },
	});
	if (error) throw error;
	return (data as { setTodoDone: Todo }).setTodoDone;
}

export async function removeTodo(client: ApolloClient, id: string): Promise<string> {
	const { data, error } = await client.mutate({
		mutation: REMOVE_TODO,
		variables: { id },
		update(cache) {
			const cacheId = cache.identify({ __typename: "Todo", id });
			cache.modify({
				fields: {
					todos: (existing: readonly Reference[] = []): readonly Reference[] =>
						existing.filter((ref) => ref.__ref !== cacheId),
				},
			});
			cache.evict({ id: cacheId });
			cache.gc();
		},
	});
	if (error) throw error;
	return (data as { removeTodo: string }).removeTodo;
}
