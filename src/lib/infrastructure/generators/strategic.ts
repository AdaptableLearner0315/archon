/**
 * Strategic Documents Generator
 *
 * Uses Lens (Data Analyst) + Pulse (Growth) agents to generate
 * competitor analysis and growth experiments.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { InfrastructureContext, InfraResult, CompetitorAnalysis, GrowthExperiments } from '../types';

const anthropic = new Anthropic();

// ============================================================
// Competitor Analysis Generator
// ============================================================

const COMPETITOR_ANALYSIS_PROMPT = `You are a competitive intelligence analyst analyzing the market for a {businessType} business.

Business: {productName}
Description: {businessDescription}
Target Audience: {targetAudience}
Value Proposition: {uniqueValueProp}
Known Competitors: {knownCompetitors}

Generate a comprehensive competitor analysis as JSON:

{
  "competitors": [
    {
      "name": "Competitor name",
      "url": "https://competitor.com",
      "description": "What they do",
      "strengths": ["Strength 1", "Strength 2"],
      "weaknesses": ["Weakness 1", "Weakness 2"],
      "pricing": "Pricing model description",
      "targetAudience": "Their target market",
      "marketShare": "Estimated market position"
    }
  ],
  "positioningMatrix": {
    "axes": ["Price (Low to High)", "Feature Richness (Basic to Advanced)"],
    "positions": [
      {"competitor": "Competitor 1", "x": 0.3, "y": 0.7}
    ],
    "yourPosition": {"x": 0.5, "y": 0.8}
  },
  "gapAnalysis": [
    {
      "gap": "Market gap description",
      "opportunity": "How to exploit this gap",
      "difficulty": "low|medium|high"
    }
  ],
  "differentiationOpportunities": ["Opportunity 1", "Opportunity 2"],
  "competitiveAdvantages": ["Advantage 1", "Advantage 2"]
}

Include 3-5 competitors (known + discovered).
Focus on actionable insights.`;

export async function generateCompetitorAnalysis(
  context: InfrastructureContext,
  companyId: string
): Promise<InfraResult<CompetitorAnalysis>> {
  const startTime = Date.now();
  let tokensUsed = 0;

  try {
    const prompt = COMPETITOR_ANALYSIS_PROMPT
      .replace('{businessType}', context.businessType)
      .replace('{productName}', context.productName)
      .replace('{businessDescription}', context.businessDescription)
      .replace('{targetAudience}', context.targetAudience.demographics)
      .replace('{uniqueValueProp}', context.uniqueValueProp)
      .replace('{knownCompetitors}', context.competitors.length > 0
        ? context.competitors.map((c) => `${c.name}${c.url ? ` (${c.url})` : ''}`).join(', ')
        : 'Not specified - please identify relevant competitors');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    tokensUsed += response.usage.input_tokens + response.usage.output_tokens;

    // Parse response
    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
    let analysis: Partial<CompetitorAnalysis> = {};

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Use defaults
    }

    // Build final content
    const finalContent: CompetitorAnalysis = {
      competitors: analysis.competitors || generateDefaultCompetitors(context),
      positioningMatrix: analysis.positioningMatrix || {
        axes: ['Price (Low to High)', 'Feature Richness (Basic to Advanced)'],
        positions: [],
        yourPosition: { x: 0.5, y: 0.6 },
      },
      gapAnalysis: analysis.gapAnalysis || generateDefaultGaps(context),
      differentiationOpportunities: analysis.differentiationOpportunities || generateDifferentiation(context),
      competitiveAdvantages: analysis.competitiveAdvantages || generateAdvantages(context),
    };

    return {
      success: true,
      type: 'landing', // Using landing as placeholder since this is a strategic doc
      content: finalContent,
      metadata: {
        generatedAt: new Date().toISOString(),
        agentsUsed: ['data-analyst'],
        tokensUsed,
        version: 1,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      type: 'landing',
      content: generateFallbackCompetitorAnalysis(context),
      metadata: {
        generatedAt: new Date().toISOString(),
        agentsUsed: ['data-analyst'],
        tokensUsed,
        version: 1,
      },
      error: errorMessage,
    };
  }
}

function generateDefaultCompetitors(context: InfrastructureContext): CompetitorAnalysis['competitors'] {
  const baseCompetitors: Record<string, CompetitorAnalysis['competitors']> = {
    saas: [
      {
        name: 'Market Leader',
        url: 'https://example.com',
        description: 'Established player with comprehensive features',
        strengths: ['Brand recognition', 'Feature-rich', 'Large user base'],
        weaknesses: ['Expensive', 'Complex setup', 'Slow to innovate'],
        pricing: '$99-499/month',
        targetAudience: 'Enterprise companies',
        marketShare: 'Market leader (~30%)',
      },
      {
        name: 'Mid-Market Alternative',
        url: 'https://example.com',
        description: 'Growing competitor targeting SMBs',
        strengths: ['Good value', 'Easy to use', 'Good support'],
        weaknesses: ['Limited integrations', 'Smaller team'],
        pricing: '$29-99/month',
        targetAudience: 'Small to mid-size businesses',
        marketShare: 'Growing (~15%)',
      },
      {
        name: 'Budget Option',
        url: 'https://example.com',
        description: 'Low-cost alternative with basic features',
        strengths: ['Low price', 'Simple'],
        weaknesses: ['Limited features', 'Poor support', 'Reliability issues'],
        pricing: '$9-29/month',
        targetAudience: 'Price-sensitive startups',
        marketShare: 'Niche (~5%)',
      },
    ],
    creator: [
      {
        name: 'Patreon',
        url: 'https://patreon.com',
        description: 'Leading creator membership platform',
        strengths: ['Brand recognition', 'Large audience', 'Established'],
        weaknesses: ['High fees', 'Limited customization', 'Generic experience'],
        pricing: '5-12% of earnings',
        targetAudience: 'All types of creators',
        marketShare: 'Market leader',
      },
      {
        name: 'Gumroad',
        url: 'https://gumroad.com',
        description: 'Simple digital product sales',
        strengths: ['Easy setup', 'Good for products', 'Simple pricing'],
        weaknesses: ['Limited membership features', 'Basic community tools'],
        pricing: '10% + processing',
        targetAudience: 'Digital product creators',
        marketShare: 'Significant',
      },
    ],
    services: [
      {
        name: 'Large Agency',
        url: 'https://example.com',
        description: 'Full-service agency with large team',
        strengths: ['Comprehensive services', 'Big brand clients', 'Resources'],
        weaknesses: ['Expensive', 'Slow', 'Less personal attention'],
        pricing: '$10k-100k+ per project',
        targetAudience: 'Enterprise clients',
        marketShare: 'Top tier',
      },
      {
        name: 'Boutique Studio',
        url: 'https://example.com',
        description: 'Specialized small agency',
        strengths: ['Specialized expertise', 'Personal touch', 'Agile'],
        weaknesses: ['Limited capacity', 'Narrower scope'],
        pricing: '$5k-25k per project',
        targetAudience: 'Startups and SMBs',
        marketShare: 'Growing niche',
      },
    ],
    ecommerce: [
      {
        name: 'Amazon',
        url: 'https://amazon.com',
        description: 'Largest online marketplace',
        strengths: ['Massive reach', 'Prime shipping', 'Trust'],
        weaknesses: ['High fees', 'No branding', 'Race to bottom'],
        pricing: '15-45% fees',
        targetAudience: 'Mass market',
        marketShare: 'Dominant',
      },
      {
        name: 'Etsy',
        url: 'https://etsy.com',
        description: 'Handmade and vintage marketplace',
        strengths: ['Niche audience', 'Creative community', 'Built-in traffic'],
        weaknesses: ['Fees increasing', 'Competition', 'Limited control'],
        pricing: '6.5% + listing fees',
        targetAudience: 'Craft and vintage buyers',
        marketShare: 'Leader in niche',
      },
    ],
  };

  return baseCompetitors[context.businessType] || baseCompetitors.saas;
}

function generateDefaultGaps(context: InfrastructureContext): CompetitorAnalysis['gapAnalysis'] {
  return [
    {
      gap: 'User experience complexity',
      opportunity: 'Build a simpler, more intuitive solution that requires no training',
      difficulty: 'medium',
    },
    {
      gap: 'Pricing accessibility',
      opportunity: 'Offer more flexible pricing tiers for different customer segments',
      difficulty: 'low',
    },
    {
      gap: 'Integration ecosystem',
      opportunity: 'Build native integrations with tools your target audience already uses',
      difficulty: 'medium',
    },
    {
      gap: 'Customer support quality',
      opportunity: 'Provide exceptional, personalized support as a differentiator',
      difficulty: 'low',
    },
  ];
}

function generateDifferentiation(context: InfrastructureContext): string[] {
  return [
    `Focus on ${context.targetAudience.demographics} specifically, not everyone`,
    'Build features competitors ignore but your audience needs',
    'Provide exceptional onboarding and support',
    'Transparent pricing without hidden fees',
    'Faster iteration and feature releases',
    'Community-driven product development',
  ];
}

function generateAdvantages(context: InfrastructureContext): string[] {
  return [
    'Fresh perspective and modern technology stack',
    'Focused on solving specific pain points',
    'Agile team that can move quickly',
    `Deep understanding of ${context.targetAudience.demographics}`,
    'No legacy technical debt',
    'Direct founder-to-customer relationships',
  ];
}

function generateFallbackCompetitorAnalysis(context: InfrastructureContext): CompetitorAnalysis {
  return {
    competitors: generateDefaultCompetitors(context),
    positioningMatrix: {
      axes: ['Price (Low to High)', 'Feature Richness (Basic to Advanced)'],
      positions: [],
      yourPosition: { x: 0.5, y: 0.6 },
    },
    gapAnalysis: generateDefaultGaps(context),
    differentiationOpportunities: generateDifferentiation(context),
    competitiveAdvantages: generateAdvantages(context),
  };
}

// ============================================================
// Growth Experiments Generator
// ============================================================

const GROWTH_EXPERIMENTS_PROMPT = `You are a growth strategist creating experiments for a {businessType} business.

Business: {productName}
Description: {businessDescription}
Target Audience: {targetAudience}
Stage: {stage}
Key Features: {keyFeatures}

Generate 5 growth experiments as JSON:

{
  "experiments": [
    {
      "id": "exp-001",
      "name": "Experiment name",
      "hypothesis": "If we [action], then [outcome] because [reason]",
      "category": "acquisition|activation|retention|revenue|referral",
      "testDesign": {
        "control": "Current state",
        "variant": "Changed state",
        "duration": "2 weeks",
        "sampleSize": "500 users"
      },
      "successMetrics": [
        {"metric": "Conversion rate", "target": "+15%", "currentBaseline": "3%"}
      ],
      "implementation": "Step-by-step implementation guide",
      "priority": "high|medium|low",
      "estimatedImpact": "Expected impact description",
      "effort": "low|medium|high"
    }
  ],
  "prioritizationScore": [
    {"experimentId": "exp-001", "iceScore": 8.5}
  ],
  "roadmap": [
    {"week": 1, "experiments": ["exp-001", "exp-002"]}
  ]
}

Create experiments across the AARRR funnel.
Prioritize by ICE score (Impact * Confidence * Ease).`;

export async function generateGrowthExperiments(
  context: InfrastructureContext,
  companyId: string
): Promise<InfraResult<GrowthExperiments>> {
  const startTime = Date.now();
  let tokensUsed = 0;

  try {
    const prompt = GROWTH_EXPERIMENTS_PROMPT
      .replace('{businessType}', context.businessType)
      .replace('{productName}', context.productName)
      .replace('{businessDescription}', context.businessDescription)
      .replace('{targetAudience}', context.targetAudience.demographics)
      .replace('{stage}', context.stage)
      .replace('{keyFeatures}', context.keyFeatures.join(', '));

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    tokensUsed += response.usage.input_tokens + response.usage.output_tokens;

    // Parse response
    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
    let experiments: Partial<GrowthExperiments> = {};

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        experiments = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Use defaults
    }

    // Build final content
    const finalContent: GrowthExperiments = {
      experiments: experiments.experiments || generateDefaultExperiments(context),
      prioritizationScore: experiments.prioritizationScore || [],
      roadmap: experiments.roadmap || generateRoadmap(context),
    };

    // Calculate ICE scores if not provided
    if (finalContent.prioritizationScore.length === 0) {
      finalContent.prioritizationScore = finalContent.experiments.map((exp) => ({
        experimentId: exp.id,
        iceScore: calculateICEScore(exp),
      }));
    }

    return {
      success: true,
      type: 'landing', // Using landing as placeholder
      content: finalContent,
      metadata: {
        generatedAt: new Date().toISOString(),
        agentsUsed: ['growth'],
        tokensUsed,
        version: 1,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      type: 'landing',
      content: generateFallbackExperiments(context),
      metadata: {
        generatedAt: new Date().toISOString(),
        agentsUsed: ['growth'],
        tokensUsed,
        version: 1,
      },
      error: errorMessage,
    };
  }
}

function generateDefaultExperiments(context: InfrastructureContext): GrowthExperiments['experiments'] {
  return [
    {
      id: 'exp-001',
      name: 'Homepage Value Prop Test',
      hypothesis: 'If we make the value proposition more specific to our target audience, then conversion will increase because visitors will immediately understand the benefit',
      category: 'acquisition',
      testDesign: {
        control: 'Current homepage headline',
        variant: `New headline: "${context.uniqueValueProp.substring(0, 50)}"`,
        duration: '2 weeks',
        sampleSize: '1000 visitors',
      },
      successMetrics: [
        { metric: 'Signup conversion rate', target: '+20%', currentBaseline: 'TBD' },
        { metric: 'Time on page', target: '+15%', currentBaseline: 'TBD' },
      ],
      implementation: '1. Create A/B test in analytics tool\n2. Update homepage variant\n3. Run for minimum 2 weeks\n4. Analyze results',
      priority: 'high',
      estimatedImpact: 'High - affects all top-of-funnel traffic',
      effort: 'low',
    },
    {
      id: 'exp-002',
      name: 'Onboarding Simplification',
      hypothesis: 'If we reduce onboarding steps from 5 to 3, then activation will increase because users face less friction',
      category: 'activation',
      testDesign: {
        control: 'Current 5-step onboarding',
        variant: 'Simplified 3-step onboarding',
        duration: '2 weeks',
        sampleSize: '200 new signups',
      },
      successMetrics: [
        { metric: 'Onboarding completion rate', target: '+30%', currentBaseline: 'TBD' },
        { metric: 'Time to first value', target: '-40%', currentBaseline: 'TBD' },
      ],
      implementation: '1. Map current onboarding steps\n2. Identify must-have vs nice-to-have\n3. Create streamlined flow\n4. A/B test with new signups',
      priority: 'high',
      estimatedImpact: 'High - directly affects user activation',
      effort: 'medium',
    },
    {
      id: 'exp-003',
      name: 'Email Engagement Sequence',
      hypothesis: 'If we send a 7-day engagement email sequence, then retention will improve because users stay connected',
      category: 'retention',
      testDesign: {
        control: 'No email sequence (only transactional)',
        variant: '7-day educational email sequence',
        duration: '4 weeks',
        sampleSize: '300 new users',
      },
      successMetrics: [
        { metric: '7-day retention', target: '+25%', currentBaseline: 'TBD' },
        { metric: 'Email open rate', target: '>30%', currentBaseline: 'N/A' },
      ],
      implementation: '1. Write 7 educational emails\n2. Set up email automation\n3. Segment new vs existing users\n4. Track engagement metrics',
      priority: 'medium',
      estimatedImpact: 'Medium - improves retention funnel',
      effort: 'medium',
    },
    {
      id: 'exp-004',
      name: 'Pricing Page Optimization',
      hypothesis: 'If we highlight the most popular plan, then revenue will increase because users follow social proof',
      category: 'revenue',
      testDesign: {
        control: 'Current pricing page',
        variant: 'Pricing page with "Most Popular" badge',
        duration: '2 weeks',
        sampleSize: '500 pricing page visitors',
      },
      successMetrics: [
        { metric: 'Paid conversion rate', target: '+15%', currentBaseline: 'TBD' },
        { metric: 'Average revenue per user', target: '+10%', currentBaseline: 'TBD' },
      ],
      implementation: '1. Analyze current plan distribution\n2. Add visual emphasis to mid-tier plan\n3. A/B test pricing page\n4. Monitor ARPU changes',
      priority: 'medium',
      estimatedImpact: 'Medium - directly affects revenue',
      effort: 'low',
    },
    {
      id: 'exp-005',
      name: 'Referral Program Launch',
      hypothesis: 'If we offer a two-sided referral incentive, then user acquisition will increase because existing users become advocates',
      category: 'referral',
      testDesign: {
        control: 'No referral program',
        variant: 'Give $10, Get $10 referral program',
        duration: '4 weeks',
        sampleSize: 'All active users',
      },
      successMetrics: [
        { metric: 'Referral signups', target: '10% of new signups', currentBaseline: '0%' },
        { metric: 'Referral conversion rate', target: '>50%', currentBaseline: 'N/A' },
      ],
      implementation: '1. Build referral tracking system\n2. Create referral dashboard\n3. Announce to existing users\n4. Add in-app referral prompts',
      priority: 'medium',
      estimatedImpact: 'High - creates viral growth loop',
      effort: 'high',
    },
  ];
}

function calculateICEScore(experiment: GrowthExperiments['experiments'][0]): number {
  const impactMap: Record<string, number> = { 'High': 8, 'Medium': 5, 'Low': 2 };
  const effortMap: Record<string, number> = { 'low': 9, 'medium': 6, 'high': 3 };

  const impact = impactMap[experiment.estimatedImpact.split(' ')[0]] || 5;
  const confidence = 6; // Default medium confidence
  const ease = effortMap[experiment.effort] || 6;

  return Math.round(((impact + confidence + ease) / 3) * 10) / 10;
}

function generateRoadmap(context: InfrastructureContext): GrowthExperiments['roadmap'] {
  return [
    { week: 1, experiments: ['exp-001', 'exp-004'] },
    { week: 2, experiments: ['exp-002'] },
    { week: 3, experiments: ['exp-003'] },
    { week: 4, experiments: ['exp-005'] },
  ];
}

function generateFallbackExperiments(context: InfrastructureContext): GrowthExperiments {
  const experiments = generateDefaultExperiments(context);
  return {
    experiments,
    prioritizationScore: experiments.map((exp) => ({
      experimentId: exp.id,
      iceScore: calculateICEScore(exp),
    })),
    roadmap: generateRoadmap(context),
  };
}
