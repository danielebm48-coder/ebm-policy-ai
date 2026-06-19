import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.development' });

async function testApprovals() {
  const apiBaseUrl = 'https://ebm-policy-ai.onrender.com';
  // Use dguzman's real data from DB
  const userId = 'u_dguzman_admin';
  const role = 'directivo';
  const email = 'dguzman@ebm.edu.sv';

  console.log(`Testing approvals for ${email} (${userId}, ${role})...`);

  try {
    const response = await fetch(`${apiBaseUrl}/api/auth/approvals`, {
      headers: {
        'x-user-id': userId,
        'x-user-role': role,
        'x-user-email': email
      }
    });

    const data = await response.json();
    console.log('Response Status:', response.status);
    console.log('Data:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error:', e);
  }
}

testApprovals();
