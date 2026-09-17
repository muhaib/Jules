import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptWithPin, decryptWithPin, hashPin } from '../src/engine/crypto.js';

test('encrypts and decrypts a plaintext blob with the correct PIN', async () => {
  const plaintext = JSON.stringify({ income: 80000, expenses: [] });
  const envelope = await encryptWithPin(plaintext, '1234');
  assert.notEqual(envelope.data, plaintext);
  const decrypted = await decryptWithPin(envelope, '1234');
  assert.equal(decrypted, plaintext);
});

test('decrypting with the wrong PIN fails', async () => {
  const envelope = await encryptWithPin('secret data', '1234');
  await assert.rejects(() => decryptWithPin(envelope, '9999'));
});

test('hashPin is deterministic for the same salt and differs by PIN', async () => {
  const first = await hashPin('1234');
  const second = await hashPin('1234', first.salt);
  const different = await hashPin('4321', first.salt);
  assert.equal(first.hash, second.hash);
  assert.notEqual(first.hash, different.hash);
});
