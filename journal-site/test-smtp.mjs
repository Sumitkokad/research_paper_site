
import fs from 'node:fs';
import nodemailer from 'nodemailer';

function loadEnv() {
  if (!fs.existsSync('.env')) {
    throw new Error('.env file not found in project root');
  }

  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const index = trimmed.indexOf('=');
    if (index < 1) continue;

    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

async function testSMTP() {
  loadEnv();

  const {
    SMTP_HOST,
    SMTP_USER,
    SMTP_PASSWORD,
    MAIL_FROM_ADDRESS,
    MAIL_FROM_NAME
  } = process.env;

  const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
  const SMTP_SECURE =
    String(process.env.SMTP_SECURE ?? 'true').toLowerCase() === 'true';

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD || !MAIL_FROM_ADDRESS) {
    throw new Error('Missing SMTP environment variables in .env');
  }

  if (SMTP_PASSWORD.includes(' ')) {
    throw new Error('Remove spaces from your Google App Password.');
  }

  console.log('Connecting to Gmail SMTP...');
  console.log(`SMTP Host: ${SMTP_HOST}`);
  console.log(`SMTP User: ${SMTP_USER}`);
  console.log('Password: Loaded (hidden)');

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASSWORD
    },
    connectionTimeout: 15000
  });

  try {
    await transporter.verify();
    console.log('SUCCESS: Gmail authentication works.');

    const result = await transporter.sendMail({
      from: {
        name: MAIL_FROM_NAME || 'ijrise Editorial Office',
        address: MAIL_FROM_ADDRESS
      },
      to: SMTP_USER,
      subject: 'ijrise SMTP Test Email',
      text: 'Your ijrise journal SMTP configuration is working successfully.'
    });

    console.log('SUCCESS: Test email accepted by Gmail.');
    console.log('Message ID:', result.messageId);
    console.log('Check your Inbox and Spam folder.');
  } finally {
    transporter.close();
  }
}

testSMTP().catch(error => {
  console.error('\nSMTP TEST FAILED');
  console.error('Error code:', error.code || 'UNKNOWN');
  console.error('Error:', error.message);
  console.error('\nDo not share your SMTP password.');
  process.exitCode = 1;
});
