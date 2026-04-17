<script lang="ts">
  interface Props {
    currentAlign: 'top' | 'center' | 'free';
    handleImport: (e: Event) => void;
    addRootTask: () => void;
    toggleAlignment: () => void;
    fitToScreen: () => void;
  }

  const { currentAlign, handleImport, addRootTask, toggleAlignment, fitToScreen }: Props = $props();

  const icons = {
    add: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-plus-icon lucide-square-plus"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>`,
    fit: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-fullscreen-icon lucide-fullscreen"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect width="10" height="8" x="7" y="8" rx="1"/></svg>`,
    alignTop: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-align-start-horizontal-icon lucide-align-start-horizontal"><rect width="6" height="16" x="4" y="6" rx="2"/><rect width="6" height="9" x="14" y="6" rx="2"/><path d="M22 2H2"/></svg>`,
    alignCenter: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-align-center-horizontal-icon lucide-align-center-horizontal"><path d="M2 12h20"/><path d="M10 16v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4"/><path d="M10 8V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v4"/><path d="M20 16v1a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1"/><path d="M14 8V7c0-1.1.9-2 2-2h2a2 2 0 0 1 2 2v1"/></svg>`,
    alignFree: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-move-icon lucide-move"><path d="M12 2v20"/><path d="m15 19-3 3-3-3"/><path d="m19 9 3 3-3 3"/><path d="M2 12h20"/><path d="m5 9-3 3 3 3"/><path d="m9 5 3-3 3 3"/></svg>`,
    import: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-down-icon lucide-file-down"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/></svg>`,
  };

  let fileInput = $state<HTMLInputElement | null>(null);
</script>

<div
  id="toolbar"
  class="fixed top-4 left-4 flex flex-col gap-2 z-50 bg-(--vscode-editor-background) p-1 border border-(--vscode-panel-border) shadow"
>
  <button
    class="bg-(--vscode-button-secondaryBackground) text-(--vscode-button-secondaryForeground) border-none size-7 rounded-sm cursor-pointer flex justify-center items-center shrink-0 hover:bg-(--vscode-button-secondaryHoverBackground)"
    title="New Root Task"
    onclick={addRootTask}
  >
    {@html icons.add}
  </button>
  <button
    class="bg-(--vscode-button-secondaryBackground) text-(--vscode-button-secondaryForeground) border-none size-7 rounded-sm cursor-pointer flex justify-center items-center shrink-0 hover:bg-(--vscode-button-secondaryHoverBackground)"
    title="Fit to Screen"
    onclick={fitToScreen}
  >
    {@html icons.fit}
  </button>
  <button
    class="bg-(--vscode-button-secondaryBackground) text-(--vscode-button-secondaryForeground) border-none size-7 rounded-sm cursor-pointer flex justify-center items-center shrink-0 hover:bg-(--vscode-button-secondaryHoverBackground)"
    title="Toggle Alignment"
    onclick={toggleAlignment}
  >
    {@html currentAlign === 'top'
      ? icons.alignTop
      : currentAlign === 'center'
        ? icons.alignCenter
        : icons.alignFree}
  </button>
  <button
    class="bg-(--vscode-button-secondaryBackground) text-(--vscode-button-secondaryForeground) border-none size-7 rounded-sm cursor-pointer flex justify-center items-center shrink-0 hover:bg-(--vscode-button-secondaryHoverBackground)"
    title="Import JSON"
    onclick={() => fileInput?.click()}
  >
    {@html icons.import}
  </button>

  <input
    type="file"
    accept=".json"
    bind:this={fileInput}
    style="display: none;"
    onchange={handleImport}
  />
</div>
