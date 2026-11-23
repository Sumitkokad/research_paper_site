import nodemailer from 'nodemailer';

// Read directly from .env (Node 20.6+ supports --env-file)
const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASSWORD,
  MAIL_FROM_ADDRESS,
} = process.env;

console.log('--- SMTP Configuration ---');
console.log('HOST:', SMTP_HOST);
console.log('PORT:', SMTP_PORT);
console.log('SECURE:', SMTP_SECURE);
console.log('USER:', SMTP_USER);
console.log('FROM:', MAIL_FROM_ADDRESS);
console.log('--------------------------');

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT),
  secure: String(SMTP_SECURE).toLowerCase() === 'true',
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASSWORD,
  },
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 15000,
});

try {
  // 1. Verify the connection and credentials first
  await transporter.verify();
  console.log('✅ SMTP connection and credentials are valid');

  // 2. Send an actual test email
  const info = await transporter.sendMail({
    from: MAIL_FROM_ADDRESS || SMTP_USER,
    to: SMTP_USER, // send to yourself
    subject: `SMTP test ${new Date().toISOString()}`,
    text: 'If you receive this, your nodemailer SMTP configuration is working.',
    html: '<p>If you receive this, your <b>nodemailer</b> SMTP configuration is working.</p>',
  });

  console.log('✅ Email sent successfully');
  console.log('Message ID:', info.messageId);
} catch (error) {
  console.error('❌ SMTP test failed:');
  console.error(error.message);
  if (error.code) console.error('Error code:', error.code);
  process.exitCode = 1;
} finally {
  transporter.close();
}