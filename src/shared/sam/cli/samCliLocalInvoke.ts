/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as child_process from 'child_process'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { fileExists } from '../../filesystemUtilities'
import { getLogger, Logger } from '../../logger'
import { ChildProcess } from '../../utilities/childProcess'
import { removeAnsi } from '../../utilities/textUtilities'
import { Timeout } from '../../utilities/timeoutUtils'
import { ChannelLogger } from '../../utilities/vsCodeUtils'
import { DefaultSamCliProcessInvokerContext, SamCliProcessInvokerContext } from './samCliInvoker'

const localize = nls.loadMessageBundle()

export const WAIT_FOR_DEBUGGER_MESSAGES = {
    PYTHON: 'Waiting for debugger to attach...',
    NODEJS: 'Debugger listening on',
    DOTNET: 'Waiting for the debugger to attach...',
}

export interface SamLocalInvokeCommandArgs {
    command: string
    args: string[]
    options?: child_process.SpawnOptions
    isDebug: boolean
    timeout?: Timeout
}

/**
 * Represents and manages the SAM CLI command that is run to locally invoke SAM Applications.
 */
export interface SamLocalInvokeCommand {
    invoke({}: SamLocalInvokeCommandArgs): Promise<void>
}

export class DefaultSamLocalInvokeCommand implements SamLocalInvokeCommand {
    private readonly logger: Logger = getLogger()

    public constructor(
        private readonly channelLogger: ChannelLogger,
        private readonly debuggerAttachCues: string[] = [
            WAIT_FOR_DEBUGGER_MESSAGES.PYTHON,
            WAIT_FOR_DEBUGGER_MESSAGES.NODEJS,
        ]
    ) {}

    public async invoke({ options, ...params }: SamLocalInvokeCommandArgs): Promise<void> {
        this.channelLogger.info(
            'AWS.running.command',
            'Running command: {0}',
            `${params.command} ${params.args.join(' ')}`
        )

        const childProcess = new ChildProcess(params.command, options, ...params.args)
        let debuggerPromiseClosed: boolean = false
        const debuggerPromise = new Promise<void>(async (resolve, reject) => {
            let checkForDebuggerAttachCue: boolean = params.isDebug && this.debuggerAttachCues.length !== 0

            await childProcess.start({
                onStdout: (text: string): void => {
                    this.emitMessage(text)
                    // If we have a timeout (as we do on debug) refresh the timeout as we receive text
                    params.timeout?.refresh()
                },
                onStderr: (text: string): void => {
                    this.emitMessage(text)
                    // If we have a timeout (as we do on debug) refresh the timeout as we receive text
                    params.timeout?.refresh()
                    if (checkForDebuggerAttachCue) {
                        // Look for messages like "Waiting for debugger to attach" before returning back to caller
                        if (this.debuggerAttachCues.some(cue => text.includes(cue))) {
                            checkForDebuggerAttachCue = false
                            this.logger.verbose('Local SAM App should be ready for a debugger to attach now.')
                            debuggerPromiseClosed = true
                            resolve()
                        }
                    }
                },
                onClose: (code: number, _: string): void => {
                    this.logger.verbose(`The child process for sam local invoke closed with code ${code}`)
                    this.channelLogger.channel.appendLine(
                        localize('AWS.samcli.local.invoke.ended', 'Local invoke of SAM Application has ended.')
                    )

                    // Handles scenarios where the process exited before we anticipated.
                    // Example: We didn't see an expected debugger attach cue, and the process or docker container
                    // was terminated by the user, or the user manually attached to the sam app.
                    if (!debuggerPromiseClosed) {
                        debuggerPromiseClosed = true
                        reject(new Error('The SAM Application closed unexpectedly'))
                    }
                },
                onError: (error: Error): void => {
                    this.channelLogger.error(
                        'AWS.samcli.local.invoke.error',
                        'Error running local SAM Application: {0}',
                        error
                    )
                    debuggerPromiseClosed = true
                    reject(error)
                },
            })

            if (!params.isDebug || this.debuggerAttachCues.length === 0) {
                debuggerPromiseClosed = true
                resolve()
            }
        })

        const awaitedPromises = params.timeout ? [debuggerPromise, params.timeout.timer] : [debuggerPromise]

        await Promise.race(awaitedPromises).catch(async () => {
            // did debugger promise resolve/reject? if not, this was a timeout: kill the process
            // otherwise, process closed out on its own; no need to kill the process
            if (!debuggerPromiseClosed) {
                const err = new Error('The SAM process did not make the debugger available within the timelimit')
                this.channelLogger.error(
                    'AWS.samcli.local.invoke.debugger.timeout',
                    'The SAM process did not make the debugger available within the time limit',
                    err
                )
                if (!childProcess.killed) {
                    childProcess.kill()
                }
                throw err
            }
        })
    }

