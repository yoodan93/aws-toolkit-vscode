/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseCredentialsProviderFactory } from './credentialsProviderFactory'
import { Ec2InstanceCredentialsProvider } from './Ec2InstanceCredentialsProvider'

export class Ec2InstanceCredentialsProviderFactory extends BaseCredentialsProviderFactory<
    Ec2InstanceCredentialsProvider
> {
    public getCredentialType(): string {
        return Ec2InstanceCredentialsProvider.getCredentialsType()
    }

    public async refresh(): Promise<void> {
        // TODO
    }
}
