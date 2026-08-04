import path from 'path';

export const helpers = {
  /**
   * Generate a unique filename
   */
  generateFileName: (originalName: string): string => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const ext = path.extname(originalName);
    return `${timestamp}-${random}${ext}`;
  },

  /**
   * Validate file size
   */
  validateFileSize: (fileSize: number, maxSize: number = 5242880): boolean => {
    return fileSize <= maxSize;
  },

  /**
   * Get allowed file types
   */
  getAllowedFileTypes: (): string[] => {
    return ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  },

  /**
   * Check if file type is allowed
   */
  isFileTypeAllowed: (fileType: string): boolean => {
    return helpers.getAllowedFileTypes().includes(fileType);
  },

  /**
   * Format response
   */
  formatResponse: <T>(
    success: boolean,
    data?: T,
    message?: string,
    error?: string
  ) => {
    return {
      success,
      data: data || undefined,
      message: message || undefined,
      error: error || undefined,
    };
  },

  /**
   * Paginate array
   */
  paginate: <T>(array: T[], page: number, limit: number) => {
    const start = (page - 1) * limit;
    const end = start + limit;
    return {
      items: array.slice(start, end),
      total: array.length,
      page,
      limit,
    };
  },

  /**
   * Generate random string
   */
  generateRandomString: (length: number = 32): string => {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },

  /**
   * Check if email is valid
   */
  isValidEmail: (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  /**
   * Delay execution
   */
  delay: (ms: number): Promise<void> => {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },
};