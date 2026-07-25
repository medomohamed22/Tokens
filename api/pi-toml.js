import { setCors } from './_shared.js';

const clean = value => String(value || '').replace(/[\r\n"]/g, ' ').trim();

export default async function handler(req, res) {
  setCors(res, 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');

  const code = clean(process.env.TOKEN_CODE);
  const issuer = clean(process.env.TOKEN_ISSUER);
  const name = clean(process.env.TOKEN_NAME);
  const desc = clean(process.env.TOKEN_DESCRIPTION);
  const image = clean(process.env.TOKEN_IMAGE_URL);

  if (!code || !issuer || !name || !desc || !image) {
    return res.status(503).send('# Configure TOKEN_CODE, TOKEN_ISSUER, TOKEN_NAME, TOKEN_DESCRIPTION and TOKEN_IMAGE_URL in Vercel, then redeploy.\n');
  }

  return res.status(200).send(`[[CURRENCIES]]\ncode="${code}"\nissuer="${issuer}"\nname="${name}"\ndesc="${desc}"\nimage="${image}"\n`);
}
