import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // Gmail için true olmalı
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS, // Gmail Uygulama Şifresi (App Password)
  },
});

export async function sendEmail({ 
  to, 
  cc,
  subject, 
  html, 
  attachments 
}: { 
  to: string; 
  cc?: string | string[];
  subject: string; 
  html: string; 
  attachments?: { filename: string; content: Buffer | string }[];
}) {
  try {
    const info = await transporter.sendMail({
      from: `"Lavaş Trace" <${process.env.SMTP_USER}>`,
      to,
      cc,
      subject,
      html,
      attachments,
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Mail gönderme hatası:', error);
    return { success: false, error };
  }
}
