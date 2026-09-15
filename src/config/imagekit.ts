import ImageKit from '@imagekit/nodejs';
import crypto from 'crypto';

export const publicKey = process.env.IMAGEKIT_PUBLIC_KEY || 'public_placeholder';
export const privateKey = process.env.IMAGEKIT_PRIVATE_KEY || 'private_placeholder';
export const urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT || 'https://ik.imagekit.io/placeholder';

let imagekitInstance: ImageKit | null = null;

export const getImageKitClient = (): ImageKit => {
  if (!imagekitInstance) {
    imagekitInstance = new ImageKit({
      privateKey,
    });
  }
  return imagekitInstance;
};

export const getUploadAuthParameters = (token?: string, expire?: number) => {
  const ik = getImageKitClient();
  const customToken = token || crypto.randomUUID();
  const customExpire = expire || Math.floor(Date.now() / 1000) + 60 * 30; // 30 minutes validity

  try {
    const authParams = ik.helper.getAuthenticationParameters(customToken, customExpire);
    return {
      token: authParams.token || customToken,
      expire: authParams.expire || customExpire,
      signature: authParams.signature,
      publicKey,
    };
  } catch (error) {
    // Cryptographic fallback for environments without valid private keys
    const signature = crypto
      .createHmac('sha1', privateKey)
      .update(customToken + customExpire)
      .digest('hex');

    return {
      token: customToken,
      expire: customExpire,
      signature,
      publicKey,
    };
  }
};

export const deleteImageKitFile = async (fileId: string): Promise<boolean> => {
  if (!fileId || fileId.startsWith('placeholder_')) return true;
  try {
    const ik = getImageKitClient();
    await ik.files.delete(fileId);
    return true;
  } catch (error) {
    console.error(`[ImageKit] Failed to delete file ${fileId}:`, error);
    return false;
  }
};
