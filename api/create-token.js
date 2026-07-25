import {
  StellarSdk, server, NETWORK_PASSPHRASE, setCors, sendError, parseJsonBody,
  validateTokenCode, validatePublicKey, validateAmount, normalizeHomeDomain,
  normalizeGithubImageUrl, validateHttpsUrl, safeHorizonError
} from './_shared.js';

const tomlClean = value => String(value || '').replace(/[\r\n"]/g, ' ').trim();

export default async function handler(req, res) {
  setCors(res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed');

  const body = parseJsonBody(req);
  const tokenCode = String(body.tokenCode || '').trim();
  const amount = String(body.amount || '').trim();
  const issuerAddress = String(body.issuerAddress || '').trim();
  const distributorAddress = String(body.distributorAddress || '').trim();
  const tokenName = String(body.tokenName || '').trim();
  const description = String(body.description || '').trim();
  const homeDomain = normalizeHomeDomain(body.homeDomain);
  const imageUrl = normalizeGithubImageUrl(body.imageUrl);

  if (!validateTokenCode(tokenCode)) return sendError(res, 400, 'Token code must be 1–12 alphanumeric characters.');
  if (!validateAmount(amount)) return sendError(res, 400, 'Amount must be positive with at most 7 decimal places.');
  if (!validatePublicKey(issuerAddress) || !validatePublicKey(distributorAddress)) return sendError(res, 400, 'Invalid public wallet address.');
  if (issuerAddress === distributorAddress) return sendError(res, 400, 'Issuer and distributor must be different wallets.');
  if (!homeDomain || !/^[a-z0-9.-]+(?::\d+)?$/i.test(homeDomain)) return sendError(res, 400, 'Invalid home domain.');
  if (!tokenName || tokenName.length > 80) return sendError(res, 400, 'Token name is required and must be 80 characters or less.');
  if (!description || description.length > 300) return sendError(res, 400, 'Description is required and must be 300 characters or less.');
  if (!validateHttpsUrl(imageUrl)) return sendError(res, 400, 'Image must be a direct HTTPS URL.');

  const issuerSecret = process.env.ISSUER_SECRET;
  const distributorSecret = process.env.DISTRIBUTOR_SECRET;
  if (!issuerSecret || !distributorSecret) return sendError(res, 503, 'Configure ISSUER_SECRET and DISTRIBUTOR_SECRET in Vercel.');

  let issuerKeypair;
  let distributorKeypair;
  try {
    issuerKeypair = StellarSdk.Keypair.fromSecret(issuerSecret.trim());
    distributorKeypair = StellarSdk.Keypair.fromSecret(distributorSecret.trim());
  } catch { return sendError(res, 503, 'A wallet secret configured in Vercel is invalid.'); }

  if (issuerKeypair.publicKey() !== issuerAddress || distributorKeypair.publicKey() !== distributorAddress) {
    return sendError(res, 400, 'The public addresses do not match the wallet secrets configured in Vercel.');
  }

  const asset = new StellarSdk.Asset(tokenCode, issuerAddress);
  const txHashes = {};

  try {
    const fee = await server.fetchBaseFee();
    const distributorAccount = await server.loadAccount(distributorAddress);
    const trustTx = new StellarSdk.TransactionBuilder(distributorAccount, {
      fee: String(fee), networkPassphrase: NETWORK_PASSPHRASE, timebounds: await server.fetchTimebounds(120)
    }).addOperation(StellarSdk.Operation.changeTrust({ asset })).build();
    trustTx.sign(distributorKeypair);
    txHashes.trustline = (await server.submitTransaction(trustTx)).hash;

    const issuerForDomain = await server.loadAccount(issuerAddress);
    const domainTx = new StellarSdk.TransactionBuilder(issuerForDomain, {
      fee: String(fee), networkPassphrase: NETWORK_PASSPHRASE, timebounds: await server.fetchTimebounds(120)
    }).addOperation(StellarSdk.Operation.setOptions({ homeDomain })).build();
    domainTx.sign(issuerKeypair);
    txHashes.homeDomain = (await server.submitTransaction(domainTx)).hash;

    const issuerForMint = await server.loadAccount(issuerAddress);
    const mintTx = new StellarSdk.TransactionBuilder(issuerForMint, {
      fee: String(fee), networkPassphrase: NETWORK_PASSPHRASE, timebounds: await server.fetchTimebounds(120)
    }).addOperation(StellarSdk.Operation.payment({ destination: distributorAddress, asset, amount })).build();
    mintTx.sign(issuerKeypair);
    txHashes.mint = (await server.submitTransaction(mintTx)).hash;

    const metadata = { code: tokenCode, issuer: issuerAddress, name: tokenName, desc: description, image: imageUrl, homeDomain };
    const piToml = `[[CURRENCIES]]\ncode="${tomlClean(tokenCode)}"\nissuer="${tomlClean(issuerAddress)}"\nname="${tomlClean(tokenName)}"\ndesc="${tomlClean(description)}"\nimage="${tomlClean(imageUrl)}"\n`;

    return res.status(200).json({
      ok: true,
      token: { ...metadata, amount, distributor: distributorAddress },
      transactions: txHashes,
      piToml,
      piTomlUrl: `https://${homeDomain}/.well-known/pi.toml`,
      assetUrl: `${server.serverURL}/assets?asset_code=${encodeURIComponent(tokenCode)}&asset_issuer=${issuerAddress}`,
      metadataStorage: 'environment',
      notice: 'Blockchain transactions succeeded. Add TOKEN_CODE, TOKEN_ISSUER, TOKEN_NAME, TOKEN_DESCRIPTION and TOKEN_IMAGE_URL to Vercel, then redeploy so pi.toml remains available.'
    });
  } catch (error) {
    return sendError(res, 502, 'Pi Testnet transaction failed.', { blockchain: safeHorizonError(error), completedTransactions: txHashes });
  }
}
