import * as vscode from 'vscode';
import { getNonce } from './util.js';
import { AppState } from './types.js';

export class TreeTodoEditorProvider implements vscode.CustomTextEditorProvider {
  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new TreeTodoEditorProvider(context);
    const providerRegistration = vscode.window.registerCustomEditorProvider(
      TreeTodoEditorProvider.viewType,
      provider
    );

    const commandRegistration = vscode.commands.registerCommand(
      'tree-todo-list.newTreeTodo',
      () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
          vscode.window.showErrorMessage(
            'Creating a new Tree ToDo file requires a workspace to be open.'
          );
          return;
        }

        const uri = vscode.Uri.joinPath(workspaceFolders[0].uri, `new-todo-${getNonce()}.treetodo`);
        const initialState = {
          tasks: [
            {
              id: 'root-1',
              title: 'My Todo',
              items: [
                { id: 'item-1', title: 'Task 1', completed: false },
                { id: 'item-2', title: 'Task 2', completed: false },
              ],
            },
          ],
        };

        const content = JSON.stringify(initialState, null, 2);
        const edit = new vscode.WorkspaceEdit();
        edit.createFile(uri, { contents: Buffer.from(content) });
        vscode.workspace.applyEdit(edit).then(() => {
          vscode.commands.executeCommand('vscode.open', uri);
        });
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
      }
    });

    webviewPanel.onDidChangeViewState((e) => {
      if (e.webviewPanel.visible) {
        updateWebview();
      }
    });

    updateWebview();
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
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
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

  private updateTextDocument(document: vscode.TextDocument, json: AppState) {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      document.uri,
      new vscode.Range(0, 0, document.lineCount, 0),
      JSON.stringify(json, null, 2)
    );
    return vscode.workspace.applyEdit(edit);
  }
}
