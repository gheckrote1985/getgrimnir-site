// v3 - fix payload parsing
const https = require('https');

function httpsPost(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function callClaude(name, company, erp, issue) {
  const prompt = `You are writing a personalized email on behalf of Gerald Heckrote, founder of Grimnir — a manufacturing intelligence tool for job shops.

The person who filled out our form:
- Name: ${name}
- Company: ${company}
- ERP System: ${erp}
- Biggest Problem: ${issue}

Write a personalized 3-paragraph email that:
1. Opens by acknowledging their specific problem in plain manufacturing language — like you've seen this exact problem in real shops
2. Explains specifically how Grimnir addresses it, referencing their ERP by name where natural. Be concrete — mention specific features like the anomaly feed, work center efficiency scoring, late job early warning, or AI assistant depending on what fits their problem
3. Closes with a soft invite — either download the free trial or book a 20-minute call. Keep it low pressure.

Tone: direct, peer-to-peer, practical. Not salesy. Gerald worked as a Production Planning Engineer at a job shop. Write like he's talking to a colleague, not a prospect.

Do not use subject line in the body. Do not use placeholders. Write the actual email body only, 3 paragraphs, no headers.`;

  const requestBody = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }]
  });

  const options = {
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(requestBody)
    }
  };

  const response = await httpsPost(options, requestBody);
  if (response.status !== 200) {
    throw new Error(`Claude API error: ${response.status} ${response.body}`);
  }
  const parsed = JSON.parse(response.body);
  return parsed.content[0].text;
}

async function sendEmail(toEmail, toName, company, erp, issue, emailBody) {
  const subject = `How Grimnir addresses: ${issue}`;

  const htmlBody = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a2e;">
  <div style="background: #0d1f35; padding: 24px 32px; border-radius: 8px 8px 0 0;">
    <span style="font-family: Georgia, serif; font-size: 22px; font-weight: bold; color: #ffffff;">Grim<span style="color: #00a896;">nir</span></span>
  </div>
  <div style="background: #ffffff; padding: 32px; border: 1px solid #e0e0e0; border-top: none;">
    <p style="font-size: 15px; line-height: 1.7; color: #2C3E50;">Hi ${toName},</p>
    ${emailBody.split('\n\n').map(p => `<p style="font-size: 15px; line-height: 1.7; color: #2C3E50;">${p.trim()}</p>`).join('')}
    <div style="margin: 32px 0; text-align: center;">
      <a href="https://getgrimnir.com/download" style="background: #00a896; color: #0d1f35; padding: 14px 28px; border-radius: 8px; font-weight: bold; text-decoration: none; display: inline-block; margin-right: 12px;">Download Free Trial</a>
      <a href="https://calendly.com/gheckrote-jomplcc/30min" style="background: transparent; color: #00a896; padding: 13px 28px; border-radius: 8px; font-weight: bold; text-decoration: none; display: inline-block; border: 2px solid #00a896;">Book a 20-Min Call</a>
    </div>
    <p style="font-size: 13px; color: #888; margin-top: 32px;">— Gerald Heckrote<br>Founder, Grimnir / JOMP LLC<br><a href="mailto:gerald@jomplcc.com" style="color: #00a896;">gerald@jomplcc.com</a></p>
  </div>
  <div style="background: #f5f5f5; padding: 16px 32px; border-radius: 0 0 8px 8px; font-size: 12px; color: #999; text-align: center;">
    Grimnir — Manufacturing Intelligence for Job Shops &nbsp;|&nbsp; <a href="https://getgrimnir.com" style="color: #00a896;">getgrimnir.com</a>
  </div>
</div>`;

  const requestBody = JSON.stringify({
    personalizations: [{ to: [{ email: toEmail, name: toName }] }],
    from: { email: 'gerald@getgrimnir.com', name: 'Gerald at Grimnir' },
    reply_to: { email: 'gerald@jomplcc.com', name: 'Gerald Heckrote' },
    subject,
    content: [
      { type: 'text/plain', value: emailBody },
      { type: 'text/html', value: htmlBody }
    ]
  });

  const options = {
    hostname: 'api.sendgrid.com',
    path: '/v3/mail/send',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
      'Content-Length': Buffer.byteLength(requestBody)
    }
  };

  const response = await httpsPost(options, requestBody);
  if (response.status < 200 || response.status > 299) {
    throw new Error(`SendGrid error: ${response.status} ${response.body}`);
  }
  return true;
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const payload = JSON.parse(event.body);
    const wrapper = payload.payload || payload;
    const data = wrapper.data || wrapper;

    console.log('Received payload keys:', Object.keys(wrapper));
    console.log('Form data:', JSON.stringify(data));

    const name = data.name || 'there';
    const company = data.company || 'your company';
    const email = data.email;
    const erp = data.erp || 'your ERP';
    const issue = data.biggest_issue || data.issue || 'shop floor visibility';

    if (!email) {
      return { statusCode: 400, body: 'No email address in submission' };
    }

    const emailBody = await callClaude(name, company, erp, issue);
    await sendEmail(email, name, company, erp, issue, emailBody);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (err) {
    console.error('Function error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};