export type TaskItem = {
  id: string;
  title: string;
  completed: boolean;
  linksTo?: string;
};

export type Task = {
  id: string;
  title: string;
  items: TaskItem[];
  x?: number;
  y?: number;
};

export type AppState = {
  tasks: Task[];
  settings?: {
    alignment: 'top' | 'center' | 'free';
  };
};
