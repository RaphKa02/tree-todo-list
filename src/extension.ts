import * as vscode from 'vscode';
import { TreeTodoEditorProvider } from './treeTodoEditor.js';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(TreeTodoEditorProvider.register(context));
}
