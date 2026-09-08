import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkNumber, checkPowerFactor, checkVoltage, checkFactor, hasErrors, num,
} from '../src/engine/validation.js';

test('power factor above 1 is rejected as physically impossible', () => {
  const issues = [];
  checkPowerFactor(issues, 'pf', 1.2);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].level, 'error');
  assert.match(issues[0].message, /cannot exceed 1\.0/);
});

test('power factor of zero or below is rejected', () => {
  for (const bad of [0, -0.5]) {
    const issues = [];
    checkPowerFactor(issues, 'pf', bad);
    assert.ok(hasErrors(issues), `PF ${bad} should be an error`);
  }
});

test('a low but legal power factor warns rather than errors', () => {
  const issues = [];
  const v = checkPowerFactor(issues, 'pf', 0.4);
  assert.equal(v, 0.4);
  assert.equal(hasErrors(issues), false);
  assert.equal(issues[0].level, 'warning');
});

test('zero voltage is rejected', () => {
  const issues = [];
  checkVoltage(issues, 'v', 0);
  assert.ok(hasErrors(issues));
  assert.match(issues[0].message, /greater than 0 V/);
});

test('negative power and negative length are rejected', () => {
  const issues = [];
  checkNumber(issues, 'p', -5, { label: 'Rated power', exclusiveMin: 0 });
  checkNumber(issues, 'len', -12, { label: 'Cable length', min: 0 });
  assert.equal(issues.length, 2);
  assert.ok(issues.every((i) => i.level === 'error'));
});

test('diversity factor must be within (0, 1]', () => {
  const bad = [];
  checkFactor(bad, 'df', 1.4);
  assert.ok(hasErrors(bad));
  const ok = [];
  assert.equal(checkFactor(ok, 'df', 1), 1);
  assert.equal(ok.length, 0);
});

test('non-integer quantity is rejected when integer is required', () => {
  const issues = [];
  checkNumber(issues, 'qty', 2.5, { label: 'Quantity', integer: true, exclusiveMin: 0 });
  assert.ok(hasErrors(issues));
});

test('num coerces strings and rejects junk', () => {
  assert.equal(num(' 42 '), 42);
  assert.ok(Number.isNaN(num('abc')));
  assert.ok(Number.isNaN(num('')));
});
