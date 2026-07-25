import { setCors, sendError } from './_shared.js';

export default async function handler(req, res) {
  setCors(res, 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return sendError(res, 405, 'Method not allowed');
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return sendError(res, 401, 'Missing Pi access token.');
  try {
    const response = await fetch('https://api.minepi.com/v2/me', { headers: { Authorization: auth } });
    const data = await response.json();
    if (!response.ok) return sendError(res, response.status, 'Pi authentication failed.', data);
    return res.status(200).json({ ok: true, user: data });
  } catch (error) {
    return sendError(res, 502, 'Could not reach Pi Platform API.', error.message);
  }
}
