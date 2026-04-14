import { AppState, Task } from '../types.js';

interface VsCodeApi {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

(function () {
  const vscode = acquireVsCodeApi();

  const container = document.getElementById('container') as HTMLElement;
  const canvas = document.getElementById('connections') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

  let scale = 1;
  let offset = { x: 0, y: 0 };
  let isPanning = false;
  let startPan = { x: 0, y: 0 };
  let pendingFocusId: string | null = null;
  let isRendering = false;

  const previousState = vscode.getState();
  let state: AppState = previousState || { tasks: [] };

  if (previousState) {
    render();
  }

  // Zoom handling
  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = -e.deltaY;
      const factor = 1.1;
      const newScale = delta > 0 ? scale * factor : scale / factor;

      // Limit scale
      if (newScale > 0.1 && newScale < 5) {
        const mouseX = e.clientX;
        const mouseY = e.clientY;

        // Adjust offset to zoom towards mouse position
        offset.x = mouseX - (mouseX - offset.x) * (newScale / scale);
        offset.y = mouseY - (mouseY - offset.y) * (newScale / scale);

        scale = newScale;
        render();
      }
    } else if (!e.shiftKey) {
      // Standard scroll translates to pan
      offset.x -= e.deltaX;
      offset.y -= e.deltaY;
      render();
    }
  }, { passive: false });

  // Pan handling
  window.addEventListener('mousedown', (e) => {
    // Pan with middle mouse or Alt + left click or left click on background
    if (e.button === 1 || (e.button === 0 && (e.altKey || e.target === container || e.target === document.body || e.target === document.getElementById('app')))) {
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

  window.addEventListener('message', event => {
    const message = event.data;
    switch (message.type) {
      case 'update':
        if (message.text) {
          state = JSON.parse(message.text);
        } else {
          state = { tasks: [] };
        }
        vscode.setState(state);
        render();
        break;
    }
  });

  vscode.postMessage({ type: 'ready' });

  function updateState() {
    const maxPasses = 10;
    for (let pass = 0; pass < maxPasses; pass++) {
      let changed = false;
      state.tasks.forEach(task => {
        task.items.forEach(item => {
          if (item.linksTo) {
            const linkedTask = state.tasks.find(t => t.id === item.linksTo);
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

    vscode.postMessage({ type: 'update', state });
    render();
  }

  function calculateCompletion(task: Task): number {
    if (!task.items || task.items.length === 0) return 0;
    const completedCount = task.items.filter(item => item.completed).length;
    return Math.round((completedCount / task.items.length) * 100);
  }

  function getTaskDepth(): Map<string, number> {
    const depths = new Map<string, number>();

    function setDepth(taskId: string, depth: number) {
      const currentDepth = depths.get(taskId) ?? -1;
      if (depth > currentDepth) {
        depths.set(taskId, depth);
        const task = state.tasks.find(t => t.id === taskId);
        if (task) {
          task.items.forEach(item => {
            if (item.linksTo) {
              setDepth(item.linksTo, depth + 1);
            }
          });
        }
      }
    }

    const allTargetIds = new Set<string>();
    state.tasks.forEach(t => t.items.forEach(i => i.linksTo && allTargetIds.add(i.linksTo)));

    state.tasks.forEach(task => {
      if (!allTargetIds.has(task.id)) {
        setDepth(task.id, 0);
      }
    });

    return depths;
  }

  function render() {
    isRendering = true;
    try {
      let activeId = document.activeElement ? document.activeElement.id : null;
      const selectionStart = (document.activeElement instanceof HTMLDivElement) ? window.getSelection()?.anchorOffset : null;

      if (pendingFocusId) {
        activeId = pendingFocusId;
        pendingFocusId = null;
      }

      container.innerHTML = '';

      // Apply transform to container
      container.style.transform = `translate(${offset.x}px, ${offset.y}px) scale(${scale})`;
      container.style.transformOrigin = '0 0';

      const depths = getTaskDepth();
      const maxDepth = Math.max(0, ...Array.from(depths.values()));

      const columns: HTMLElement[] = [];
      for (let i = 0; i <= maxDepth; i++) {
        const colDiv = document.createElement('div');
        colDiv.className = 'column';
        colDiv.dataset.depth = i.toString();
        columns.push(colDiv);
        container.appendChild(colDiv);
      }

      state.tasks.forEach(task => {
        const depth = depths.get(task.id) ?? 0;
        const card = createCard(task);
        if (columns[depth]) {
          columns[depth].appendChild(card);
        }
      });

      requestAnimationFrame(drawConnections);

      if (activeId) {
        const el = document.getElementById(activeId);
        if (el instanceof HTMLElement) {
          el.focus();
          const selection = window.getSelection();
          const range = document.createRange();

          if (el.childNodes.length > 0) {
            const node = el.childNodes[0];
            if (selectionStart) {
              const offset = Math.min(selectionStart, node.textContent?.length || 0);
              range.setStart(node, offset);
              range.collapse(true);
            }
            selection?.removeAllRanges();
            selection?.addRange(range);
          }
        }
      }
    } finally {
      isRendering = false;
    }
  }

  function generateId() {
    return Math.random().toString(36).substr(2, 9);
  }

  function deleteTaskRecursive(taskId: string) {
    const taskToDelete = state.tasks.find(t => t.id === taskId);
    if (!taskToDelete) return;

    const linkedIds = taskToDelete.items
      .filter(item => item.linksTo)
      .map(item => item.linksTo as string);

    state.tasks = state.tasks.filter(t => t.id !== taskId);

    state.tasks.forEach(t => {
      t.items.forEach(item => {
        if (item.linksTo === taskId) {
          delete item.linksTo;
        }
      });
    });

    linkedIds.forEach(id => deleteTaskRecursive(id));
  }

  function createCard(task: Task): HTMLElement {
    const progress = calculateCompletion(task);
    const card = document.createElement('div');
    card.className = `card ${progress === 100 ? 'completed' : ''}`;
    card.id = `card-${task.id}`;
    card.dataset.taskId = task.id;
    card.draggable = true;

    const header = document.createElement('div');
    header.className = 'card-header';

    const headerLeft = document.createElement('div');
    headerLeft.className = 'card-header-left';

    const handle = document.createElement('div');
    handle.className = 'drag-handle';
    handle.textContent = '⠿';

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

    headerLeft.appendChild(handle);
    headerLeft.appendChild(title);

    const deleteBtn = document.createElement('div');
    deleteBtn.className = 'delete-task-btn';
    deleteBtn.innerHTML = '✕';
    deleteBtn.title = 'Delete task and all subtasks';
    deleteBtn.onclick = () => {
      deleteTaskRecursive(task.id);
      updateState();
    };

    header.appendChild(headerLeft);
    header.appendChild(deleteBtn);
    card.appendChild(header);

    if (Array.from(getTaskDepth().values()).some(d => d > 0)) {
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
              completed: false
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

      const linkBtn = document.createElement('div');
      linkBtn.className = 'action-btn';
      linkBtn.innerHTML = '🔗';
      linkBtn.title = item.linksTo ? 'Go to linked task' : 'Link to new task';
      linkBtn.onclick = () => {
        if (!item.linksTo) {
          const newTaskId = `task-${generateId()}`;
          state.tasks.push({
            id: newTaskId,
            title: item.title,
            items: []
          });
          item.linksTo = newTaskId;
          updateState();
        }
      };

      const delItemBtn = document.createElement('div');
      delItemBtn.className = 'action-btn';
      delItemBtn.innerHTML = '🗑️';
      delItemBtn.title = 'Delete item';
      delItemBtn.onclick = () => {
        task.items.splice(index, 1);
        updateState();
      };

      actions.appendChild(linkBtn);
      actions.appendChild(delItemBtn);
      itemRow.appendChild(actions);

      if (item.linksTo) {
        const port = document.createElement('div');
        port.className = 'port item-port';
        port.id = `port-${task.id}-${item.id}`;
        itemRow.appendChild(port);
      }

      // Drag and Drop Items
      let isItemHandleDragging = false;
      itemHandle.onmousedown = () => isItemHandleDragging = true;
      itemHandle.onmouseup = () => isItemHandleDragging = false;

      itemRow.ondragstart = (e) => {
        if (!isItemHandleDragging) {
          e.preventDefault();
          return;
        }
        e.stopPropagation();
        e.dataTransfer?.setData('application/json', JSON.stringify({ type: 'item', taskId: task.id, index }));
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
        completed: false
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

    // Drag and Drop Cards
    let isCardHandleDragging = false;
    handle.onmousedown = () => isCardHandleDragging = true;
    handle.onmouseup = () => isCardHandleDragging = false;

    card.ondragstart = (e) => {
      if (!isCardHandleDragging || e.target !== card) {
        e.preventDefault();
        return;
      }
      e.dataTransfer?.setData('application/json', JSON.stringify({ type: 'card', taskId: task.id }));
      card.classList.add('dragging-card');
    };
    card.ondragend = () => {
      card.classList.remove('dragging-card');
      isCardHandleDragging = false;
    };
    card.ondragover = (e) => {
      if (e.dataTransfer?.types.includes('application/json')) {
        e.preventDefault();
      }
    };
    card.ondrop = (e) => {
      e.preventDefault();
      const rawData = e.dataTransfer?.getData('application/json');
      if (!rawData) return;
      const data = JSON.parse(rawData);
      if (data.type === 'card' && data.taskId !== task.id) {
        const fromIndex = state.tasks.findIndex(t => t.id === data.taskId);
        const toIndex = state.tasks.findIndex(t => t.id === task.id);
        if (fromIndex !== -1 && toIndex !== -1) {
          const [movedTask] = state.tasks.splice(fromIndex, 1);
          state.tasks.splice(toIndex, 0, movedTask);
          updateState();
        }
      }
    };

    return card;
  }

  function drawConnections() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 2;

    state.tasks.forEach(task => {
      task.items.forEach(item => {
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

            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
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
