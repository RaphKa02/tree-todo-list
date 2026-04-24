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
    'bg-card text-card-foreground relative w-xs rounded-xl border-2 border-(--card-theme) p-5 shadow-md transition-colors',
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
  <div class="mb-5 flex items-center justify-between gap-2 text-lg font-bold">
    <div
      class="hover:bg-accent focus:bg-accent flex-1 rounded-sm px-1 py-0.5 text-base wrap-anywhere transition-colors outline-none focus:shadow"
      id="title-{task.id}"
      contenteditable="true"
      bind:textContent={task.title}
      onblur={handleTitleBlur}
      onkeydown={handleTitleKeydown}
      role="textbox"
      tabindex="0"
    ></div>
    <button
      class="transition-color hover:text-destructive text-xs opacity-50 hover:opacity-100"
      title="Delete task and all subtasks"
      onclick={() => onDeleteTask()}
    >
      ✕
    </button>
  </div>

  <div
    class="bg-foreground in-port absolute top-1/2 -left-1 size-2 -translate-y-1/2 rounded-full"
  ></div>

  <div class="flex flex-col gap-3">
    {#each task.items as item, index (item.id)}
      <div
        class={[
          'group relative flex items-center gap-1',
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
          class="drag-handle cursor-grab px-1 text-sm opacity-30 transition-opacity select-none hover:opacity-80 active:cursor-grabbing"
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

        <div class="flex flex-1 items-center gap-2.5 py-1">
          <div
            class={[
              'relative size-5 cursor-pointer rounded-full border-2 border-(--card-theme)',
              item.completed && 'completed border-[#4caf50] bg-[#4caf50]',
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
                'hover:bg-accent focus:bg-accent flex-1 rounded-sm px-1 py-0.5 text-sm wrap-anywhere transition-colors outline-none focus:shadow',
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
                'flex-1 cursor-default rounded-sm px-1 py-0.5 text-sm wrap-anywhere opacity-80 transition-colors outline-none',
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
              class="bg-btn text-btn-foreground hover:bg-btn-hover rounded-sm p-0.5 text-sm leading-none"
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
            class="bg-btn text-btn-foreground hover:bg-btn-hover hover:text-destructive rounded-sm p-0.5 text-sm leading-none"
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
            class="bg-foreground absolute -right-6 z-50 size-2 rounded-full"
            id="port-{task.id}-{item.id}"
          ></div>
        {/if}
      </div>
    {/each}
  </div>

  <button
    class="text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground hover:bg-accent mt-4 w-2/3 rounded-md border border-dashed p-1.5 text-center text-sm transition-all"
    onclick={createItem}
  >
    + Add item
  </button>

  <div class="text-muted-foreground absolute right-3 bottom-6 flex items-center gap-1.5 text-sm">
    <span>{calculateCompletion(task)}%</span>
    <div class="size-6">
      <svg viewBox="0 0 36 36" class="-rotate-90">
        <circle class="stroke-muted fill-none stroke-3" cx="18" cy="18" r="16"></circle>
        <circle
          class="fill-none stroke-(--card-theme) stroke-3 transition-[stroke-dashoffset] [stroke-dasharray:100]"
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
