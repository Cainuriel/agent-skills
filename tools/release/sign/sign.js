// Signing page logic. No external library, no network request.
// The wallet signs with personal_sign (EIP-191). The page verifies the result with personal_ecRecover.
'use strict';

const RELEASE = /^[a-z0-9-]+\|[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?\|commit:[0-9a-f]{40}\|sha256:[0-9a-f]{64}$/;
const ANNULMENT = /^[a-z0-9-]+\|ANNULMENT\|0x[0-9a-fA-F]{40}\|All signatures by this address are void\.$/;

const $ = (id) => document.getElementById(id);
let account = null;

function toHex(text) {
  const bytes = new TextEncoder().encode(text);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

function setStatus(el, text, ok) {
  el.textContent = text;
  el.className = `status ${ok ? 'ok' : 'error'}`;
}

function messageState() {
  const message = $('message').value;
  $('length').textContent = String(new TextEncoder().encode(message).length);
  if (message !== message.trim() || /[\r\n]/.test(message)) {
    setStatus($('format'), 'Invalid: remove spaces and line breaks at the start or the end.', false);
    return null;
  }
  if (RELEASE.test(message)) {
    setStatus($('format'), 'Format: release message.', true);
    return { message, kind: 'release' };
  }
  if (ANNULMENT.test(message)) {
    if (account && !message.toLowerCase().includes(account.toLowerCase())) {
      setStatus($('format'), 'Invalid: the annulment address is not the connected account.', false);
      return null;
    }
    setStatus($('format'), 'Format: annulment statement. This statement is permanent. Keep it offline.', true);
    return { message, kind: 'annulment' };
  }
  setStatus($('format'), message ? 'Invalid: the text matches no known format.' : '', false);
  return null;
}

function refresh() {
  const state = messageState();
  $('sign').disabled = !(state && account);
}

async function connect() {
  if (!window.ethereum) {
    setStatus($('signStatus'), 'No wallet found. Open this page in the browser that has MetaMask.', false);
    return;
  }
  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    account = accounts[0] ?? null;
    $('account').textContent = account ?? 'not connected';
  } catch (err) {
    setStatus($('signStatus'), `Connection rejected: ${err.message}`, false);
  }
  refresh();
}

async function sign() {
  const state = messageState();
  if (!state || !account) return;
  const hex = toHex(state.message);
  $('result').value = '';
  $('copy').disabled = true;
  try {
    setStatus($('signStatus'), 'Waiting for confirmation on the wallet...', true);
    const signature = await window.ethereum.request({ method: 'personal_sign', params: [hex, account] });
    let recovered = null;
    try {
      recovered = await window.ethereum.request({ method: 'personal_ecRecover', params: [hex, signature] });
    } catch {
      // Some wallets do not offer personal_ecRecover. Verification then happens outside this page.
    }
    if (recovered === null) {
      setStatus($('signStatus'), 'Signed. The wallet cannot verify: verify with cast or Etherscan before you publish.', false);
    } else if (String(recovered).toLowerCase() !== account.toLowerCase()) {
      setStatus($('signStatus'), `Verification FAILED: recovered ${recovered}. Do not publish this signature.`, false);
      return;
    } else {
      setStatus($('signStatus'), 'Signed and verified: the signature recovers the signing address.', true);
    }
    $('result').value = [
      `type: ${state.kind}`,
      `message: ${state.message}`,
      `address: ${account}`,
      `did: did:pkh:eip155:1:${account}`,
      `signature: ${signature}`,
      'algorithm: EIP-191 personal_sign',
    ].join('\n');
    $('copy').disabled = false;
  } catch (err) {
    setStatus($('signStatus'), `Signature rejected or failed: ${err.message}`, false);
  }
}

async function copyResult() {
  try {
    await navigator.clipboard.writeText($('result').value);
    setStatus($('signStatus'), 'Result copied.', true);
  } catch {
    $('result').select();
    setStatus($('signStatus'), 'Select the text and copy it manually.', false);
  }
}

$('message').addEventListener('input', refresh);
$('connect').addEventListener('click', connect);
$('sign').addEventListener('click', sign);
$('copy').addEventListener('click', copyResult);
if (window.ethereum) {
  window.ethereum.on?.('accountsChanged', (accounts) => {
    account = accounts[0] ?? null;
    $('account').textContent = account ?? 'not connected';
    refresh();
  });
}
refresh();
