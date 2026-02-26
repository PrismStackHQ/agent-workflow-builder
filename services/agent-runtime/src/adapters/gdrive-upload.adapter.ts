import { Injectable, Logger } from '@nestjs/common';
import { IStepAdapter, StepContext } from './adapter.interface';

@Injectable()
export class GdriveUploadAdapter implements IStepAdapter {
  readonly action = 'upload_files';
  private readonly logger = new Logger(GdriveUploadAdapter.name);

  async execute(params: Record<string, unknown>, context: StepContext): Promise<unknown> {
    this.logger.log(`[STUB] Uploading files to Google Drive folder: ${params.folder}`);

    const token = context.tokens.get('gdrive');
    this.logger.log(`[STUB] GDrive token available: ${!!token}`);

    // Get receipts from previous step
    const previousResult = context.previousResults[context.previousResults.length - 1] as any;
    const receipts = previousResult?.receipts || [];

    // In production, this would use Google Drive API
    const uploaded = receipts.map((receipt: any, index: number) => ({
      fileName: `receipt_${receipt.id}.pdf`,
      driveFileId: `mock-drive-file-${index}`,
      folder: params.folder || 'Receipts',
      uploadedAt: new Date().toISOString(),
    }));

    this.logger.log(`[STUB] Uploaded ${uploaded.length} files to Google Drive`);

    return {
      uploaded,
      totalUploaded: uploaded.length,
    };
  }
}
