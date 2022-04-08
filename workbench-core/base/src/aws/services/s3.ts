import {
  ListObjectsCommand,
  ListObjectsCommandInput,
  ListObjectsCommandOutput,
  PutObjectCommand,
  PutObjectCommandInput,
  PutObjectCommandOutput,
  S3Client
} from '@aws-sdk/client-s3';

// Documentation for client and methods
// https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/index.html

export default class S3 {
  private _client: S3Client;
  public constructor(options: { region: string }) {
    this._client = new S3Client({ ...options });
  }

  public putObject(params: PutObjectCommandInput): Promise<PutObjectCommandOutput> {
    return this._client.send(new PutObjectCommand(params));
  }

  public listObject(params: ListObjectsCommandInput): Promise<ListObjectsCommandOutput> {
    return this._client.send(new ListObjectsCommand(params));
  }
}