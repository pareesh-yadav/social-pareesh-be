import https from 'node:https';

interface SendEmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  otp?: string;
  toName?: string;
  templateParams?: Record<string, unknown>;
}

export const sendEmail = async (options: SendEmailOptions): Promise<void> => {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateId = process.env.EMAILJS_TEMPLATE_ID;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;

  if (!serviceId || !templateId || !publicKey) {
    throw new Error(
      'EmailJS credentials are not properly configured in environment variables (EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY)'
    );
  }

  const payload = JSON.stringify({
    service_id: serviceId,
    template_id: templateId,
    user_id: publicKey,
    ...(privateKey ? { accessToken: privateKey } : {}),
    template_params: {
      to_email: options.to,
      email: options.to,
      to_name: options.toName || options.to.split('@')[0],
      subject: options.subject,
      otp: options.otp || '',
      code: options.otp || '',
      message: options.text || options.html || '',
      html_content: options.html || '',
      ...options.templateParams,
    },
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      'https://api.emailjs.com/api/v1.0/email/send',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 15000,
      },
      (res) => {
        let responseText = '';
        res.on('data', (chunk) => {
          responseText += chunk;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(
              new Error(
                `EmailJS API request failed (${res.statusCode}): ${responseText || res.statusMessage}`
              )
            );
          }
        });
      }
    );

    req.on('error', (err) => {
      reject(new Error(`Failed to send email via EmailJS: ${err.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('EmailJS request timed out'));
    });

    req.write(payload);
    req.end();
  });
};