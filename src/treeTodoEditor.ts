import * as vscode from 'vscode';
import { getNonce, convertJSON } from './util.js';
import { AppState } from './types.js';

export class TreeTodoEditorProvider implements vscode.CustomTextEditorProvider {
  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new TreeTodoEditorProvider(context);
    const providerRegistration = vscode.window.registerCustomEditorProvider(
      TreeTodoEditorProvider.viewType,
      provider,
      {
        supportsMultipleEditorsPerDocument: false,
        webviewOptions: {
          retainContextWhenHidden: true,
          enableFindWidget: true,
        },
      }
    );

    const commandRegistration = vscode.commands.registerCommand(
      'tree-todo-list.newTreeTodo',
      async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
          vscode.window.showErrorMessage(
            'Creating a new Tree Todo file requires a workspace to be open.'
          );
          return;
        }

        const fileName = await vscode.window.showInputBox({
          prompt: 'Enter a name for your new Todo list',
          placeHolder: 'my-tasks',
          validateInput: (text) => {
            if (!text || text.trim().length === 0) {
              return 'Filename cannot be empty';
            }
            if (/[<>:"/\\|?*]/.test(text)) {
              return 'Filename contains invalid characters';
            }
            return null;
          },
        });

        if (!fileName) {
          return;
        }

        const uri = vscode.Uri.joinPath(workspaceFolders[0].uri, `${fileName}.treetodo`);

        try {
          await vscode.workspace.fs.stat(uri);
          vscode.window.showErrorMessage(`A file named ${fileName}.treetodo already exists.`);
          return;
        } catch {
          // File does not exist, proceed
        }

        const initialState = {
          tasks: [
            {
              id: 'root-1',
              title: fileName,
              items: [{ id: 'item-1', title: 'Task 1', completed: false }],
            },
          ],
        };

        const content = JSON.stringify(initialState, null, 2);
        const edit = new vscode.WorkspaceEdit();
        edit.createFile(uri, { contents: Buffer.from(content) });
        await vscode.workspace.applyEdit(edit);
        vscode.commands.executeCommand('vscode.open', uri);
      }
    );

    const importJsonRegistration = vscode.commands.registerCommand(
      'tree-todo-list.importJson',
      async () => {
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: {
            JSON: ['json'],
          },
          title: 'Select a JSON file exported from treetodolist.com',
        });

        if (uris && uris[0]) {
          try {
            const content = await vscode.workspace.fs.readFile(uris[0]);
            const imported = JSON.parse(content.toString());
            const convertedState = convertJSON(imported);
            const filename = imported.workflow?.title || 'imported-todo';
            await provider.createNewTreeTodo(convertedState, filename);
          } catch (err) {
            vscode.window.showErrorMessage('Failed to parse or import JSON file.');
          }
        }
      }
    );

    const viewSourceRegistration = vscode.commands.registerCommand(
      'tree-todo-list.viewSource',
      (uri?: vscode.Uri) => {
        const resource =
          uri || (vscode.window.tabGroups.activeTabGroup.activeTab?.input as any)?.uri;
        if (resource) {
          vscode.commands.executeCommand('vscode.openWith', resource, 'default', {
            viewColumn: vscode.ViewColumn.Active,
            preserveFocus: false,
          });
        }
      }
    );

    const viewCustomRegistration = vscode.commands.registerCommand(
      'tree-todo-list.viewCustomEditor',
      (uri?: vscode.Uri) => {
        const resource =
          uri || (vscode.window.tabGroups.activeTabGroup.activeTab?.input as any)?.uri;
        if (resource) {
          vscode.commands.executeCommand(
            'vscode.openWith',
            resource,
            TreeTodoEditorProvider.viewType,
            {
              viewColumn: vscode.ViewColumn.Active,
              preserveFocus: false,
            }
          );
        }
      }
    );

    return vscode.Disposable.from(
      providerRegistration,
      commandRegistration,
      importJsonRegistration,
      viewSourceRegistration,
      viewCustomRegistration
    );
  }

  private static readonly viewType = 'tree-todo-list.editor';

  constructor(private readonly context: vscode.ExtensionContext) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
    };
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    function updateWebview() {
      const config = vscode.workspace.getConfiguration('tree-todo-list');
      const maxPasses = config.get<number>('maxPasses', 10);
      const autoReorder = config.get<boolean>('autoReorderTasks', true);
      webviewPanel.webview.postMessage({
        type: 'update',
        text: document.getText(),
        config: {
          maxPasses: maxPasses,
          autoReorderTasks: autoReorder,
        },
      });
    }

    const changeConfigurationSubscription = vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration('tree-todo-list.maxPasses') ||
        e.affectsConfiguration('tree-todo-list.autoReorderTasks')
      ) {
        updateWebview();
      }
    });
    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === document.uri.toString()) {
        updateWebview();
      }
    });

    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
      changeConfigurationSubscription.dispose();
    });

    webviewPanel.webview.onDidReceiveMessage((e) => {
      switch (e.type) {
        case 'ready':
          updateWebview();
          return;
        case 'update':
          this.updateTextDocument(document, e.state);
          return;
        case 'import':
          this.updateTextDocument(document, e.state);
          return;
        case 'error':
          vscode.window.showErrorMessage(e.message);
          return;
      }
    });

    webviewPanel.onDidChangeViewState((e) => {
      if (e.webviewPanel.visible) {
        updateWebview();
      }
    });

    updateWebview();
  }

  private async createNewTreeTodo(state: AppState, filename: string) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showErrorMessage('Importing a Tree Todo file requires a workspace to be open.');
      return;
    }

    const cleanFilename = filename.replace(/[<>:"/\\|?*]/g, '_');
    const uri = vscode.Uri.joinPath(workspaceFolders[0].uri, `${cleanFilename}.treetodo`);
    const content = JSON.stringify(state, null, 2);
    const edit = new vscode.WorkspaceEdit();
    edit.createFile(uri, { contents: Buffer.from(content), overwrite: true });
    await vscode.workspace.applyEdit(edit);
    await vscode.commands.executeCommand('vscode.open', uri);
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'treeTodo.js')
    );

    const styleMainUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'treeTodo.css')
    );

    const nonce = getNonce();

    return `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src ${webview.cspSource}; img-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link href="${styleMainUri}" rel="stylesheet" />
				<title>Tree Todo List</title>
			</head>
			<body>
				<div id="app">
					<canvas id="connections"></canvas>
					<div id="container"></div>
				</div>
				<script type="module" nonce="${nonce}" src="${scriptUri}"></script>
			</body>
</html>`;
  }

  private async updateTextDocument(document: vscode.TextDocument, json: AppState) {
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length)
    );
    edit.replace(document.uri, fullRange, JSON.stringify(json, null, 2));
    const success = await vscode.workspace.applyEdit(edit);
    if (!success) {
      vscode.window.showErrorMessage(
        'Failed to update the document. The file might be read-only or locked by another process.'
      );
    }
  }
}
