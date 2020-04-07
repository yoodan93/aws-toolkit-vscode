/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AWS from 'aws-sdk'
import { CredentialsProvider } from './credentialsProvider'
import { CredentialsProviderId } from './credentialsProviderId'
import { getStringHash } from '../../shared/utilities/textUtilities'

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
        return undefined
    }
    public getHashCode(): string {
        return getStringHash(Ec2InstanceCredentialsProvider.PROFILE_NAME)
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

    // TODO
    public canAutoConnect(): boolean {
        return true
    }

    public static getCredentialsType(): string {
        return Ec2InstanceCredentialsProvider.CREDENTIALS_TYPE
    }
}
