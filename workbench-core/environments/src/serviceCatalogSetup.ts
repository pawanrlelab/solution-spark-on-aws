/* eslint-disable security/detect-non-literal-fs-filename */
import { AwsService } from '@amzn/workbench-core-base';

import fs from 'fs';
import md5File from 'md5-file';
import { join } from 'path';
import {
  InvalidParametersException,
  ListPortfoliosCommandInput,
  PortfolioDetail,
  ProductViewDetail
} from '@aws-sdk/client-service-catalog';

export default class ServiceCatalogSetup {
  private _aws: AwsService;
  private _constants: {
    AWS_REGION: string;
    S3_ARTIFACT_BUCKET_SC_PREFIX: string;
    PORTFOLIO_NAME: string;
    S3_ARTIFACT_BUCKET_ARN_NAME: string;
    LAUNCH_CONSTRAINT_ROLE_NAME: string;
    STACK_NAME: string;
  };

  public constructor(constants: {
    AWS_REGION: string;
    S3_ARTIFACT_BUCKET_SC_PREFIX: string;
    PORTFOLIO_NAME: string;
    S3_ARTIFACT_BUCKET_ARN_NAME: string;
    LAUNCH_CONSTRAINT_ROLE_NAME: string;
    STACK_NAME: string;
  }) {
    this._constants = constants;

    const { AWS_REGION } = constants;
    this._aws = new AwsService({ AWS_REGION });
  }

  public async run(cfnFilePaths: string[]): Promise<void> {
    const { S3_ARTIFACT_BUCKET_SC_PREFIX, PORTFOLIO_NAME } = this._constants;
    const portfolioName = PORTFOLIO_NAME;

    // Create SC portfolio if portfolio doesn't exist
    let portfolioId = await this._getPortfolioId(portfolioName);
    if (portfolioId === undefined) {
      console.log('Creating new portfolio, because portfolio does not exist');
      portfolioId = await this._createSCPortfolio(portfolioName);
    }
    console.log('PortfolioId', portfolioId);
    const { s3ArtifactBucketName, launchConstraintRoleName } = await this._getCfnOutputs();
    const prefix = S3_ARTIFACT_BUCKET_SC_PREFIX;

    // Upload environment's CFN templates to S3 if current template is different from template in S3
    const envTypeToFilePath = await this._getEnvTypeToUpdate(s3ArtifactBucketName, prefix, cfnFilePaths);
    await this._uploadTemplateToS3(s3ArtifactBucketName, prefix, Object.values(envTypeToFilePath));
    const envTypes: string[] = Object.keys(envTypeToFilePath);
    if (envTypes.length === 0) {
      console.log('No new environment type to update or add to Service Catalog portfolio');
      return;
    }

    // Create SC Products if needed. The SC product name will have the same name as the `envType`
    for (const productName of envTypes) {
      let productId = await this._getProductId(portfolioId, productName);
      if (productId) {
        console.log(`Updating product because product already exist: ${productName}`);
        await this._updateProduct(s3ArtifactBucketName, prefix, productName, productId);
      } else {
        console.log('Product does not exist, creating product and adding to portfolio');
        productId = await this._addProductsToPortfolio(
          s3ArtifactBucketName,
          prefix,
          productName,
          portfolioId
        );
      }

      // This is the role assumed by SC when launching a product
      console.log(`Create launch constraint for ${productName} if launch constraint does not exist`);
      await this._createLaunchConstraint(portfolioId, productId, launchConstraintRoleName);
    }
  }

  public getCfnTemplate(envFolderPath: string): string[] {
    // nosemgrep
    const fileAndDirInEnvFolder = fs.readdirSync(envFolderPath);
    // Each directory is an environment type
    const dirInEnvFolder = [];
    for (const name of fileAndDirInEnvFolder) {
      // nosemgrep
      const isDirectory = fs.lstatSync(join(envFolderPath, name)).isDirectory();
      if (isDirectory) {
        dirInEnvFolder.push(name);
      }
    }
    const cfnFilePaths = [];
    for (const directory of dirInEnvFolder) {
      // nosemgrep
      const cfnFileNames = fs.readdirSync(join(envFolderPath, directory)).filter((name) => {
        return name.slice(-8) === 'cfn.yaml';
      });
      if (cfnFileNames.length > 1) {
        throw Error('There should only be one cloudformation template in each environment type folder');
      }
      cfnFilePaths.push(join(envFolderPath, directory, cfnFileNames[0]));
    }
    return cfnFilePaths;
  }

