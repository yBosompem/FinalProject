const { aiServiceUrl } = require('../config');

async function analyzeFrame(imageBase64, sessionId) {
  const response = await fetch(`${aiServiceUrl}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageBase64, session_id: sessionId }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI service error: ${text}`);
  }
  return response.json();
}

module.exports = { analyzeFrame };
