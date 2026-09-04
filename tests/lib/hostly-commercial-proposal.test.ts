import assert from "node:assert/strict";
import test from "node:test";

import {
  HOSTLY_COMMERCIAL_PROPOSAL,
  formatHostlyProposedPrice,
  getHostlyCommercialProposalPlan,
} from "@/lib/subscription/hostly-commercial-proposal";

const plans = HOSTLY_COMMERCIAL_PROPOSAL.plans;

test("commercial proposal stays explicitly non-enforcing", () => {
  assert.equal(HOSTLY_COMMERCIAL_PROPOSAL.status, "proposed");
  assert.equal(HOSTLY_COMMERCIAL_PROPOSAL.priceUnit, "per_location");
  assert.equal(HOSTLY_COMMERCIAL_PROPOSAL.vatIncluded, false);
});

test("proposal defines the three canonical plans in ascending price order", () => {
  assert.deepEqual(plans.map((plan) => plan.id), ["basic", "pro", "ultra"]);
  assert.ok(plans[0].monthlyPriceCents < plans[1].monthlyPriceCents);
  assert.ok(plans[1].monthlyPriceCents < plans[2].monthlyPriceCents);
});

test("annual pricing charges ten months for twelve months of service", () => {
  for (const plan of plans) {
    assert.equal(plan.annualPriceCents, plan.monthlyPriceCents * 10);
  }
  assert.equal(HOSTLY_COMMERCIAL_PROPOSAL.annualBilling.monthsCharged, 10);
  assert.equal(HOSTLY_COMMERCIAL_PROPOSAL.annualBilling.monthsIncluded, 12);
});

test("Pro is the recommended plan and includes single-image AI without bulk", () => {
  const pro = getHostlyCommercialProposalPlan("pro");
  assert.equal(pro.recommended, true);
  assert.ok(pro.includedModules.includes("catalog.image.ai.single"));
  assert.equal(pro.includedModules.includes("catalog.image.ai.bulk"), false);
  assert.equal(pro.aiProductImageBulk, false);
  assert.equal(pro.aiProductImagesMonthly, 100);
});

test("Basic has no proposed generative image allowance", () => {
  const basic = getHostlyCommercialProposalPlan("basic");
  assert.equal(basic.aiProductImagesMonthly, 0);
  assert.equal(basic.aiMenuImportsMonthly, 0);
  assert.equal(basic.includedModules.includes("catalog.image.ai.single"), false);
});

test("Ultra is the only proposed bulk image and multi-location tier", () => {
  const ultra = getHostlyCommercialProposalPlan("ultra");
  assert.equal(ultra.aiProductImageBulk, true);
  assert.equal(ultra.multiLocationAnalytics, true);
  assert.ok(ultra.includedModules.includes("catalog.image.ai.bulk"));
  assert.ok(ultra.includedModules.includes("analytics.multiLocation"));
  assert.equal(ultra.employeeSeats, null);
});

test("trial starts on Pro and does not require a payment method", () => {
  assert.equal(HOSTLY_COMMERCIAL_PROPOSAL.trial.plan, "pro");
  assert.equal(HOSTLY_COMMERCIAL_PROPOSAL.trial.days, 30);
  assert.equal(HOSTLY_COMMERCIAL_PROPOSAL.trial.paymentMethodRequired, false);
});

test("Hostly does not add device or transaction fees in the proposal", () => {
  const rules = HOSTLY_COMMERCIAL_PROPOSAL.commercialRules;
  assert.equal(rules.deviceFees, false);
  assert.equal(rules.waiterDeviceFees, false);
  assert.equal(rules.hostlyTransactionCommission, false);
  assert.equal(rules.thirdPartyPaymentFeesSeparate, true);
  assert.equal(rules.hardwareSeparate, true);
});

test("price formatter uses the Spanish EUR commercial display", () => {
  assert.match(formatHostlyProposedPrice(3900), /39/);
  assert.match(formatHostlyProposedPrice(13900), /139/);
});
