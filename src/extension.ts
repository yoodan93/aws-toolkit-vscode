/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'

export async function activate(context: vscode.ExtensionContext) {

    vscode.commands.registerCommand(
        'aws.login', async () => {
            vscode.window.showInformationMessage('hello')
        })
}

export function deactivate() {
}
