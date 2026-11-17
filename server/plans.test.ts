import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FREE_PAPER_LIMIT, PLANS, quarterlySavingsPaise } from '../shared/plans.ts';

test('prices stay in the bands asked for and reward a 3-month season', () => {
  const weekly = PLANS.find((plan) => plan.id === 'weekly');
  const monthly = PLANS.find((plan) => plan.id === 'monthly');
  const quarterly = PLANS.find((plan) => plan.id === 'quarterly');
  assert.ok(weekly && monthly && quarterly);
  assert.equal(weekly.pricePaise, 9900);
  assert.equal(monthly.pricePaise, 29900);
  assert.equal(quarterly.pricePaise, 59900);
  assert.equal(quarterlySavingsPaise(), 29800);
  assert.ok(quarterly.pricePaise < monthly.pricePaise * 3);
  assert.ok(Math.abs(quarterly.pricePaise - monthly.pricePaise * 2) <= 100);
  assert.equal(FREE_PAPER_LIMIT, 1);
});