  protected async _getCfnOutputs(): Promise<{
    s3ArtifactBucketName: string;
    launchConstraintRoleName: string;
  }> {
    const { S3_ARTIFACT_BUCKET_ARN_NAME, LAUNCH_CONSTRAINT_ROLE_NAME, STACK_NAME } = this._constants;
    const describeStackParam = {
      StackName: STACK_NAME
    };

    const stackOutput = await this._aws.cloudformation.describeStacks(describeStackParam);

    const s3BucketNameExport = stackOutput.Stacks![0].Outputs!.find((output) => {
      return output.OutputKey && output.OutputKey === S3_ARTIFACT_BUCKET_ARN_NAME;
    });

    let s3ArtifactBucketName = '';
    if (s3BucketNameExport && s3BucketNameExport.OutputValue) {
      const arn = s3BucketNameExport.OutputValue;
      const bucketName = arn.split(':').pop();
      if (bucketName) {
        s3ArtifactBucketName = bucketName;
      } else {
        throw new Error(`Cannot get bucket name from arn ${arn}`);
      }
    } else {
      throw new Error(`Cannot find output value for S3 Bucket with name: ${S3_ARTIFACT_BUCKET_ARN_NAME}`);
    }

    let launchConstraintRoleName = '';
    const lcRoleNameExport = stackOutput.Stacks![0].Outputs!.find((output) => {
      return output.OutputKey && output.OutputKey.includes(LAUNCH_CONSTRAINT_ROLE_NAME);
    });
    if (lcRoleNameExport && lcRoleNameExport.OutputValue) {
      launchConstraintRoleName = lcRoleNameExport.OutputValue;
    } else {
      throw new Error(
        `Cannot find output value for Launch Contraint role name with name: ${LAUNCH_CONSTRAINT_ROLE_NAME}`
      );
    }

    return { s3ArtifactBucketName, launchConstraintRoleName };
  }

  private async _createLaunchConstraint(
    portfolioId: string,
    productId: string,
    roleName: string
  ): Promise<void> {
    const lcParam = {
      PortfolioId: portfolioId,
      ProductId: productId,
      Type: 'LAUNCH',
      Parameters: `{"LocalRoleName": "${roleName}" }`
    };

    try {
      await this._aws.serviceCatalog.createConstraint(lcParam);
    } catch (e) {
      if (
        e instanceof InvalidParametersException &&
        e.message === 'Only one constraint can be specified from these types: [LAUNCH, STACKSET]'
      ) {
        console.log(`Launch Constraint for ${productId} has already been created`);
      } else {
        throw e;
      }
    }
  }

