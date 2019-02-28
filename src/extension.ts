/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as path from 'path'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

import { resumeCreateNewSamApp } from './lambda/commands/createNewSamApp'
import { RegionNode } from './lambda/explorer/regionNode'
import { LambdaTreeDataProvider } from './lambda/lambdaTreeDataProvider'
import { DefaultAWSClientBuilder } from './shared/awsClientBuilder'
import { AwsContextTreeCollection } from './shared/awsContextTreeCollection'
import { DefaultToolkitClientBuilder } from './shared/clients/defaultToolkitClientBuilder'
import { TypescriptCodeLensProvider } from './shared/codelens/typescriptCodeLensProvider'
import { extensionSettingsPrefix } from './shared/constants'
import { DefaultCredentialsFileReaderWriter } from './shared/credentials/defaultCredentialsFileReaderWriter'
import { DefaultAwsContext } from './shared/defaultAwsContext'
import { DefaultAWSContextCommands } from './shared/defaultAwsContextCommands'
import { DefaultResourceFetcher } from './shared/defaultResourceFetcher'
import { EnvironmentVariables } from './shared/environmentVariables'
import { ext } from './shared/extensionGlobals'
import { safeGet } from './shared/extensionUtilities'
import { DefaultRegionProvider } from './shared/regions/defaultRegionProvider'
import * as SamCliDetection from './shared/sam/cli/samCliDetection'
import { SamCliVersionValidator } from './shared/sam/cli/samCliVersionValidator'
import { DefaultSettingsConfiguration, SettingsConfiguration } from './shared/settingsConfiguration'
import { AWSStatusBar } from './shared/statusBar'
import { ExtensionDisposableFiles } from './shared/utilities/disposableFiles'
import { PromiseSharer } from './shared/utilities/promiseUtilities'

export async function activate(context: vscode.ExtensionContext) {

    const env = process.env as EnvironmentVariables
    if (!!env.VSCODE_NLS_CONFIG) {
        nls.config(JSON.parse(env.VSCODE_NLS_CONFIG) as nls.Options)()
    } else {
        nls.config()()
    }

    const localize = nls.loadMessageBundle()

    ext.context = context

    const toolkitOutputChannel: vscode.OutputChannel = vscode.window.createOutputChannel(
        localize('AWS.channel.aws.toolkit', 'AWS Toolkit')
    )

    await new DefaultCredentialsFileReaderWriter().setCanUseConfigFileIfExists()

    const awsContext = new DefaultAwsContext(new DefaultSettingsConfiguration(extensionSettingsPrefix))
    const awsContextTrees = new AwsContextTreeCollection()
    const resourceFetcher = new DefaultResourceFetcher()
    const regionProvider = new DefaultRegionProvider(context, resourceFetcher)

    ext.awsContextCommands = new DefaultAWSContextCommands(awsContext, awsContextTrees, regionProvider)
    ext.sdkClientBuilder = new DefaultAWSClientBuilder(awsContext)
    ext.toolkitClientBuilder = new DefaultToolkitClientBuilder()
    ext.statusBar = new AWSStatusBar(awsContext, context)

    context.subscriptions.push(...activateCodeLensProviders(awsContext.settingsConfiguration, toolkitOutputChannel))

    vscode.commands.registerCommand('aws.login', async () => await ext.awsContextCommands.onCommandLogin())
    vscode.commands.registerCommand(
        'aws.credential.profile.create',
        async () => await ext.awsContextCommands.onCommandCreateCredentialsProfile()
    )
    vscode.commands.registerCommand('aws.logout', async () => await ext.awsContextCommands.onCommandLogout())

    vscode.commands.registerCommand(
        'aws.showRegion',
        async () => await ext.awsContextCommands.onCommandShowRegion()
    )
    vscode.commands.registerCommand(
        'aws.hideRegion',
        async (node?: RegionNode) => await ext.awsContextCommands.onCommandHideRegion(safeGet(node, x => x.regionCode))
    )

    const providers = [
        new LambdaTreeDataProvider(
            awsContext,
            awsContextTrees,
            regionProvider,
            resourceFetcher,
            (relativeExtensionPath) => getExtensionAbsolutePath(context, relativeExtensionPath)
        )
    ]

    providers.forEach((p) => {
        p.initialize(context)
        context.subscriptions.push(vscode.window.registerTreeDataProvider(p.viewProviderId, p))
    })

    await ext.statusBar.updateContext(undefined)

    await initializeSamCli()

    await ExtensionDisposableFiles.initialize(context)

    await resumeCreateNewSamApp(context)

    vscode.commands.registerCommand(
        'aws.prototype.prepare.debug.session',
        async (arg) => {
            if (arg.launchType === 'node') {
                const workspaceFolders = vscode.workspace.workspaceFolders || []
                const chosenTemplate = await vscode.window.showQuickPick(
                    await getTemplateChoices(detectLocalTemplates, ...workspaceFolders.map(x => x.uri)),
                    {
                        placeHolder: 'Which template do you want to debug'
                    }
                )

                console.log(`debug: chose template: ${chosenTemplate ? chosenTemplate.label : chosenTemplate}`)
                if (!chosenTemplate) { return }

                await context.globalState.update('DEBUG_SESSION_SAM_TEMPLATE', chosenTemplate.label)
                const eventFilename = path.join(path.dirname(chosenTemplate.label), 'events.json')
                console.log(`debug: eventFilename: ${eventFilename}`)
                await context.globalState.update('DEBUG_SESSION_EVENT_FILE', eventFilename)

                // const resourceName = context.globalState.get<string>('DEBUG_SESSION_SAM_RESOURCE_NAME')
                const template = await CloudFormation.load(chosenTemplate.label)

                if (!template.Resources) { return }

                const resourceNames = Object.getOwnPropertyNames(template.Resources)
                    .filter(resourceName => template.Resources![resourceName].Type === 'AWS::Serverless::Function')

                if (resourceNames.length === 0) { return }

                const chosenResourceName = await vscode.window.showQuickPick(
                    resourceNames,
                    {
                        placeHolder: 'Which template resource do you want to debug'
                    }
                )

                console.log(`debug: chose resource name: ${chosenResourceName}`)
                if (!chosenResourceName) { return }

                await context.globalState.update('DEBUG_SESSION_SAM_RESOURCE_NAME', chosenResourceName)
            }

            return ''
        }
    )

    vscode.commands.registerCommand(
        'aws.prototype.retrieve.debug.setting',
        async (arg) => {
            switch (arg.get) {
                case 'resourceName':
                    const resourceName = await context.globalState.get<string>('DEBUG_SESSION_SAM_RESOURCE_NAME')
                    console.log(`Getting DEBUG_SESSION_SAM_RESOURCE_NAME: ${resourceName}`)

                    return resourceName
                    break
                case 'samTemplate':
                    const template = await context.globalState.get<string>('DEBUG_SESSION_SAM_TEMPLATE')
                    console.log(`Getting DEBUG_SESSION_SAM_TEMPLATE: ${template}`)

                    return template
                    break
                case 'eventFile':
                    const eventFile = await context.globalState.get<string>('DEBUG_SESSION_EVENT_FILE')
                    console.log(`Getting DEBUG_SESSION_EVENT_FILE: ${eventFile}`)

                    return eventFile
                    break
            }

            return undefined
        }
    )
}

