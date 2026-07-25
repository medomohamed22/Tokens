import { server, setCors, sendError, validateTokenCode } from './_shared.js';

export default async function handler(req, res) {
  setCors(res, 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return sendError(res, 405, 'Method not allowed');
  const code = String(req.query?.code || '');
  const issuer = String(req.query?.issuer || '');
  if (!validateTokenCode(code) || !/^G[A-Z2-7]{55}$/.test(issuer)) return sendError(res, 400, 'Invalid code or issuer address.');
  try {
    const data = await server.assets().forCode(code).forIssuer(issuer).call();
    return res.status(200).json({ ok: true, records: data.records });
  } catch (error) {
    return sendError(res, 502, 'Unable to query Pi Testnet.', error.message);
  }
}
