<script lang="ts">
  import { appState } from '../appState.svelte';
  import type { Task, TaskItem } from '../types';
  import { calculateCompletion, generateId, preventDefault } from '../util';

  interface Props {
    task: Task;
    onDeleteTask: () => void;
    updateState: () => void;
    pendingFocusId: string | null;
  }

  let { task, onDeleteTask, updateState, pendingFocusId = $bindable(null) }: Props = $props();

  let isCardHandleDragging = $state(false);
  let draggingTaskId: string | null = $state(null);
  let dragStartX = $state(0);
  let dragStartY = $state(0);
  let cardStartX = $state(0);
  let cardStartY = $state(0);

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
      isCardHandleDragging = true;
      draggingTaskId = task.id;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      cardStartX = task.x || 0;
      cardStartY = task.y || 0;
      e.stopPropagation();
    }
  }

  function handleTitleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      (e.target as HTMLElement).blur();
    }
  }

  function handleTitleBlur(e: FocusEvent) {
    const newTitle = (e.target as HTMLElement).textContent || '';
    if (task.title !== newTitle) {
      task.title = newTitle;
      updateState();
    }
  }

  function handleItemTitleKeydown(e: KeyboardEvent, item: TaskItem, index: number) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (index === task.items.length - 1) {
        item.title = (e.target as HTMLElement).textContent || '';
        createItem();
      } else {
        (e.target as HTMLElement).blur();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      (e.target as HTMLElement).blur();
    }
  }

  function handleItemTitleBlur(e: FocusEvent, item: TaskItem, index: number) {
    if (item.linksTo) return;
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
    'border-2 border-(--card-theme) rounded-xl p-5 w-xs shadow-md relative transition-colors bg-(--card-bg)',
  ]}
  id="card-{task.id}"
  data-task-id={task.id}
  onmousedown={(e) => handleCardMouseDown(e, task)}
  role="note"
  aria-roledescription="draggable card"
  aria-label="Task card: {task.title}"
  style={appState.settings?.alignment === 'free'
    ? 'position absolute; left: {task.x || 0}px; top: {task.y || 0}px;'
    : ''}
>
  <div class="flex items-center justify-between mb-5 font-bold gap-2 text-lg">
    <div
      class="text-base flex-1 px-1 py-0.5 rounded-sm outline-none transition-colors wrap-anywhere hover:bg-(--item-hover-bg) focus:bg-(--input-focus-bg) focus:shadow"
      id="title-{task.id}"
      contenteditable="true"
      onblur={(e) => handleTitleBlur(e)}
      onkeydown={handleTitleKeydown}
      role="textbox"
      tabindex="0"
    >
      {task.title}
    </div>
    <button
      class="opacity-50 transition-color text-xs hover:opacity-100 hover:text-red-500"
      title="Delete task and all subtasks"
      onclick={() => onDeleteTask()}
    >
      ✕
    </button>
  </div>

  <div
    class="absolute size-2 bg-(--port-bg) rounded-full -left-1 top-1/2 -translate-y-1/2 in-port"
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
          class="cursor-grab opacity-30 px-1 select-none transition-opacity text-sm hover:opacity-80 active:cursor-grabbing"
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
          ⠿
        </div>

        <div class="flex items-center gap-2.5 py-1 flex-1">
          <div
            class={[
              'size-5 border-2 border-(--card-theme) rounded-full cursor-pointer relative',
              item.completed && 'bg-[#4caf50] border-[#4caf50] completed',
              item.linksTo && 'cursor-default opacity-60',
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
          <div
            class={[
              'text-sm flex-1 px-1 py-0.5 rounded-sm outline-none transition-colors wrap-anywhere hover:bg-(--item-hover-bg) focus:bg-(--input-focus-bg) focus:shadow',
              item.completed ?? 'line-through opacity-60',
            ]}
            id="item-title-{task.id}-{item.id}"
            contenteditable={!item.linksTo}
            onblur={(e) => handleItemTitleBlur(e, item, index)}
            onkeydown={(e) => handleItemTitleKeydown(e, item, index)}
            role="textbox"
            tabindex="0"
          >
            {item.title}
          </div>
        </div>

        <div class="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {#if !item.linksTo}
            <button
              class="text-sm p-0.5 rounded-sm bg-(--btn-bg) leading-none hover:bg-(--btn-hover-bg)"
              title="Link to new task"
              onclick={() => {
                const newTaskId = `task-${generateId()}`;
                appState.tasks.push({ id: newTaskId, title: item.title, items: [] });
                item.linksTo = newTaskId;
                pendingFocusId = `title-${newTaskId}`;
                updateState();
              }}
            >
              🔗
            </button>
          {/if}
          <button
            class="text-sm p-0.5 rounded-sm bg-(--btn-bg) leading-none hover:bg-(--btn-hover-bg)"
            title="Delete item"
            onclick={() => {
              task.items.splice(index, 1);
              updateState();
            }}
          >
            🗑️
          </button>
        </div>

        {#if item.linksTo}
          <div
            class="absolute size-2 bg-(--port-bg) rounded-full -right-6"
            id="port-{task.id}-{item.id}"
          ></div>
        {/if}
      </div>
    {/each}
  </div>

  <button
    class="mt-4 p-1.5 text-center border border-dashed border-(--add-btn-border) rounded-md text-sm w-2/3 text-(--add-btn-text) transition-all hover:border-(--add-btn-hover-border) hover:text-(--add-btn-hover-text) hover:bg-(--item-hover-bg)"
    onclick={createItem}
  >
    + Add item
  </button>

  <div class="absolute bottom-6 right-3 flex items-center gap-1.5 text-sm text-(--add-btn-text)">
    <span>{calculateCompletion(task)}%</span>
    <div class="size-6">
      <svg viewBox="0 0 36 36" class="-rotate-90">
        <circle class="stroke-(--progress-bg) fill-none stroke-3" cx="18" cy="18" r="16"></circle>
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
