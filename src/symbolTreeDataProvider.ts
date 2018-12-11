/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'

export class SymbolTreeDataProvider implements vscode.TreeDataProvider<SymbolTreeNode> {
    public readonly onDidChangeTreeData: vscode.Event<SymbolTreeNode | undefined>
    private readonly _onDidChangeTreeData: vscode.EventEmitter<SymbolTreeNode | undefined>

    public constructor(
    ) {
        this._onDidChangeTreeData = new vscode.EventEmitter<SymbolTreeNode | undefined>()
        this.onDidChangeTreeData = this._onDidChangeTreeData.event

        vscode.window.onDidChangeActiveTextEditor(e => {
            this._onDidChangeTreeData.fire(undefined)
        })
    }

    public initialize(): void {
    }

    public getTreeItem(element: SymbolTreeNode): vscode.TreeItem {
        return element.getTreeItem()
    }

    public async getChildren(element?: SymbolTreeNode): Promise<SymbolTreeNode[]> {
        if (element) {
            return element.getChildren()
        }

        if (!!vscode.window.activeTextEditor) {
            const uri = vscode.window.activeTextEditor.document.uri
            const symbols: vscode.DocumentSymbol[] | undefined =
                await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                    'vscode.executeDocumentSymbolProvider',
                    uri
                )

            if (!!symbols) {
                return symbols.map(n => new SymbolTreeNode(n))
            }
        }

        return []
    }

}

class SymbolTreeNode {
    private readonly _symbolInfo: vscode.DocumentSymbol
    public constructor(
        symbolInfo: vscode.DocumentSymbol
    ) {
        this._symbolInfo = symbolInfo
    }

    public getTreeItem(): vscode.TreeItem {
        const treeItem = new vscode.TreeItem(
            `${vscode.SymbolKind[this._symbolInfo.kind]} - ${this._symbolInfo.name}`,
            this._symbolInfo.children.length === 0 ?
                vscode.TreeItemCollapsibleState.None :
                vscode.TreeItemCollapsibleState.Expanded
        )

        treeItem.command = {
            title: '',
            command: 'aws.proto.gotoActiveDocumentRange',
            arguments: [
                this._symbolInfo.selectionRange
            ]
        }

        return treeItem
    }

    public getChildren(): SymbolTreeNode[] {
        return this._symbolInfo.children.map(c => new SymbolTreeNode(
            c
        ))
    }
}
