import type { Task } from '$lib/types';
export { convertJSON } from '$shared/util';

export function preventDefault<T extends Event>(fn?: (event: T) => void) {
  return function (event: T) {
    event.preventDefault();
    fn?.(event);
  };
}

export function stopPropagation(fn?: (event: MouseEvent) => void) {
  return function (event: MouseEvent) {
    event.stopPropagation();
    fn?.(event);
  };
}

export function once<T extends Event>(fn?: (event: T) => void) {
  return function (event: T) {
    fn?.(event);
    fn = undefined;
  };
}

export function calculateCompletion(task: Task) {
  if (!task.items || task.items.length === 0) return 0;
  const completedCount = task.items.filter((item) => item.completed).length;
  return Math.round((completedCount / task.items.length) * 100);
}

export function generateId() {
  return crypto.randomUUID();
}
