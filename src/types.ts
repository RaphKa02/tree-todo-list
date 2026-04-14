export type TaskItem = {
  id: string;
  title: string;
  completed: boolean;
  linksTo?: string; // Contains the ID of the linked Task
};

export type Task = {
  id: string;
  title: string;
  items: TaskItem[];
};

export type AppState = {
  tasks: Task[]; 
};
