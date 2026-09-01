const { prisma } = require('./src/config/database');
const crypto = require('node:crypto');

const base = 'http://localhost:3000/api';

async function findOtpForUser(email) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.resetPasswordToken) {
    throw new Error('User missing or OTP missing');
  }

  for (let i = 100000; i <= 999999; i += 1) {
    const hash = crypto.createHash('sha256').update(String(i)).digest('hex');
    if (hash === user.resetPasswordToken) {
      return String(i);
    }
  }

  throw new Error('OTP not found in range');
}

(async () => {
  const username = 'smoketest_' + Date.now();
  const email = 'smoketest_' + Date.now() + '@example.com';
  const password = 'Abcd123!';

  const regRes = await fetch(base + '/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password })
  });

  const regJson = await regRes.json();
  console.log('REGISTER', regRes.status, JSON.stringify(regJson));

  const verificationOtp = await findOtpForUser(email);
  const verifyRes = await fetch(base + '/auth/verify-registration', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp: verificationOtp })
  });
  const verifyJson = await verifyRes.json();
  console.log('VERIFY', verifyRes.status, JSON.stringify(verifyJson));

  const loginRes = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const loginJson = await loginRes.json();
  console.log('LOGIN', loginRes.status, JSON.stringify(loginJson));

  const forgotRes = await fetch(base + '/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  const forgotJson = await forgotRes.json();
  console.log('FORGOT', forgotRes.status, JSON.stringify(forgotJson));

  const resetOtp = await findOtpForUser(email);
  const newPassword = 'NewPass123!';
  const resetRes = await fetch(base + '/auth/reset-password', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp: resetOtp, password: newPassword })
  });
  const resetJson = await resetRes.json();
  console.log('RESET', resetRes.status, JSON.stringify(resetJson));

  const reloginRes = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: newPassword })
  });
  const reloginJson = await reloginRes.json();
  console.log('RELOGIN', reloginRes.status, JSON.stringify(reloginJson));

  await prisma.$disconnect();
  console.log('AUTH_SMOKE_TEST_OK');
})().catch((error) => {
  console.error('AUTH_SMOKE_TEST_FAIL', error && error.message ? error.message : error);
  process.exit(1);
});
