/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { join } from 'path'

// Set up some environment variables so the VS Code Test script knows where the tests are located
process.env.CODE_TESTS_PATH = join(process.cwd(), 'out', 'src', 'integrationTest')
process.env.CODE_EXTENSIONS_PATH = process.cwd()

// Launch the VS Code Test Script
// tslint:disable-next-line: no-var-requires
require('../node_modules/vscode/bin/test')