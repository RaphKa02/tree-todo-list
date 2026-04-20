import { AppState, Task } from '../shared/types.js';
import { convertJSON } from '../shared/util.js';

interface VsCodeApi {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

(function () {
  const vscode = acquireVsCodeApi();

  const app = document.getElementById('app') as HTMLElement;
  const container = document.getElementById('container') as HTMLElement;
  const canvas = document.getElementById('connections') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

  const icons = {
    add: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-plus-icon lucide-square-plus"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>`,
    fit: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-fullscreen-icon lucide-fullscreen"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect width="10" height="8" x="7" y="8" rx="1"/></svg>`,
    alignTop: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-align-start-horizontal-icon lucide-align-start-horizontal"><rect width="6" height="16" x="4" y="6" rx="2"/><rect width="6" height="9" x="14" y="6" rx="2"/><path d="M22 2H2"/></svg>`,
    alignCenter: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-align-center-horizontal-icon lucide-align-center-horizontal"><path d="M2 12h20"/><path d="M10 16v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4"/><path d="M10 8V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v4"/><path d="M20 16v1a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1"/><path d="M14 8V7c0-1.1.9-2 2-2h2a2 2 0 0 1 2 2v1"/></svg>`,
    alignFree: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-move-icon lucide-move"><path d="M12 2v20"/><path d="m15 19-3 3-3-3"/><path d="m19 9 3 3-3 3"/><path d="M2 12h20"/><path d="m5 9-3 3 3 3"/><path d="m9 5 3-3 3 3"/></svg>`,
    import: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-down-icon lucide-file-down"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/></svg>`,
  };

  const toolbar = document.createElement('div');
  toolbar.id = 'toolbar';

  const newRootBtn = document.createElement('button');
  newRootBtn.className = 'tool-btn';
  newRootBtn.innerHTML = icons.add;
  newRootBtn.title = 'New Root Task';
  newRootBtn.onclick = () => {
    const newId = `task-${generateId()}`;
    const newTask: Task = {
      id: newId,
      title: 'New Root Task',
      items: [],
    };
    if (state.settings?.alignment === 'free') {
      newTask.x = (window.innerWidth / 2 - offset.x) / scale - 125;
      newTask.y = (window.innerHeight / 2 - offset.y) / scale - 50;
    }
    state.tasks.push(newTask);
    pendingFocusId = `title-${newId}`;
    updateState();
  };

  const fitBtn = document.createElement('button');
  fitBtn.className = 'tool-btn';
  fitBtn.innerHTML = icons.fit;
  fitBtn.title = 'Fit to Screen';
  fitBtn.onclick = () => {
    fitToScreen();
    vscode.setState({ state, viewState: { scale, offset } });
  };

  const alignBtn = document.createElement('button');
  alignBtn.className = 'tool-btn';
  alignBtn.title = 'Toggle Alignment';
  alignBtn.onclick = () => {
    if (!state.settings) state.settings = { alignment: 'center' };
    const modes: ('top' | 'center' | 'free')[] = ['top', 'center', 'free'];
    const currentMode = state.settings.alignment;
    const nextMode = modes[(modes.indexOf(currentMode) + 1) % modes.length];

    if (nextMode === 'free') {
      state.tasks.forEach((task) => {
        if (task.x === undefined || task.y === undefined) {
          const card = document.getElementById(`card-${task.id}`);
          if (card) {
            const rect = card.getBoundingClientRect();
            task.x = (rect.left - offset.x) / scale;
            task.y = (rect.top - offset.y) / scale;
          } else {
            task.x = 0;
            task.y = 0;
          }
        }
      });
    }

    state.settings.alignment = nextMode;
    updateState();
  };

  const importBtn = document.createElement('button');
  importBtn.className = 'tool-btn';
  importBtn.innerHTML = icons.import;
  importBtn.title = 'Import JSON';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json';
  fileInput.style.display = 'none';
  fileInput.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        try {
          const imported = JSON.parse(content);
          const convertedState = convertJSON(imported);
          const filename = imported.workflow?.title || 'imported-todo';
          vscode.postMessage({ type: 'import', state: convertedState, filename });
        } catch (err) {
          vscode.postMessage({ type: 'error', message: 'Failed to parse imported JSON.' });
        }
      };
      reader.readAsText(file);
    }
  };
  document.body.appendChild(fileInput);
  importBtn.onclick = () => fileInput.click();

  toolbar.appendChild(newRootBtn);
  toolbar.appendChild(fitBtn);
  toolbar.appendChild(alignBtn);
  toolbar.appendChild(importBtn);
  app.appendChild(toolbar);

  let scale = 1;
  let offset = { x: 0, y: 0 };
  let isPanning = false;
  let startPan = { x: 0, y: 0 };
  let pendingFocusId: string | null = null;
  let isRendering = false;
  let globalMaxPasses = 10;
  let globalAutoReorderTasks = true;
  let hasInitiallyFitted = false;

  const previousState = vscode.getState();
  let state: AppState = previousState?.state || { tasks: [] };

  if (previousState?.viewState) {
    scale = previousState.viewState.scale;
    offset = previousState.viewState.offset;
    hasInitiallyFitted = true;
  }

  if (state.tasks.length > 0) {
    render();
  }

  window.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = -e.deltaY;
        const factor = 1.1;
        const newScale = delta > 0 ? scale * factor : scale / factor;

        if (newScale > 0.1 && newScale < 5) {
          const mouseX = e.clientX;
          const mouseY = e.clientY;
          offset.x = mouseX - (mouseX - offset.x) * (newScale / scale);
          offset.y = mouseY - (mouseY - offset.y) * (newScale / scale);
          scale = newScale;
          vscode.setState({ state, viewState: { scale, offset } });
          render();
        }
      } else if (!e.shiftKey) {
        offset.x -= e.deltaX;
        offset.y -= e.deltaY;
        vscode.setState({ state, viewState: { scale, offset } });
        render();
      }
    },
    { passive: false }
  );

  window.addEventListener('mousedown', (e) => {
    const activeEl = document.activeElement as HTMLElement;
    if (activeEl && (activeEl.contentEditable === 'true' || activeEl.tagName === 'INPUT')) {
      if (e.target !== activeEl) {
        activeEl.blur();
      }
    }

    if (
      e.button === 1 ||
      (e.button === 0 &&
        (e.altKey || e.target === container || e.target === document.body || e.target === app))
    ) {
      isPanning = true;
      startPan = { x: e.clientX - offset.x, y: e.clientY - offset.y };
      document.body.style.cursor = 'grabbing';
      e.preventDefault();
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (isPanning) {
      offset.x = e.clientX - startPan.x;
      offset.y = e.clientY - startPan.y;
      render();
    }
  });

  window.addEventListener('mouseup', () => {
    if (isPanning) {
      isPanning = false;
      document.body.style.cursor = 'default';
    }
  });

  window.addEventListener('message', (event) => {
    const {
      type,
      text,
      config,
    }: {
      type: string;
      text: string;
      config: {
        maxPasses: number;
        autoReorderTasks: boolean;
      };
    } = event.data;
    switch (type) {
      case 'update':
        if (config.maxPasses !== undefined) {
          globalMaxPasses = config.maxPasses;
        }
        if (config.autoReorderTasks !== undefined) {
          globalAutoReorderTasks = config.autoReorderTasks;
        }
        if (text) {
          try {
            state = JSON.parse(text);
          } catch (e) {
            vscode.postMessage({
              type: 'error',
              message:
                'Failed to parse .treetodo file. Please check for syntax errors in the source view.',
            });
            return;
          }
        } else {
          state = { tasks: [] };
        }
        vscode.setState({ state, viewState: { scale, offset } });
        render();

        if (!hasInitiallyFitted && state.tasks.length > 0) {
          fitToScreen();
          hasInitiallyFitted = true;
        }
        break;
    }
  });

  vscode.postMessage({ type: 'ready' });

  function updateState() {
    const maxPasses = Math.max(1, globalMaxPasses);
    for (let pass = 0; pass < maxPasses; pass++) {
      let changed = false;
      state.tasks.forEach((task) => {
        task.items.forEach((item) => {
          if (item.linksTo) {
            const linkedTask = state.tasks.find((t) => t.id === item.linksTo);
            if (linkedTask) {
              if (item.title !== linkedTask.title) {
                item.title = linkedTask.title;
                changed = true;
              }
              const isLinkedTaskComplete = calculateCompletion(linkedTask) === 100;
              if (item.completed !== isLinkedTaskComplete) {
                item.completed = isLinkedTaskComplete;
                changed = true;
              }
            }
          }
        });
      });
      if (!changed) break;
    }

    if (globalAutoReorderTasks) {
      reorderTasks();
    }

    vscode.postMessage({ type: 'update', state });
    render();
  }

  function reorderTasks() {
    const orderedTasks: Task[] = [];
    const visited = new Set<string>();

    function visit(taskId: string) {
      if (visited.has(taskId)) return;
      visited.add(taskId);
      const task = state.tasks.find((t) => t.id === taskId);
      if (task) {
        orderedTasks.push(task);
        task.items.forEach((item) => {
          if (item.linksTo) {
            visit(item.linksTo);
          }
        });
      }
    }

    const allTargetIds = new Set<string>();
    state.tasks.forEach((t) => t.items.forEach((i) => i.linksTo && allTargetIds.add(i.linksTo)));

    state.tasks.forEach((task) => {
      if (!allTargetIds.has(task.id)) {
        visit(task.id);
      }
    });

    state.tasks.forEach((task) => {
      if (!visited.has(task.id)) {
        visit(task.id);
      }
    });

    state.tasks = orderedTasks;
  }

  function calculateCompletion(task: Task): number {
    if (!task.items || task.items.length === 0) return 0;
    const completedCount = task.items.filter((item) => item.completed).length;
    return Math.round((completedCount / task.items.length) * 100);
  }

  function getTaskDepth(): Map<string, number> {
    const depths = new Map<string, number>();

    function setDepth(taskId: string, depth: number) {
      const currentDepth = depths.get(taskId) ?? -1;
      if (depth > currentDepth) {
        depths.set(taskId, depth);
        const task = state.tasks.find((t) => t.id === taskId);
        if (task) {
          task.items.forEach((item) => {
            if (item.linksTo) {
              setDepth(item.linksTo, depth + 1);
            }
          });
        }
      }
    }

    const allTargetIds = new Set<string>();
    state.tasks.forEach((t) => t.items.forEach((i) => i.linksTo && allTargetIds.add(i.linksTo)));

    state.tasks.forEach((task) => {
      if (!allTargetIds.has(task.id)) {
        setDepth(task.id, 0);
      }
    });

    return depths;
  }

  function render() {
    isRendering = true;
    try {
      const activeEl = document.activeElement as HTMLElement;
      let activeId = activeEl ? activeEl.id : null;
      let selectionStart =
        activeEl instanceof HTMLDivElement ? window.getSelection()?.anchorOffset : null;

      if (pendingFocusId) {
        activeId = pendingFocusId;
        selectionStart = null;
      }
      const currentAlign = state.settings?.alignment || 'center';
      if (currentAlign === 'top') {
        alignBtn.innerHTML = icons.alignTop;
        alignBtn.title = 'Align Top';
      } else if (currentAlign === 'center') {
        alignBtn.innerHTML = icons.alignCenter;
        alignBtn.title = 'Align Center';
      } else {
        alignBtn.innerHTML = icons.alignFree;
        alignBtn.title = 'Free Mode';
      }

      container.innerHTML = '';

      container.style.transform = `translate(${offset.x}px, ${offset.y}px) scale(${scale})`;
      container.style.transformOrigin = '0 0';
      container.style.alignItems = currentAlign === 'center' ? 'center' : 'flex-start';
      container.style.display = currentAlign === 'free' ? 'block' : 'flex';

      const depths = getTaskDepth();
      const maxDepth = Math.max(0, ...Array.from(depths.values()));

      if (currentAlign !== 'free') {
        const columns: HTMLElement[] = [];
        for (let i = 0; i <= maxDepth; i++) {
          const colDiv = document.createElement('div');
          colDiv.className = 'column';
          colDiv.dataset.depth = i.toString();
          columns.push(colDiv);
          container.appendChild(colDiv);
        }

        state.tasks.forEach((task) => {
          const depth = depths.get(task.id) ?? 0;
          const card = createCard(task);
          if (columns[depth]) {
            columns[depth].appendChild(card);
          }
        });
      } else {
        state.tasks.forEach((task) => {
          const card = createCard(task);
          card.style.position = 'absolute';
          card.style.left = `${task.x || 0}px`;
          card.style.top = `${task.y || 0}px`;
          container.appendChild(card);
        });
      }

      requestAnimationFrame(drawConnections);

      if (activeId) {
        const el = document.getElementById(activeId);
        if (el instanceof HTMLElement) {
          el.focus();

          if (activeId === pendingFocusId) {
            pendingFocusId = null;
          }

          const selection = window.getSelection();
          const range = document.createRange();

          if (el.childNodes.length > 0) {
            const node = el.childNodes[0];
            if (selectionStart !== null && selectionStart !== undefined) {
              const offset = Math.min(selectionStart, node.textContent?.length || 0);
              range.setStart(node, offset);
              range.collapse(true);
            } else {
              range.selectNodeContents(el);
            }
            selection?.removeAllRanges();
            selection?.addRange(range);
          } else {
            range.setStart(el, 0);
            range.collapse(true);
            selection?.removeAllRanges();
            selection?.addRange(range);
          }
        }
      }
    } finally {
      isRendering = false;
    }
  }

  function fitToScreen() {
    const cards = document.querySelectorAll('.card');
    if (cards.length === 0) return;

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    cards.forEach((card) => {
      const rect = card.getBoundingClientRect();
      const x = (rect.left - offset.x) / scale;
      const y = (rect.top - offset.y) / scale;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + rect.width / scale);
      maxY = Math.max(maxY, y + rect.height / scale);
    });

    const padding = 100;
    const contentW = maxX - minX + padding * 2;
    const contentH = maxY - minY + padding * 2;
    const newScale = Math.min(window.innerWidth / contentW, window.innerHeight / contentH, 1.0);
    scale = Math.max(0.2, newScale);
    offset.x = (window.innerWidth - (maxX - minX) * scale) / 2 - minX * scale;
    offset.y = (window.innerHeight - (maxY - minY) * scale) / 2 - minY * scale;
    render();
  }

  function generateId() {
    return crypto.randomUUID();
  }

  function deleteTaskRecursive(taskId: string) {
    const taskToDelete = state.tasks.find((t) => t.id === taskId);
    if (!taskToDelete) return;

    const linkedIds = taskToDelete.items
      .filter((item) => item.linksTo)
      .map((item) => item.linksTo as string);

    state.tasks = state.tasks.filter((t) => t.id !== taskId);

    state.tasks.forEach((t) => {
      t.items.forEach((item) => {
        if (item.linksTo === taskId) {
          delete item.linksTo;
        }
      });
    });

    linkedIds.forEach((id) => deleteTaskRecursive(id));
  }

  function createCard(task: Task): HTMLElement {
    const progress = calculateCompletion(task);
    const card = document.createElement('div');
    card.className = `card ${progress === 100 ? 'completed' : ''}`;
    card.id = `card-${task.id}`;
    card.dataset.taskId = task.id;

    const header = document.createElement('div');
    header.className = 'card-header';

    const title = document.createElement('div');
    title.className = 'title';
    title.id = `title-${task.id}`;
    title.contentEditable = 'true';
    title.textContent = task.title;
    title.onblur = (e) => {
      const newTitle = (e.target as HTMLElement).textContent || '';
      if (task.title !== newTitle) {
        task.title = newTitle;
        updateState();
      }
    };
    title.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        (e.target as HTMLElement).blur();
      }
    };

    const deleteBtn = document.createElement('div');
    deleteBtn.className = 'delete-task-btn';
    deleteBtn.innerHTML = '✕';
    deleteBtn.title = 'Delete task and all subtasks';
    deleteBtn.onclick = () => {
      deleteTaskRecursive(task.id);
      updateState();
    };

    header.appendChild(title);
    header.appendChild(deleteBtn);
    card.appendChild(header);

    if (Array.from(getTaskDepth().values()).some((d) => d > 0)) {
      const inPort = document.createElement('div');
      inPort.className = 'in-port';
      card.appendChild(inPort);
    }

    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'card-items';
    task.items.forEach((item, index) => {
      const itemRow = document.createElement('div');
      itemRow.className = 'item-row';
      itemRow.draggable = true;
      itemRow.dataset.index = index.toString();

      const itemHandle = document.createElement('div');
      itemHandle.className = 'drag-handle';
      itemHandle.textContent = '⠿';

      const itemDiv = document.createElement('div');
      itemDiv.className = 'item';

      const toggle = document.createElement('div');
      toggle.className = `item-toggle ${item.completed ? 'completed' : ''} ${item.linksTo ? 'disabled' : ''}`;
      toggle.onclick = () => {
        if (item.linksTo) return;
        item.completed = !item.completed;
        updateState();
      };

      const itemTitle = document.createElement('div');
      itemTitle.className = 'item-title';
      itemTitle.id = `item-title-${task.id}-${item.id}`;
      itemTitle.contentEditable = item.linksTo ? 'false' : 'true';
      itemTitle.textContent = item.title;
      itemTitle.onblur = (e) => {
        if (isRendering || item.linksTo) return;
        const newTitle = (e.target as HTMLElement).textContent?.trim() || '';

        if (newTitle === '' && index === task.items.length - 1) {
          task.items.splice(index, 1);
          updateState();
          return;
        }

        if (item.title !== newTitle) {
          item.title = newTitle;
          updateState();
        }
      };
      itemTitle.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (index === task.items.length - 1) {
            item.title = (e.target as HTMLElement).textContent || '';
            const newItemId = `item-${generateId()}`;
            task.items.push({
              id: newItemId,
              title: '',
              completed: false,
            });
            pendingFocusId = `item-title-${task.id}-${newItemId}`;
            updateState();
          } else {
            (e.target as HTMLElement).blur();
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          (e.target as HTMLElement).blur();
        }
      };

      itemDiv.appendChild(toggle);
      itemDiv.appendChild(itemTitle);

      itemRow.appendChild(itemHandle);
      itemRow.appendChild(itemDiv);

      const actions = document.createElement('div');
      actions.className = 'item-actions';

      if (!item.linksTo) {
        const linkBtn = document.createElement('div');
        linkBtn.className = 'action-btn';
        linkBtn.innerHTML = '🔗';
        linkBtn.title = 'Link to new task';
        linkBtn.onclick = () => {
          const newTaskId = `task-${generateId()}`;
          const newTask: Task = {
            id: newTaskId,
            title: item.title,
            items: [],
          };
          if (state.settings?.alignment === 'free') {
            const cardRect = card.getBoundingClientRect();
            newTask.x = (cardRect.right - offset.x) / scale + 100;
            newTask.y = (cardRect.top - offset.y) / scale;
          }
          state.tasks.push(newTask);
          item.linksTo = newTaskId;
          pendingFocusId = `title-${newTaskId}`;
          updateState();
        };
        actions.appendChild(linkBtn);
      }

      const delItemBtn = document.createElement('div');
      delItemBtn.className = 'action-btn';
      delItemBtn.innerHTML = '🗑️';
      delItemBtn.title = 'Delete item';
      delItemBtn.onclick = () => {
        task.items.splice(index, 1);
        updateState();
      };

      actions.appendChild(delItemBtn);
      itemRow.appendChild(actions);

      if (item.linksTo) {
        const port = document.createElement('div');
        port.className = 'port item-port';
        port.id = `port-${task.id}-${item.id}`;
        itemRow.appendChild(port);
      }

      let isItemHandleDragging = false;
      itemHandle.onmousedown = () => (isItemHandleDragging = true);
      itemHandle.onmouseup = () => (isItemHandleDragging = false);

      itemRow.ondragstart = (e) => {
        if (!isItemHandleDragging) {
          e.preventDefault();
          return;
        }
        e.stopPropagation();
        e.dataTransfer?.setData(
          'application/json',
          JSON.stringify({ type: 'item', taskId: task.id, index })
        );
        itemRow.classList.add('dragging');
      };
      itemRow.ondragend = () => {
        itemRow.classList.remove('dragging');
        isItemHandleDragging = false;
      };
      itemRow.ondragover = (e) => {
        if (e.dataTransfer?.types.includes('application/json')) {
          e.preventDefault();
        }
      };
      itemRow.ondrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const rawData = e.dataTransfer?.getData('application/json');
        if (!rawData) return;
        const data = JSON.parse(rawData);
        if (data.type === 'item' && data.taskId === task.id) {
          const fromIndex = data.index;
          const toIndex = index;
          const [movedItem] = task.items.splice(fromIndex, 1);
          task.items.splice(toIndex, 0, movedItem);
          updateState();
        }
      };

      itemsContainer.appendChild(itemRow);
    });
    card.appendChild(itemsContainer);

    const addItemBtn = document.createElement('div');
    addItemBtn.className = 'add-item-btn';
    addItemBtn.innerHTML = '+ Add item';
    addItemBtn.onclick = () => {
      const newItemId = `item-${generateId()}`;
      task.items.push({
        id: newItemId,
        title: '',
        completed: false,
      });
      pendingFocusId = `item-title-${task.id}-${newItemId}`;
      updateState();
    };
    card.appendChild(addItemBtn);

    const progressContainer = document.createElement('div');
    progressContainer.className = 'progress-container';
    progressContainer.innerHTML = `
            <span>${progress}%</span>
            <div class="circular-progress">
                <svg viewBox="0 0 36 36">
                    <circle class="bg" cx="18" cy="18" r="16"></circle>
                    <circle class="fg" cx="18" cy="18" r="16" style="stroke-dashoffset: ${100 - progress}"></circle>
                </svg>
            </div>
        `;
    card.appendChild(progressContainer);

    let isCardHandleDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let cardStartX = 0;
    let cardStartY = 0;

    card.onmousedown = (e) => {
      const target = e.target as HTMLElement;
      if (
        target.isContentEditable ||
        target.closest('.action-btn') ||
        target.closest('.delete-task-btn') ||
        target.closest('.add-item-btn') ||
        target.closest('.item-toggle') ||
        target.closest('.drag-handle')
      ) {
        return;
      }
      isCardHandleDragging = true;
      if (state.settings?.alignment === 'free') {
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        cardStartX = task.x || 0;
        cardStartY = task.y || 0;

        const onMouseMove = (moveEvent: MouseEvent) => {
          if (isCardHandleDragging) {
            const dx = (moveEvent.clientX - dragStartX) / scale;
            const dy = (moveEvent.clientY - dragStartY) / scale;
            task.x = cardStartX + dx;
            task.y = cardStartY + dy;
            card.style.left = `${task.x}px`;
            card.style.top = `${task.y}px`;
            requestAnimationFrame(drawConnections);
          }
        };

        const onMouseUp = () => {
          isCardHandleDragging = false;
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
          vscode.setState({ state, viewState: { scale, offset } });
          updateState();
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        e.stopPropagation();
      }
    };
    card.onmouseup = () => {
      if (state.settings?.alignment !== 'free') {
        isCardHandleDragging = false;
      }
    };

    return card;
  }

  function drawConnections() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const style = getComputedStyle(document.body);
    const connectionColor =
      style.getPropertyValue('--connection-color').trim() || 'rgba(255, 255, 255, 0.4)';
    const portColor = style.getPropertyValue('--port-bg').trim() || 'white';

    ctx.strokeStyle = connectionColor;
    ctx.lineWidth = 2;

    state.tasks.forEach((task) => {
      task.items.forEach((item) => {
        if (item.linksTo) {
          const fromPort = document.getElementById(`port-${task.id}-${item.id}`);
          const toCard = document.getElementById(`card-${item.linksTo}`);

          if (fromPort && toCard) {
            const fromRect = fromPort.getBoundingClientRect();
            const toPort = toCard.querySelector('.in-port');
            if (!toPort) return;
            const toRect = toPort.getBoundingClientRect();

            const startX = fromRect.left + fromRect.width / 2;
            const startY = fromRect.top + fromRect.height / 2;
            const endX = toRect.left + toRect.width / 2;
            const endY = toRect.top + toRect.height / 2;

            const cp1x = startX + (endX - startX) / 2;
            const cp1y = startY;
            const cp2x = startX + (endX - startX) / 2;
            const cp2y = endY;

            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);
            ctx.stroke();

            ctx.fillStyle = portColor;
            ctx.beginPath();
            ctx.arc(endX, endY, 4, 0, Math.PI * 2);
            ctx.fill();

            ctx.beginPath();
            ctx.arc(startX, startY, 4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      });
    });
  }

  window.addEventListener('resize', () => {
    requestAnimationFrame(drawConnections);
  });

  container.addEventListener('scroll', () => {
    requestAnimationFrame(drawConnections);
  });
})();
