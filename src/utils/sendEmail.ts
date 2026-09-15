interface SendEmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  otp?: string;
  toName?: string;
  templateParams?: Record<string, unknown>;
}

const EMAILJS_API_URL = 'https://api.emailjs.com/api/v1.0/email/send';

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

  const payload = {
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
  };

  const response = await fetch(EMAILJS_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`EmailJS API request failed (${response.status}): ${errorText || response.statusText}`);
  }
};