/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import { AwsService } from '@aws/workbench-core-base';
import {
  EnvironmentConnectionService,
  EnvironmentConnectionLinkPlaceholder
} from '@aws/workbench-core-environments';

export default class EC2VSCode1710EnvironmentConnectionService implements EnvironmentConnectionService {
  private _envType: string = 'ec2VSCode1710';
  /**
   * Get credentials for connecting to the environment
   */
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  public async getAuthCreds(instanceName: string, context?: any): Promise<any> {
    const authorizedUrl = await this.getVSCodeUrl(instanceName, context);
    return { url: authorizedUrl };
  }

  /**
   * Instructions for connecting to the workspace that can be shown verbatim in the UI
   */
  public getConnectionInstruction(): Promise<string> {
    // "url" is the key of the response returned by the method `getAuthCreds`
    const link: EnvironmentConnectionLinkPlaceholder = {
      type: 'link',
      hrefKey: 'url',
      text: 'Vscode URL'
    };
    return Promise.resolve(`To access Vscode, open #${JSON.stringify(link)}`);
  }

  /**
   * Get Vscode connection URL by reading public key from SSM parameter.
   */
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  public async getVSCodeUrl(instanceId: string, context?: any): Promise<string> {
    const secureConnectionMetadata = JSON.parse(process.env.SECURE_CONNECTION_METADATA!);
    const { partnerDomain } = secureConnectionMetadata;
    const envId = context.envId;
    const accessToken = await this.getVSCodeToken(instanceId, context);
    const authorizedUrl = `https://${this._envType}-${envId}.${partnerDomain}/login-with-password?password=${accessToken}`;
    return authorizedUrl;
  }

  /**
   * Get VSCode access key from SSM parameter.
   */
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  public async getVSCodeToken(instanceId: string, context?: any): Promise<string> {
    const region = process.env.AWS_REGION!;
    const awsService = new AwsService({ region });
    const hostingAccountAwsService = await awsService.getAwsServiceForRole({
      roleArn: context.roleArn,
      roleSessionName: `VSCodeConnect-${Date.now()}`,
      externalId: context.externalId,
      region
    });

    const response = await hostingAccountAwsService.clients.ssm.getParameter({
      Name: `/vscode/access-token/sc-environments/ec2-instance/${instanceId}`,
      WithDecryption: true
    });
    return response.Parameter!.Value!;
  }
}