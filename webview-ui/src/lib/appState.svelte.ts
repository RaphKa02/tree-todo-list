import type { Alignment, AppState as IAppState, Task } from "./types";
class AppState implements IAppState {
  tasks = $state<Task[]>([]);
  settings? = $state<{ alignment: Alignment; }>();

  dragState = $state({
    isDragging: false,
    taskId: null as string | null,
    startX: 0,
    startY: 0,
    cardStartX: 0,
    cardStartY: 0,
  });
}

export const appState = new AppState();