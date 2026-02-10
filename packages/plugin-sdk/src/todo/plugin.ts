export const todoPluginCode = `
const getInputValue = env.getInputValue;

function toggleAt(i) {
  const state = useState('appState', { todos: [] });
  const newTodos = state.todos.map((t, idx) =>
    idx === i ? { text: t.text, done: !t.done } : t
  );
  setState('appState', { todos: newTodos });
}

function removeAt(i) {
  const state = useState('appState', { todos: [] });
  const newTodos = state.todos.filter((_, idx) => idx !== i);
  setState('appState', { todos: newTodos });
}

export function main() {
  const state = useState('appState', { todos: [] });
  openWindow('https://example.com', { width: 600, height: 400 });

  const doneCount = state.todos.filter(t => t.done).length;

  const todoItems = state.todos.map((todo, i) =>
    div({ className: 'todo-item', id: 'todo-' + i }, [
      input({
        inputType: 'checkbox',
        checked: todo.done,
        id: 'check-' + i,
        onclick: 'toggle_' + i,
      }),
      div({ className: todo.done ? 'todo-text todo-done' : 'todo-text' }, [todo.text]),
      button({ id: 'remove-' + i, onclick: 'remove_' + i }, ['Remove']),
    ])
  );

  const listContent = todoItems.length > 0
    ? todoItems
    : [div({ id: 'empty-msg' }, ['No todos yet. Type a name and click Add.'])];

  return div({ id: 'todo-app' }, [
    div({ id: 'header' }, [
      input({
        inputType: 'text',
        id: 'new-todo-input',
        placeholder: 'What needs to be done?',
      }),
      button({ id: 'add-btn', onclick: 'addTodo' }, ['Add']),
    ]),
    div({ id: 'count' }, [
      state.todos.length === 0
        ? ''
        : doneCount + ' of ' + state.todos.length + ' completed',
    ]),
    div({ id: 'todo-list' }, listContent),
    div({ id: 'footer' }, [
      button({ id: 'finish-btn', onclick: 'finishApp' }, ['Finish']),
    ]),
  ]);
}

export function addTodo() {
  const text = getInputValue('new-todo-input');
  if (!text || !text.trim()) return;
  const state = useState('appState', { todos: [] });
  setState('appState', {
    todos: [...state.todos, { text: text.trim(), done: false }],
  });
}

export function toggle_0() { toggleAt(0); }
export function toggle_1() { toggleAt(1); }
export function toggle_2() { toggleAt(2); }
export function toggle_3() { toggleAt(3); }
export function toggle_4() { toggleAt(4); }
export function toggle_5() { toggleAt(5); }
export function toggle_6() { toggleAt(6); }
export function toggle_7() { toggleAt(7); }
export function toggle_8() { toggleAt(8); }
export function toggle_9() { toggleAt(9); }

export function remove_0() { removeAt(0); }
export function remove_1() { removeAt(1); }
export function remove_2() { removeAt(2); }
export function remove_3() { removeAt(3); }
export function remove_4() { removeAt(4); }
export function remove_5() { removeAt(5); }
export function remove_6() { removeAt(6); }
export function remove_7() { removeAt(7); }
export function remove_8() { removeAt(8); }
export function remove_9() { removeAt(9); }

export function finishApp() {
  const state = useState('appState', { todos: [] });
  done({
    todoCount: state.todos.length,
    completedCount: state.todos.filter(t => t.done).length,
    todos: state.todos.map(t => ({ text: t.text, done: t.done })),
  });
}
`;
