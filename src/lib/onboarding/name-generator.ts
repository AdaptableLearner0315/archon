/**
 * Intelligent Company Name Generator
 *
 * Uses Claude to generate a short, brandable company name
 * from the business description.
 */

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

const NAME_GENERATION_PROMPT = `Generate a single short, brandable company name (1-3 words) for this business:

"{description}"

Requirements:
- 1-3 words max
- Memorable and unique
- Easy to spell and pronounce
- Modern and professional
- NO taglines, NO descriptions — just the name

Reply with ONLY the company name, nothing else.`;

/**
 * Generate a brandable company name from a business description
 */
export async function generateCompanyName(businessDescription: string): Promise<string> {
  if (!businessDescription || businessDescription.trim().length < 5) {
    return 'My Company';
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 50,
      messages: [
        {
          role: 'user',
          content: NAME_GENERATION_PROMPT.replace('{description}', businessDescription.slice(0, 500)),
        },
      ],
    });

    const name = response.content[0].type === 'text'
      ? response.content[0].text.trim().replace(/['"]/g, '')
      : '';

    // Validate: must be 1-5 words, no weird characters
    if (name && name.split(/\s+/).length <= 5 && name.length <= 50 && /^[a-zA-Z0-9\s&.-]+$/.test(name)) {
      return name;
    }

    return 'My Company';
  } catch (error) {
    console.error('Company name generation failed:', error);
    return 'My Company';
  }
}
