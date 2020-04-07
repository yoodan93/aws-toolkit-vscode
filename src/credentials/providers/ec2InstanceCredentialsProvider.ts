/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AWS from 'aws-sdk'
import { CredentialsProvider } from './credentialsProvider'
import { CredentialsProviderId } from './credentialsProviderId'

export class Ec2InstanceCredentialsProvider implements CredentialsProvider {
    private static readonly CREDENTIALS_TYPE = 'ec2Instance'
    private static readonly PROFILE_NAME = 'ec2Instance'
    public getCredentialsProviderId(): CredentialsProviderId {
        return {
            credentialType: Ec2InstanceCredentialsProvider.CREDENTIALS_TYPE,
            credentialTypeId: Ec2InstanceCredentialsProvider.PROFILE_NAME,
        }
    }
    public getDefaultRegion(): string | undefined {
        throw new Error('Method not implemented.')
    }
    public getHashCode(): string {
        throw new Error('Method not implemented.')
    }
    public async getCredentials(): Promise<AWS.Credentials> {
        const provider = new AWS.CredentialProviderChain([
            () =>
                new AWS.EC2MetadataCredentials({
                    httpOptions: { timeout: 5000 },
                    maxRetries: 10,
                }),
        ])
        return await provider.resolvePromise()
    }
    public canAutoConnect(): boolean {
        throw new Error('Method not implemented.')
    }

    public static getCredentialsType(): string {
        return Ec2InstanceCredentialsProvider.CREDENTIALS_TYPE
    }
}
