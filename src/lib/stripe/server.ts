import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover',
});

export const PLANS = {
  starter: {
    name: 'Starter',
    price: 29,
    priceId: process.env.STRIPE_STARTER_PRICE_ID!,
    agents: 4,
    features: [
      '4 core AI agents',
      'Basic execution cycles',
      'Core dashboard',
      'Email support',
    ],
  },
  growth: {
    name: 'Growth',
    price: 79,
    priceId: process.env.STRIPE_GROWTH_PRICE_ID!,
    agents: 10,
    features: [
      'All 10 AI agents',
      'Ad campaign management',
      'Priority execution',
      'Public dashboard URL',
      'Weekly AI retrospectives',
    ],
  },
  scale: {
    name: 'Scale',
    price: 199,
    priceId: process.env.STRIPE_SCALE_PRICE_ID!,
    agents: 10,
    features: [
      'Everything in Growth',
      'Advanced analytics & BI',
      'White-glove onboarding',
      'Priority support',
      'Custom agent configuration',
      'Self-evolution engine',
    ],
  },
} as const;

export type PlanKey = keyof typeof PLANS;
