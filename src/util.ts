import { AppState, Task, TaskItem } from './types.js';

export function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function convertJSON(inputData: {
  meta?: any;
  workflow?: any;
  nodes: {
    id: string;
    x: number;
    y: number;
    title: string;
    tasks: {
      id: string;
      description: string;
      isCompleted: boolean;
    }[];
  }[];
  edges: {
    source: string;
    target: string;
    sourceTaskId: string;
  }[];
}): AppState {
  const edges = inputData.edges || [];

  const tasks: Task[] = (inputData.nodes || []).map((node) => {
    const items: TaskItem[] = (node.tasks || []).map((task) => {
      const linkedEdge = edges.find((edge) => edge.sourceTaskId === task.id);

      const taskItem: TaskItem = {
        id: task.id,
        title: task.description,
        completed: task.isCompleted,
      };
      if (linkedEdge) {
        taskItem.linksTo = linkedEdge.target;
      }

      return taskItem;
    });

    return {
      id: node.id,
      title: node.title,
      x: node.x,
      y: node.y,
      items: items,
    };
  });

  return {
    tasks,
    settings: {
      alignment: inputData.workflow.layoutAlgorithm === 'D3_HIERARCHY' ? 'center' : 'free',
    },
  };
}
