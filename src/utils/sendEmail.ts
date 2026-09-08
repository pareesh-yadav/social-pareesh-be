import { Resend } from 'resend';

interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendEmail = async (options: EmailOptions) => {
  const fromAddress = process.env.FROM_EMAIL || 'onboarding@resend.dev';
  const fromName = process.env.FROM_NAME ? `${process.env.FROM_NAME} ` : '';

  const { data, error } = await resend.emails.send({
    from: `${fromName}<${fromAddress}>`.trim(),
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html || options.text || '',
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }

  return data;
};