    private emitMessage(text: string): void {
        // From VS Code API: If no debug session is active, output sent to the debug console is not shown.
        // We send text to output channel and debug console to ensure no text is lost.
        this.channelLogger.channel.append(removeAnsi(text))
        vscode.debug.activeDebugConsole.append(text)
    }
}

export interface SamCliLocalInvokeInvocationArguments {
    /**
     * The name of the resource in the SAM Template to be invoked.
     */
    templateResourceName: string
    /**
     * Location of the SAM Template to invoke locally against.
     */
    templatePath: string
    /**
     * Location of the file containing the Lambda Function event payload.
     */
    eventPath: string
    /**
     * Location of the file containing the environment variables to invoke the Lambda Function against.
     */
    environmentVariablePath: string
    /**
     * Environment variables set when invoking the SAM process (NOT passed to the Lambda).
     */
    environmentVariables?: NodeJS.ProcessEnv
    /**
     * When specified, starts the Lambda function container in debug mode and exposes this port on the local host.
     */
    debugPort?: string
    /**
     * Manages the sam cli execution.
     */
    invoker: SamLocalInvokeCommand
    /**
     * Specifies the name or id of an existing Docker network to Lambda Docker containers should connect to,
     * along with the default bridge network.
     * If not specified, the Lambda containers will only connect to the default bridge Docker network.
     */
    dockerNetwork?: string
    /**
     * - true: Do not pull the latest Docker image for Lambda runtime.
     * - false: Pull the latest Docker image if necessary
     */
    skipPullImage?: boolean
    /**
     * Host path to a debugger that will be mounted into the Lambda container.
     */
    debuggerPath?: string
    /**
     * parameter overrides specified in the `sam.template.parameters` field
     */
    parameterOverrides?: string[]
    /** SAM args specified by user (`sam.localArguments`). */
    extraArgs?: string[]
}

/**
 * An elaborate way to run `sam local`.
 */
export class SamCliLocalInvokeInvocation {
    private readonly invokerContext: SamCliProcessInvokerContext

    public constructor(private readonly args: SamCliLocalInvokeInvocationArguments) {
        this.args.skipPullImage = !!this.args.skipPullImage

        // Enterprise!
        this.invokerContext = new DefaultSamCliProcessInvokerContext()
    }

    public async execute(timeout?: Timeout): Promise<void> {
        await this.validate()

        const samCommand = this.invokerContext.cliConfig.getSamCliLocation() ?? 'sam'
        const invokeArgs = [
            'local',
            'invoke',
            this.args.templateResourceName,
            '--template',
            this.args.templatePath,
            '--event',
            this.args.eventPath,
            '--env-vars',
            this.args.environmentVariablePath,
        ]

        this.addArgumentIf(invokeArgs, !!this.args.debugPort, '-d', this.args.debugPort!)
        this.addArgumentIf(invokeArgs, !!this.args.dockerNetwork, '--docker-network', this.args.dockerNetwork!)
        this.addArgumentIf(invokeArgs, !!this.args.skipPullImage, '--skip-pull-image')
        this.addArgumentIf(invokeArgs, !!this.args.debuggerPath, '--debugger-path', this.args.debuggerPath!)
        this.addArgumentIf(
            invokeArgs,
            !!this.args.parameterOverrides && this.args.parameterOverrides.length > 0,
            '--parameter-overrides',
            ...(this.args.parameterOverrides ?? [])
        )
        invokeArgs.push(...(this.args.extraArgs ?? []))

        await this.args.invoker.invoke({
            options: {
                env: {
                    ...process.env,
                    ...this.args.environmentVariables,
                },
            },
            command: samCommand,
            args: invokeArgs,
            isDebug: !!this.args.debugPort,
            timeout,
        })
    }

    protected async validate(): Promise<void> {
        if (!this.args.templateResourceName) {
            throw new Error('template resource name is missing or empty')
        }

        if (!(await fileExists(this.args.templatePath))) {
            throw new Error(`template path does not exist: ${this.args.templatePath}`)
        }

        if (!(await fileExists(this.args.eventPath))) {
            throw new Error(`event path does not exist: ${this.args.eventPath}`)
        }
    }

    private addArgumentIf(args: string[], addIfConditional: boolean, ...argsToAdd: string[]) {
        if (addIfConditional) {
            args.push(...argsToAdd)
        }
    }
}
