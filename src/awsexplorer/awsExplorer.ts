/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {LocalizedIds, getLocalizedText} from '../shared/localizedIds'
import * as vscode from 'vscode'
import { AwsContext } from '../shared/awsContext'
import { RegionProvider } from '../shared/regions/regionProvider'
import { RefreshableAwsTreeProvider } from '../shared/treeview/awsTreeProvider'
import { AWSCommandTreeNode } from '../shared/treeview/nodes/awsCommandTreeNode'
import { AWSTreeNodeBase } from '../shared/treeview/nodes/awsTreeNodeBase'
import { intersection, toMap, updateInPlace } from '../shared/utilities/collectionUtils'
import { RegionNode } from './regionNode'

export class AwsExplorer implements vscode.TreeDataProvider<AWSTreeNodeBase>, RefreshableAwsTreeProvider {
    public viewProviderId: string = 'aws.explorer'
    public readonly onDidChangeTreeData: vscode.Event<AWSTreeNodeBase | undefined>
    private readonly _onDidChangeTreeData: vscode.EventEmitter<AWSTreeNodeBase | undefined>
    private readonly regionNodes: Map<string, RegionNode>

    public constructor(private readonly awsContext: AwsContext, private readonly regionProvider: RegionProvider) {
        this._onDidChangeTreeData = new vscode.EventEmitter<AWSTreeNodeBase | undefined>()
        this.onDidChangeTreeData = this._onDidChangeTreeData.event
        this.regionNodes = new Map<string, RegionNode>()
    }

    public getTreeItem(element: AWSTreeNodeBase): vscode.TreeItem {
        return element
    }

    public async getChildren(element?: AWSTreeNodeBase): Promise<AWSTreeNodeBase[]> {
        if (!!element) {
            try {
                return await element.getChildren()
            } catch (error) {
                return [
                    new AWSCommandTreeNode(
                        element,
                        getLocalizedText(LocalizedIds.ExplorerNode.Lambda.Retry
                        ),
                        'aws.refreshAwsExplorerNode',
                        [this, element]
                    )
                ]
            }
        }

        const profileName = this.awsContext.getCredentialProfileName()
        if (!profileName) {
            return [
                new AWSCommandTreeNode(
                    undefined,
                    getLocalizedText(LocalizedIds.ExplorerNode.SignIn),
                    'aws.login',
                    undefined,
                    getLocalizedText(LocalizedIds.ExplorerNode.SignInTooltip)
                )
            ]
        }

        const explorerRegionCodes = await this.awsContext.getExplorerRegions()
        const regionMap = toMap(await this.regionProvider.getRegionData(), r => r.regionCode)

        updateInPlace(
            this.regionNodes,
            intersection(regionMap.keys(), explorerRegionCodes),
            key => this.regionNodes.get(key)!.update(regionMap.get(key)!),
            key => new RegionNode(regionMap.get(key)!)
        )

        if (this.regionNodes.size > 0) {
            return [...this.regionNodes.values()]
        } else {
            return [
                new AWSCommandTreeNode(
                    undefined,
                    getLocalizedText(LocalizedIds.ExplorerNode.AddRegion),
                    'aws.showRegion',
                    undefined,
                    getLocalizedText(LocalizedIds.ExplorerNode.AddRegionTooltip)
                )
            ]
        }
    }

    public getRegionNodesSize() {
        return this.regionNodes.size
    }

    public refresh(node?: AWSTreeNodeBase) {
        this._onDidChangeTreeData.fire(node)
    }
}
