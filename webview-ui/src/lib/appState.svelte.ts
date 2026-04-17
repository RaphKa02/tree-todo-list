import type { AppState as IAppState, Task } from "./types";
class AppState implements IAppState {
  tasks = $state<Task[]>([]);
  settings? = $state<{ alignment: "top" | "center" | "free"; }>();

}

export const appState = new AppState();