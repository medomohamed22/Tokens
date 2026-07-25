import { setCors } from './_shared.js';
export default function handler(req, res) {
  setCors(res, 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  return res.status(200).json({ ok: true, network: 'Pi Testnet', apiFiles: 6 });
}
