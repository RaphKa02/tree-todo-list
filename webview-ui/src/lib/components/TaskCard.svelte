<script lang="ts">
  import { appState } from '$lib/appState.svelte';
  import type { Task, TaskItem } from '$lib/types';
  import { calculateCompletion, generateId, preventDefault } from '$lib/util';
  import GripVertical from '@lucide/svelte/icons/grip-vertical';
  import Link from '@lucide/svelte/icons/link';
  import Trash from '@lucide/svelte/icons/trash-2';

  interface Props {
    task: Task;
    onDeleteTask: () => void;
    updateState: () => void;
    pendingFocusId: string | null;
  }

  let { task, onDeleteTask, updateState, pendingFocusId = $bindable(null) }: Props = $props();

  let isItemHandleDragging = $state(false);
  let draggingItemHandleId: string | null = $state(null);
  let draggingItemId: string | null = $state(null);

  const completion = $derived(calculateCompletion(task));

  function handleCardMouseDown(e: MouseEvent, task: Task) {
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

    if (appState.settings?.alignment === 'free') {
      appState.dragState.isDragging = true;
      appState.dragState.taskId = task.id;
      appState.dragState.startX = e.clientX;
      appState.dragState.startY = e.clientY;
      appState.dragState.cardStartX = task.x || 0;
      appState.dragState.cardStartY = task.y || 0;
      e.stopPropagation();
    }
  }

  function handleTitleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      (e.target as HTMLElement).blur();
    }
  }

  function handleTitleBlur() {
    updateState();
  }

  function handleItemTitleKeydown(e: KeyboardEvent, item: TaskItem, index: number) {
    const isEnter = e.key === 'Enter';
    if (isEnter || e.key === 'Escape') {
      e.preventDefault();
      (e.target as HTMLElement).blur();

      const isLast = index === task.items.length - 1;
      if (isEnter && isLast && item.title.trim() !== '') {
        createItem();
      }
    }
  }

  function handleItemTitleBlur(item: TaskItem, index: number) {
    if (item.linksTo) return;

    if (item.title.trim() === '' && index === task.items.length - 1 && task.items.length !== 1) {
      task.items.splice(index, 1);
    }

    updateState();
  }

  function handleItemDragStart(e: DragEvent, taskId: string, index: number) {
    if (!isItemHandleDragging) {
      e.preventDefault();
      return;
    }
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.setData('application/json', JSON.stringify({ type: 'item', taskId, index }));
    }
    draggingItemId = `${taskId}-${index}`;
  }

  function handleItemDragEnd() {
    draggingItemId = null;
    isItemHandleDragging = false;
  }

  function handleItemDrop(e: DragEvent, targetTaskId: string, targetIndex: number) {
    e.preventDefault();
    e.stopPropagation();
    const rawData = e.dataTransfer?.getData('application/json');
    if (!rawData) return;
    const data = JSON.parse(rawData);
    if (data.type === 'item' && data.taskId === targetTaskId) {
      const task = appState.tasks.find((t) => t.id === targetTaskId);
      if (task) {
        const [movedItem] = task.items.splice(data.index, 1);
        task.items.splice(targetIndex, 0, movedItem);
        updateState();
      }
    }
  }

  function createItem() {
    const newItemId = `item-${generateId()}`;
    task.items.push({ id: newItemId, title: '', completed: false });
    pendingFocusId = `item-title-${task.id}-${newItemId}`;
    updateState();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class={[
    'card',
    completion === 100 ? '[--card-theme:#4caf50]' : '[--card-theme:#555]',
    'border-2 border-(--card-theme) rounded-xl p-5 w-xs shadow-md relative transition-colors bg-card text-card-foreground',
  ]}
  id="card-{task.id}"
  data-task-id={task.id}
  onmousedown={(e) => handleCardMouseDown(e, task)}
  role="note"
  aria-roledescription="draggable card"
  aria-label="Task card: {task.title}"
  style={appState.settings?.alignment === 'free'
    ? `position: absolute; left: ${task.x || 0}px; top: ${task.y || 0}px;`
    : ''}
>
  <div class="flex items-center justify-between mb-5 font-bold gap-2 text-lg">
    <div
      class="text-base flex-1 px-1 py-0.5 rounded-sm outline-none transition-colors wrap-anywhere hover:bg-accent focus:bg-accent focus:shadow"
      id="title-{task.id}"
      contenteditable="true"
      bind:textContent={task.title}
      onblur={handleTitleBlur}
      onkeydown={handleTitleKeydown}
      role="textbox"
      tabindex="0"
    ></div>
    <button
      class="opacity-50 transition-color text-xs hover:opacity-100 hover:text-destructive"
      title="Delete task and all subtasks"
      onclick={() => onDeleteTask()}
    >
      ✕
    </button>
  </div>

  <div
    class="absolute size-2 bg-foreground rounded-full -left-1 top-1/2 -translate-y-1/2 in-port"
  ></div>

  <div class="flex flex-col gap-3">
    {#each task.items as item, index (item.id)}
      <div
        class={[
          'group flex items-center gap-1 relative',
          draggingItemId === `${task.id}-${index}` && 'opacity-40',
        ]}
        data-index={index}
        draggable={isItemHandleDragging && draggingItemHandleId === `${task.id}-${index}`}
        ondragstart={(e) => handleItemDragStart(e, task.id, index)}
        ondragend={handleItemDragEnd}
        ondragover={preventDefault()}
        ondrop={preventDefault((e) => handleItemDrop(e, task.id, index))}
        role="listitem"
      >
        <div
          class="drag-handle cursor-grab opacity-30 px-1 select-none transition-opacity text-sm hover:opacity-80 active:cursor-grabbing"
          onmousedown={() => {
            isItemHandleDragging = true;
            draggingItemHandleId = `${task.id}-${index}`;
          }}
          onmouseup={() => {
            isItemHandleDragging = false;
            draggingItemHandleId = null;
          }}
          role="button"
          tabindex="0"
        >
          <GripVertical class="size-4" />
        </div>

        <div class="flex items-center gap-2.5 py-1 flex-1">
          <div
            class={[
              'size-5 border-2 border-(--card-theme) rounded-full cursor-pointer relative',
              item.completed && 'bg-[#4caf50] border-[#4caf50] completed',
              item.linksTo && 'cursor-default! opacity-60',
            ]}
            onclick={() => {
              if (!item.linksTo) {
                item.completed = !item.completed;
                updateState();
              }
            }}
            onkeydown={(e) => {
              if (e.key === 'SPACE' || e.key === 'ENTER') {
                if (!item.linksTo) {
                  item.completed = !item.completed;
                  updateState();
                }
              }
            }}
            role="checkbox"
            aria-checked={item.completed}
            tabindex="0"
          ></div>
          {#if !item.linksTo}
            <div
              class={[
                'text-sm flex-1 px-1 py-0.5 rounded-sm outline-none transition-colors wrap-anywhere hover:bg-accent focus:bg-accent focus:shadow',
                item.completed && 'line-through opacity-60',
              ]}
              id="item-title-{task.id}-{item.id}"
              contenteditable
              bind:textContent={item.title}
              onblur={() => handleItemTitleBlur(item, index)}
              onkeydown={(e) => handleItemTitleKeydown(e, item, index)}
              role="textbox"
              tabindex="0"
            ></div>
          {:else}
            <div
              class={[
                'text-sm flex-1 px-1 py-0.5 rounded-sm outline-none transition-colors opacity-80 wrap-anywhere cursor-default',
                item.completed && 'line-through opacity-60',
              ]}
              id="item-title-{task.id}-{item.id}"
            >
              {item.title}
            </div>
          {/if}
        </div>

        <div class="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {#if !item.linksTo}
            <button
              class="text-sm p-0.5 rounded-sm bg-btn text-btn-foreground leading-none hover:bg-btn-hover"
              title="Link to new task"
              onclick={() => {
                const newTaskId = `task-${generateId()}`;
                appState.tasks.push({ id: newTaskId, title: item.title, items: [] });
                item.linksTo = newTaskId;
                pendingFocusId = `title-${newTaskId}`;
                updateState();
              }}
            >
              <Link class="size-4" />
            </button>
          {/if}
          <button
            class="text-sm p-0.5 rounded-sm bg-btn text-btn-foreground leading-none hover:bg-btn-hover hover:text-destructive"
            title="Delete item"
            onclick={() => {
              task.items.splice(index, 1);
              updateState();
            }}
          >
            <Trash class="size-4" />
          </button>
        </div>

        {#if item.linksTo}
          <div
            class="absolute size-2 bg-foreground rounded-full -right-6 z-50"
            id="port-{task.id}-{item.id}"
          ></div>
        {/if}
      </div>
    {/each}
  </div>

  <button
    class="mt-4 p-1.5 text-center border border-dashed rounded-md text-sm w-2/3 text-muted-foreground transition-all hover:border-muted-foreground/50 hover:text-foreground hover:bg-accent"
    onclick={createItem}
  >
    + Add item
  </button>

  <div class="absolute bottom-6 right-3 flex items-center gap-1.5 text-sm text-muted-foreground">
    <span>{calculateCompletion(task)}%</span>
    <div class="size-6">
      <svg viewBox="0 0 36 36" class="-rotate-90">
        <circle class="stroke-muted fill-none stroke-3" cx="18" cy="18" r="16"></circle>
        <circle
          class="stroke-(--card-theme) [stroke-dasharray:100] transition-[stroke-dashoffset] fill-none stroke-3"
          cx="18"
          cy="18"
          r="16"
          style="stroke-dashoffset: {100 - calculateCompletion(task)}"
        ></circle>
      </svg>
    </div>
  </div>
</div>

<style lang="css">
  .completed::after {
    content: '';
    position: absolute;
    left: 5px;
    top: 2px;
    width: 6px;
    height: 10px;
    border: solid white;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }
</style>
