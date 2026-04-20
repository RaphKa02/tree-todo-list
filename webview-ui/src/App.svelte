<script lang="ts">
  import { appState } from '$lib/appState.svelte';
  import TaskCard from '$lib/components/TaskCard.svelte';
  import Toolbar from '$lib/components/Toolbar.svelte';
  import type { Alignment, Task } from '$lib/types';
  import { calculateCompletion, convertJSON, generateId } from '$lib/util';
  import { onMount } from 'svelte';

  // VS Code API
  interface VsCodeApi {
    postMessage(message: any): void;
    getState(): any;
    setState(state: any): void;
  }
  let vscode: VsCodeApi;
  try {
    // @ts-ignore
    vscode = acquireVsCodeApi();
  } catch (e) {
    // Mock for browser testing outside of VS Code
    vscode = { postMessage: () => {}, getState: () => ({}), setState: () => {} };
  }

  let app: HTMLElement;
  let container: HTMLElement;
  let canvas: HTMLCanvasElement;

  let scale = $state(1);
  let offset = $state({ x: 0, y: 0 });
  let isPanning = false;
  let startPan = { x: 0, y: 0 };
  let pendingFocusId: string | null = $state(null);
  let preservedSelection: { id: string; offset: number } | null = null;
  let globalMaxPasses = 10;
  let globalAutoReorderTasks = true;
  let hasInitiallyFitted = false;

  const previousState = vscode.getState();
  if (previousState?.state) {
    appState.tasks = previousState.state.tasks || [];
    appState.settings = previousState.state.settings;
  }

  if (previousState?.viewState) {
    scale = previousState.viewState.scale;
    offset = previousState.viewState.offset;
    hasInitiallyFitted = true;
  }

  const currentAlign = $derived<Alignment>(appState.settings?.alignment || 'center');

  const depths = $derived(getTaskDepth(appState.tasks));
  const maxDepth = $derived(Math.max(0, ...Array.from(depths.values())));

  onMount(() => {
    vscode.postMessage({ type: 'ready' });
    if (appState.tasks.length > 0 && !hasInitiallyFitted) {
      fitToScreen();
      hasInitiallyFitted = true;
    } else {
      requestAnimationFrame(drawConnections);
    }
  });

  $effect(() => {
    let focusId = pendingFocusId || preservedSelection?.id;
    if (focusId) {
      const el = document.getElementById(focusId);
      if (el) {
        el.focus();
        const selection = window.getSelection();
        const range = document.createRange();

        if (el.childNodes.length > 0) {
          const node = el.childNodes[0];
          let offset = 0;
          if (pendingFocusId) {
            offset = node.textContent?.length || 0;
          } else if (preservedSelection) {
            offset = Math.min(preservedSelection.offset, node.textContent?.length || 0);
          }
          range.setStart(node, offset);
          range.collapse(true);
        } else {
          range.setStart(el, 0);
          range.collapse(true);
        }
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      pendingFocusId = null;
      preservedSelection = null;
    }
    requestAnimationFrame(drawConnections);
  });

  function setState(state?: any) {
    vscode.setState({
      state: state || {
        tasks: $state.snapshot(appState.tasks),
        settings: $state.snapshot(appState.settings),
      },
      viewState: { scale, offset },
    });
    requestAnimationFrame(drawConnections);
  }

  function updateState() {
    const maxPasses = Math.max(1, globalMaxPasses);
    for (let pass = 0; pass < maxPasses; pass++) {
      let changed = false;
      appState.tasks.forEach((task) => {
        task.items.forEach((item) => {
          if (item.linksTo) {
            const linkedTask = appState.tasks.find((t) => t.id === item.linksTo);
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

    if (globalAutoReorderTasks) reorderTasks();

    const saveState = {
      tasks: $state.snapshot(appState.tasks),
      settings: $state.snapshot(appState.settings),
    };

    vscode.postMessage({ type: 'update', state: saveState });
    setState(saveState);
  }

  function reorderTasks() {
    const orderedTasks: Task[] = [];
    const visited = new Set<string>();

    function visit(taskId: string) {
      if (visited.has(taskId)) return;
      visited.add(taskId);
      const task = appState.tasks.find((t) => t.id === taskId);
      if (task) {
        orderedTasks.push(task);
        task.items.forEach((item) => {
          if (item.linksTo) visit(item.linksTo);
        });
      }
    }

    const allTargetIds = new Set<string>();
    appState.tasks.forEach((t) => t.items.forEach((i) => i.linksTo && allTargetIds.add(i.linksTo)));

    appState.tasks.forEach((task) => {
      if (!allTargetIds.has(task.id)) visit(task.id);
    });
    appState.tasks.forEach((task) => {
      if (!visited.has(task.id)) visit(task.id);
    });

    appState.tasks = orderedTasks;
  }

  function getTaskDepth(tasks: Task[]): Map<string, number> {
    const depthsMap = new Map<string, number>();

    function setDepth(taskId: string, depth: number) {
      const currentDepth = depthsMap.get(taskId) ?? -1;
      if (depth > currentDepth) {
        depthsMap.set(taskId, depth);
        const task = tasks.find((t) => t.id === taskId);
        if (task) {
          task.items.forEach((item) => {
            if (item.linksTo) setDepth(item.linksTo, depth + 1);
          });
        }
      }
    }

    const allTargetIds = new Set<string>();
    tasks.forEach((t) => t.items.forEach((i) => i.linksTo && allTargetIds.add(i.linksTo)));

    tasks.forEach((task) => {
      if (!allTargetIds.has(task.id)) setDepth(task.id, 0);
    });

    return depthsMap;
  }

  function deleteTaskRecursive(taskId: string) {
    const taskToDelete = appState.tasks.find((t) => t.id === taskId);
    if (!taskToDelete) return;

    const linkedIds = taskToDelete.items
      .filter((item) => item.linksTo)
      .map((item) => item.linksTo as string);

    appState.tasks = appState.tasks.filter((t) => t.id !== taskId);

    appState.tasks.forEach((t) => {
      t.items.forEach((item) => {
        if (item.linksTo === taskId) delete item.linksTo;
      });
    });

    linkedIds.forEach((id) => deleteTaskRecursive(id));
  }

  async function fitToScreen() {
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
    setState();
  }

  function drawConnections() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const style = getComputedStyle(document.body);
    const connectionColor =
      style.getPropertyValue('--connection-color').trim() || 'rgba(255, 255, 255, 0.4)';
    const portColor = style.getPropertyValue('--port-bg').trim() || 'white';

    ctx.strokeStyle = connectionColor;
    ctx.lineWidth = 2;

    appState.tasks.forEach((task) => {
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

  function handleImport(e: Event) {
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
  }

  // --- Window Events ---
  function handleMessage(event: MessageEvent) {
    const { type, text, config } = event.data;
    if (type === 'update') {
      const activeEl = document.activeElement as HTMLElement;
      if (activeEl && (activeEl.isContentEditable || activeEl.tagName === 'INPUT')) {
        const selection = window.getSelection();
        preservedSelection = {
          id: activeEl.id,
          offset: selection?.anchorOffset || 0,
        };
      }

      if (config.maxPasses !== undefined) globalMaxPasses = config.maxPasses;
      if (config.autoReorderTasks !== undefined) globalAutoReorderTasks = config.autoReorderTasks;
      if (text) {
        try {
          const newState = JSON.parse(text);
          appState.tasks = newState.tasks || [];
          appState.settings = newState.settings;
        } catch (e) {
          vscode.postMessage({
            type: 'error',
            message:
              'Failed to parse .treetodo file. Please check for syntax errors in the source view.',
          });
          return;
        }
      } else {
        appState.tasks = [];
      }
      if (!hasInitiallyFitted && appState.tasks.length > 0) {
        fitToScreen();
        hasInitiallyFitted = true;
        return;
      }
      setState();
    }
  }

  function handleWheel(e: WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      const delta = -e.deltaY;
      const factor = 1.1;
      const newScale = delta > 0 ? scale * factor : scale / factor;

      if (newScale > 0.1 && newScale < 5) {
        const mouseX = e.clientX;
        const mouseY = e.clientY;
        offset.x = mouseX - (mouseX - offset.x) * (newScale / scale);
        offset.y = mouseY - (mouseY - offset.y) * (newScale / scale);
        scale = newScale;
      }
    } else if (e.shiftKey) {
      offset.x -= e.deltaY;
      offset.y -= e.deltaX;
    } else {
      offset.x -= e.deltaX;
      offset.y -= e.deltaY;
    }
    setState();
  }

  function handleWindowMouseDown(e: MouseEvent) {
    const activeEl = document.activeElement as HTMLElement;
    if (activeEl && (activeEl.isContentEditable || activeEl.tagName === 'INPUT')) {
      if (e.target !== activeEl) activeEl.blur();
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
  }

  function handleWindowMouseMove(e: MouseEvent) {
    if (isPanning) {
      offset.x = e.clientX - startPan.x;
      offset.y = e.clientY - startPan.y;
      requestAnimationFrame(drawConnections);
    } else if (appState.dragState.isDragging && appState.dragState.taskId) {
      const task = appState.tasks.find((t) => t.id === appState.dragState.taskId);
      if (task) {
        const dx = (e.clientX - appState.dragState.startX) / scale;
        const dy = (e.clientY - appState.dragState.startY) / scale;
        task.x = appState.dragState.cardStartX + dx;
        task.y = appState.dragState.cardStartY + dy;
        requestAnimationFrame(drawConnections);
      }
    }
  }

  function handleWindowMouseUp() {
    if (isPanning) {
      isPanning = false;
      document.body.style.cursor = 'default';
      setState();
    }
    if (appState.dragState.isDragging) {
      appState.dragState.isDragging = false;
      appState.dragState.taskId = null;
      updateState();
    }
  }

  function addRootTask() {
    const newId = `task-${generateId()}`;
    const newTask: Task = { id: newId, title: 'New Root Task', items: [] };
    if (appState.settings?.alignment === 'free') {
      newTask.x = (window.innerWidth / 2 - offset.x) / scale - 125;
      newTask.y = (window.innerHeight / 2 - offset.y) / scale - 50;
    }
    appState.tasks.push(newTask);
    pendingFocusId = `title-${newId}`;
    updateState();
  }

  function toggleAlignment() {
    if (!appState.settings) appState.settings = { alignment: 'center' };
    const modes: Alignment[] = ['top', 'center', 'free'];
    const nextMode = modes[(modes.indexOf(appState.settings.alignment) + 1) % modes.length];

    if (nextMode === 'free') {
      appState.tasks.forEach((task) => {
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
    appState.settings.alignment = nextMode;
    updateState();
  }
</script>

<svelte:window
  onwheel={handleWheel}
  onmousedown={handleWindowMouseDown}
  onmousemove={handleWindowMouseMove}
  onmouseup={handleWindowMouseUp}
  onmessage={handleMessage}
  onresize={() => requestAnimationFrame(drawConnections)}
/>

{#snippet taskCard(task: Task)}
  <TaskCard
    {task}
    bind:pendingFocusId
    onDeleteTask={() => {
      deleteTaskRecursive(task.id);
      updateState();
    }}
    {updateState}
  />
{/snippet}

<div id="app" class="relative h-dvh w-dvw" bind:this={app}>
  <Toolbar {currentAlign} {handleImport} {addRootTask} {toggleAlignment} {fitToScreen} />
  <canvas id="connections" class="pointer-events-none absolute top-0 left-0" bind:this={canvas}
  ></canvas>

  <div
    id="container"
    class="flex min-h-full min-w-full items-start gap-24 p-10"
    bind:this={container}
    style="transform: translate({offset.x}px, {offset.y}px) scale({scale}); transform-origin: 0 0; align-items: {currentAlign ===
    'center'
      ? 'center'
      : 'flex-start'}; display: {currentAlign === 'free' ? 'block' : 'flex'};"
    onscroll={() => requestAnimationFrame(drawConnections)}
  >
    {#if currentAlign !== 'free'}
      {#each Array(maxDepth + 1) as _, depth}
        <div class="flex min-w-2xs flex-col gap-10" data-depth={depth}>
          {#each appState.tasks.filter((t) => depths.get(t.id) === depth) as task (task.id)}
            {@render taskCard(task)}
          {/each}
        </div>
      {/each}
    {:else}
      {#each appState.tasks as task (task.id)}
        {@render taskCard(task)}
      {/each}
    {/if}
  </div>
</div>