import { detectLocalTemplates } from './lambda/local/detectLocalTemplates'
import { CloudFormation } from './shared/cloudformation/cloudformation'

async function getTemplateChoices(
    onDetectLocalTemplates: typeof detectLocalTemplates = detectLocalTemplates,
    ...workspaceFolders: vscode.Uri[]
): Promise<vscode.QuickPickItem[]> {
    const result: vscode.QuickPickItem[] = []
    for await (const uri of onDetectLocalTemplates({ workspaceUris: workspaceFolders })) {
        result.push({
            label: uri.fsPath
        })
    }

    return result
}

export function deactivate() {
}

function activateCodeLensProviders(
    configuration: SettingsConfiguration,
    toolkitOutputChannel: vscode.OutputChannel
): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = []

    TypescriptCodeLensProvider.initialize(configuration, toolkitOutputChannel)

    disposables.push(
        vscode.languages.registerCodeLensProvider(
            [
                {
                    language: 'javascript',
                    scheme: 'file',
                },
            ],
            new TypescriptCodeLensProvider()
        )
    )

    return disposables
}

/**
 * Performs SAM CLI relevant extension initialization
 */
async function initializeSamCli(): Promise<void> {
    vscode.commands.registerCommand(
        'aws.samcli.detect',
        async () => await PromiseSharer.getExistingPromiseOrCreate(
            'samcli.detect',
            async () => await SamCliDetection.detectSamCli(true)
        )
    )

    vscode.commands.registerCommand(
        'aws.samcli.validate.version',
        async () => {
            const samCliVersionValidator = new SamCliVersionValidator()
            await samCliVersionValidator.validateAndNotify()
        }
    )

    await SamCliDetection.detectSamCli(false)
}

function getExtensionAbsolutePath(context: vscode.ExtensionContext, relativeExtensionPath: string): string {
    return context.asAbsolutePath(relativeExtensionPath)
}