  private async _uploadTemplateToS3(s3Bucket: string, prefix: string, filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      const fileName = filePath.split('/').pop();
      // nosemgrep
      const fileContent = fs.readFileSync(filePath);
      const putObjectParam = {
        Bucket: s3Bucket,
        Key: `${prefix}${fileName}`,
        Body: fileContent
      };

      await this._aws.s3.putObject(putObjectParam);
    }
  }

  private async _getEnvTypeToUpdate(
    s3Bucket: string,
    prefix: string,
    cfnFilePaths: string[]
  ): Promise<{ [key: string]: string }> {
    // By default up to 1000 files are returned. It's unlikely users will have more than 1000 environment types, which is
    // why we do not try to get more than 1000 files
    // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/interfaces/listobjectscommandinput.html#maxkeys
    const listS3ObjectsParam = {
      Bucket: s3Bucket,
      Prefix: prefix
    };

    const listObjectOutput = await this._aws.s3.listObject(listS3ObjectsParam);

    const S3FileNameToEtag: { [key: string]: string } = {};
    if (listObjectOutput.Contents) {
      listObjectOutput.Contents.forEach((content) => {
        if (content.Key && content.ETag) {
          const S3FileName = content.Key.split('/').pop();
          if (S3FileName) {
            // eslint-disable-next-line security/detect-object-injection
            S3FileNameToEtag[S3FileName] = content.ETag.replace(/"/g, '');
          }
        }
      });
    }
    const envsToFilePath: { [key: string]: string } = {};
    cfnFilePaths.forEach((filePath: string) => {
      const fileName = filePath.split('/').pop();
      if (fileName) {
        const localCfnTemplateMd5Sum = md5File.sync(cfnFilePaths[0]);
        // eslint-disable-next-line security/detect-object-injection
        if (localCfnTemplateMd5Sum !== S3FileNameToEtag[fileName]) {
          const envType = fileName.replace('.cfn.yaml', '');
          // eslint-disable-next-line security/detect-object-injection
          envsToFilePath[envType] = filePath;
        }
      }
    });
    return envsToFilePath;
  }

  private async _updateProduct(
    s3Bucket: string,
    prefix: string,
    productName: string,
    productId: string
  ): Promise<void> {
    const describeProductParam = {
      Id: productId
    };

    const product = await this._aws.serviceCatalog.describeProductAsAdmin(describeProductParam);

    if (product.ProvisioningArtifactSummaries) {
      const names: string[] = product.ProvisioningArtifactSummaries.map((artifact) => {
        return artifact.Name!;
      });

      const largestVersionNumber: number | undefined = names
        .map((name) => {
          return Number(name.replace('v', ''));
        })
        .sort()
        .pop();

      if (largestVersionNumber === undefined) {
        throw new Error(`Product ${productId} has no product versions`);
      }

      //Update product version
      const newVersionName = `v${(largestVersionNumber + 1).toString()}`;
      const provisioningArtifactParam = {
        ProductId: productId,
        IdempotencyToken: `${productId}-${newVersionName}`,
        Parameters: {
          Name: newVersionName,
          DisableTemplateValidation: true,
          Info: {
            LoadTemplateFromURL: `https://${s3Bucket}.s3.amazonaws.com/${prefix}${productName}.cfn.yaml`
          },
          Type: 'CLOUD_FORMATION_TEMPLATE',
          Description: 'Auto-created by post deployment script'
        }
      };

      await this._aws.serviceCatalog.createProvisioningArtifact(provisioningArtifactParam);
      console.log('Successfully created new version of product');
    }
  }

  private async _getProductId(portfolioId: string, productName: string): Promise<string | undefined> {
    const searchProductParam = {
      PortfolioId: portfolioId
    };

    const productsResponse = await this._aws.serviceCatalog.searchProductsAsAdmin(searchProductParam);
    let product: ProductViewDetail | undefined = undefined;
    if (productsResponse.ProductViewDetails) {
      product = productsResponse.ProductViewDetails.find((detail: ProductViewDetail) => {
        return detail.ProductViewSummary ? detail.ProductViewSummary.Name === productName : false;
      });
    }
    return product && product.ProductViewSummary ? product.ProductViewSummary.ProductId : undefined;
  }

  private async _getPortfolioId(portfolioName: string): Promise<string | undefined> {
    let portfolioDetails: PortfolioDetail[] = [];
    let pageToken: string | undefined = undefined;
    do {
      const listPortfolioInput: ListPortfoliosCommandInput = {
        PageToken: pageToken,
        PageSize: 20
      };
      const listPortfolioOutput = await this._aws.serviceCatalog.listPortfolios(listPortfolioInput);
      pageToken = listPortfolioOutput.NextPageToken;
      if (listPortfolioOutput.PortfolioDetails) {
        portfolioDetails = portfolioDetails.concat(listPortfolioOutput.PortfolioDetails);
      }
    } while (pageToken);
    const portfolio = portfolioDetails.find((portfolio: PortfolioDetail) => {
      return portfolio.DisplayName === portfolioName;
    });

    return portfolio ? portfolio.Id : undefined;
  }

  private async _createSCPortfolio(portfolioName: string): Promise<string> {
    const portfolioToCreateParam = {
      DisplayName: portfolioName,
      ProviderName: '_system_',
      Description: 'Portfolio for managing SWB environments'
    };

    const response = await this._aws.serviceCatalog.createPortfolio(portfolioToCreateParam);
    return response.PortfolioDetail!.Id!;
  }

  private async _addProductsToPortfolio(
    s3Bucket: string,
    prefix: string,
    productName: string,
    portfolioId: string
  ): Promise<string> {
    const productToCreateParam = {
      Name: productName,
      Description: 'Auto-created by post deployment script',
      Owner: '_system_',
      ProductType: 'CLOUD_FORMATION_TEMPLATE',
      ProvisioningArtifactParameters: {
        DisableTemplateValidation: true,
        Info: {
          LoadTemplateFromURL: `https://${s3Bucket}.s3.amazonaws.com/${prefix}${productName}.cfn.yaml`
        },
        Type: 'CLOUD_FORMATION_TEMPLATE',
        Name: 'v1',
        Description: 'Auto-created by post deployment script'
      }
    };
    const response = await this._aws.serviceCatalog.createProduct(productToCreateParam);
    await this._associateProductWithPortfolio(
      response.ProductViewDetail!.ProductViewSummary!.ProductId!,
      portfolioId
    );
    return response.ProductViewDetail!.ProductViewSummary!.ProductId!;
  }

  private async _associateProductWithPortfolio(productId: string, portfolioId: string): Promise<void> {
    const associateProductParam = {
      PortfolioId: portfolioId,
      ProductId: productId
    };

    await this._aws.serviceCatalog.associateProductWithPorfolio(associateProductParam);
  }
}