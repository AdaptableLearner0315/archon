/**
 * Business Type Templates
 *
 * Pre-configured templates for different business types:
 * - SaaS: B2B/B2C software products
 * - Creator: Content creators, influencers, educators
 * - Services: Agencies, consultants, freelancers
 * - E-commerce: Product-based businesses
 */

import type { BusinessType } from '../types';

// ============================================================
// Database Schema Templates
// ============================================================

export interface SchemaTemplate {
  tables: {
    name: string;
    description: string;
    columns: {
      name: string;
      type: string;
      nullable: boolean;
      default?: string;
      description: string;
    }[];
    indexes: string[];
  }[];
  rlsPolicies: {
    table: string;
    name: string;
    operation: string;
    using: string;
    withCheck?: string;
  }[];
}

export const DATABASE_TEMPLATES: Record<BusinessType, SchemaTemplate> = {
  saas: {
    tables: [
      {
        name: 'users',
        description: 'User accounts with subscription status',
        columns: [
          { name: 'id', type: 'UUID DEFAULT gen_random_uuid() PRIMARY KEY', nullable: false, description: 'User ID' },
          { name: 'email', type: 'TEXT UNIQUE', nullable: false, description: 'Email address' },
          { name: 'full_name', type: 'TEXT', nullable: true, description: 'Full name' },
          { name: 'avatar_url', type: 'TEXT', nullable: true, description: 'Profile picture URL' },
          { name: 'subscription_tier', type: "TEXT DEFAULT 'free'", nullable: false, description: 'Current subscription' },
          { name: 'subscription_status', type: "TEXT DEFAULT 'active'", nullable: false, description: 'Subscription status' },
          { name: 'trial_ends_at', type: 'TIMESTAMPTZ', nullable: true, description: 'Trial end date' },
          { name: 'stripe_customer_id', type: 'TEXT', nullable: true, description: 'Stripe customer ID' },
          { name: 'created_at', type: 'TIMESTAMPTZ DEFAULT NOW()', nullable: false, description: 'Account creation date' },
          { name: 'updated_at', type: 'TIMESTAMPTZ DEFAULT NOW()', nullable: false, description: 'Last update' },
        ],
        indexes: ['idx_users_email ON users(email)', 'idx_users_subscription ON users(subscription_tier, subscription_status)'],
      },
      {
        name: 'workspaces',
        description: 'Team workspaces for collaboration',
        columns: [
          { name: 'id', type: 'UUID DEFAULT gen_random_uuid() PRIMARY KEY', nullable: false, description: 'Workspace ID' },
          { name: 'owner_id', type: 'UUID REFERENCES users(id)', nullable: false, description: 'Owner user ID' },
          { name: 'name', type: 'TEXT', nullable: false, description: 'Workspace name' },
          { name: 'slug', type: 'TEXT UNIQUE', nullable: false, description: 'URL slug' },
          { name: 'settings', type: "JSONB DEFAULT '{}'", nullable: false, description: 'Workspace settings' },
          { name: 'created_at', type: 'TIMESTAMPTZ DEFAULT NOW()', nullable: false, description: 'Creation date' },
        ],
        indexes: ['idx_workspaces_owner ON workspaces(owner_id)', 'idx_workspaces_slug ON workspaces(slug)'],
      },
      {
        name: 'workspace_members',
        description: 'Workspace membership and roles',
        columns: [
          { name: 'id', type: 'UUID DEFAULT gen_random_uuid() PRIMARY KEY', nullable: false, description: 'Member ID' },
          { name: 'workspace_id', type: 'UUID REFERENCES workspaces(id) ON DELETE CASCADE', nullable: false, description: 'Workspace' },
          { name: 'user_id', type: 'UUID REFERENCES users(id) ON DELETE CASCADE', nullable: false, description: 'User' },
          { name: 'role', type: "TEXT DEFAULT 'member'", nullable: false, description: 'Role in workspace' },
          { name: 'invited_at', type: 'TIMESTAMPTZ DEFAULT NOW()', nullable: false, description: 'Invite date' },
          { name: 'joined_at', type: 'TIMESTAMPTZ', nullable: true, description: 'Join date' },
        ],
        indexes: ['idx_workspace_members_composite ON workspace_members(workspace_id, user_id)'],
      },
      {
        name: 'api_usage',
        description: 'API usage tracking for rate limiting and billing',
        columns: [
          { name: 'id', type: 'UUID DEFAULT gen_random_uuid() PRIMARY KEY', nullable: false, description: 'Usage ID' },
          { name: 'user_id', type: 'UUID REFERENCES users(id)', nullable: false, description: 'User' },
          { name: 'endpoint', type: 'TEXT', nullable: false, description: 'API endpoint' },
          { name: 'tokens_used', type: 'INTEGER DEFAULT 0', nullable: false, description: 'Tokens consumed' },
          { name: 'cost_usd', type: 'NUMERIC(10,6) DEFAULT 0', nullable: false, description: 'Cost in USD' },
          { name: 'created_at', type: 'TIMESTAMPTZ DEFAULT NOW()', nullable: false, description: 'Timestamp' },
        ],
        indexes: ['idx_api_usage_user ON api_usage(user_id)', 'idx_api_usage_date ON api_usage(created_at)'],
      },
    ],
    rlsPolicies: [
      { table: 'users', name: 'users_own_data', operation: 'SELECT', using: 'auth.uid() = id' },
      { table: 'workspaces', name: 'workspace_members_view', operation: 'SELECT', using: 'id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())' },
      { table: 'workspace_members', name: 'members_view_own', operation: 'SELECT', using: 'user_id = auth.uid() OR workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())' },
    ],
  },

  creator: {
    tables: [
      {
        name: 'creators',
        description: 'Creator profiles',
        columns: [
          { name: 'id', type: 'UUID DEFAULT gen_random_uuid() PRIMARY KEY', nullable: false, description: 'Creator ID' },
          { name: 'user_id', type: 'UUID UNIQUE', nullable: false, description: 'Auth user ID' },
          { name: 'username', type: 'TEXT UNIQUE', nullable: false, description: 'Public username' },
          { name: 'display_name', type: 'TEXT', nullable: false, description: 'Display name' },
          { name: 'bio', type: 'TEXT', nullable: true, description: 'Bio/description' },
          { name: 'avatar_url', type: 'TEXT', nullable: true, description: 'Avatar' },
          { name: 'banner_url', type: 'TEXT', nullable: true, description: 'Banner image' },
          { name: 'social_links', type: "JSONB DEFAULT '{}'", nullable: false, description: 'Social media links' },
          { name: 'is_verified', type: 'BOOLEAN DEFAULT FALSE', nullable: false, description: 'Verification status' },
          { name: 'follower_count', type: 'INTEGER DEFAULT 0', nullable: false, description: 'Follower count' },
          { name: 'created_at', type: 'TIMESTAMPTZ DEFAULT NOW()', nullable: false, description: 'Join date' },
        ],
        indexes: ['idx_creators_username ON creators(username)', 'idx_creators_user ON creators(user_id)'],
      },
      {
        name: 'content',
        description: 'Published content (posts, videos, courses)',
        columns: [
          { name: 'id', type: 'UUID DEFAULT gen_random_uuid() PRIMARY KEY', nullable: false, description: 'Content ID' },
          { name: 'creator_id', type: 'UUID REFERENCES creators(id) ON DELETE CASCADE', nullable: false, description: 'Creator' },
          { name: 'type', type: 'TEXT', nullable: false, description: 'Content type (post, video, course)' },
          { name: 'title', type: 'TEXT', nullable: false, description: 'Title' },
          { name: 'slug', type: 'TEXT', nullable: false, description: 'URL slug' },
          { name: 'body', type: 'TEXT', nullable: true, description: 'Content body' },
          { name: 'media_url', type: 'TEXT', nullable: true, description: 'Media URL' },
          { name: 'thumbnail_url', type: 'TEXT', nullable: true, description: 'Thumbnail' },
          { name: 'is_premium', type: 'BOOLEAN DEFAULT FALSE', nullable: false, description: 'Requires subscription' },
          { name: 'price_cents', type: 'INTEGER', nullable: true, description: 'One-time price' },
          { name: 'view_count', type: 'INTEGER DEFAULT 0', nullable: false, description: 'Views' },
          { name: 'like_count', type: 'INTEGER DEFAULT 0', nullable: false, description: 'Likes' },
          { name: 'published_at', type: 'TIMESTAMPTZ', nullable: true, description: 'Publish date' },
          { name: 'created_at', type: 'TIMESTAMPTZ DEFAULT NOW()', nullable: false, description: 'Creation date' },
        ],
        indexes: ['idx_content_creator ON content(creator_id)', 'idx_content_slug ON content(creator_id, slug)'],
      },
      {
        name: 'followers',
        description: 'Creator-follower relationships',
        columns: [
          { name: 'id', type: 'UUID DEFAULT gen_random_uuid() PRIMARY KEY', nullable: false, description: 'Follow ID' },
          { name: 'creator_id', type: 'UUID REFERENCES creators(id) ON DELETE CASCADE', nullable: false, description: 'Creator' },
          { name: 'follower_user_id', type: 'UUID', nullable: false, description: 'Follower user ID' },
          { name: 'created_at', type: 'TIMESTAMPTZ DEFAULT NOW()', nullable: false, description: 'Follow date' },
        ],
        indexes: ['idx_followers_creator ON followers(creator_id)', 'idx_followers_unique ON followers(creator_id, follower_user_id)'],
      },
      {
        name: 'subscriptions',
        description: 'Paid subscriptions to creators',
        columns: [
          { name: 'id', type: 'UUID DEFAULT gen_random_uuid() PRIMARY KEY', nullable: false, description: 'Subscription ID' },
          { name: 'creator_id', type: 'UUID REFERENCES creators(id)', nullable: false, description: 'Creator' },
          { name: 'subscriber_user_id', type: 'UUID', nullable: false, description: 'Subscriber' },
          { name: 'tier', type: 'TEXT', nullable: false, description: 'Subscription tier' },
          { name: 'status', type: "TEXT DEFAULT 'active'", nullable: false, description: 'Status' },
          { name: 'current_period_end', type: 'TIMESTAMPTZ', nullable: false, description: 'Period end' },
          { name: 'stripe_subscription_id', type: 'TEXT', nullable: true, description: 'Stripe ID' },
          { name: 'created_at', type: 'TIMESTAMPTZ DEFAULT NOW()', nullable: false, description: 'Start date' },
        ],
        indexes: ['idx_subscriptions_creator ON subscriptions(creator_id)', 'idx_subscriptions_subscriber ON subscriptions(subscriber_user_id)'],
      },
    ],
    rlsPolicies: [
      { table: 'creators', name: 'creators_public', operation: 'SELECT', using: 'TRUE' },
      { table: 'content', name: 'content_public_view', operation: 'SELECT', using: 'published_at IS NOT NULL AND (is_premium = FALSE OR creator_id IN (SELECT creator_id FROM subscriptions WHERE subscriber_user_id = auth.uid()))' },
      { table: 'followers', name: 'followers_own', operation: 'ALL', using: 'follower_user_id = auth.uid()' },
    ],
  },

  services: {
    tables: [
      {
        name: 'clients',
        description: 'Client companies/individuals',
        columns: [
          { name: 'id', type: 'UUID DEFAULT gen_random_uuid() PRIMARY KEY', nullable: false, description: 'Client ID' },
          { name: 'owner_id', type: 'UUID', nullable: false, description: 'Account owner' },
          { name: 'company_name', type: 'TEXT', nullable: true, description: 'Company name' },
          { name: 'contact_name', type: 'TEXT', nullable: false, description: 'Primary contact' },
          { name: 'contact_email', type: 'TEXT', nullable: false, description: 'Contact email' },
          { name: 'phone', type: 'TEXT', nullable: true, description: 'Phone number' },
          { name: 'industry', type: 'TEXT', nullable: true, description: 'Industry' },
          { name: 'status', type: "TEXT DEFAULT 'lead'", nullable: false, description: 'Status (lead, active, churned)' },
          { name: 'source', type: 'TEXT', nullable: true, description: 'Lead source' },
          { name: 'notes', type: 'TEXT', nullable: true, description: 'Notes' },
          { name: 'created_at', type: 'TIMESTAMPTZ DEFAULT NOW()', nullable: false, description: 'Created' },
        ],
        indexes: ['idx_clients_owner ON clients(owner_id)', 'idx_clients_status ON clients(status)'],
      },
      {
        name: 'projects',
        description: 'Client projects',
        columns: [
          { name: 'id', type: 'UUID DEFAULT gen_random_uuid() PRIMARY KEY', nullable: false, description: 'Project ID' },
          { name: 'client_id', type: 'UUID REFERENCES clients(id) ON DELETE CASCADE', nullable: false, description: 'Client' },
          { name: 'name', type: 'TEXT', nullable: false, description: 'Project name' },
          { name: 'description', type: 'TEXT', nullable: true, description: 'Description' },
          { name: 'status', type: "TEXT DEFAULT 'pending'", nullable: false, description: 'Status' },
          { name: 'budget_cents', type: 'INTEGER', nullable: true, description: 'Budget' },
          { name: 'hourly_rate_cents', type: 'INTEGER', nullable: true, description: 'Hourly rate' },
          { name: 'estimated_hours', type: 'INTEGER', nullable: true, description: 'Estimated hours' },
          { name: 'start_date', type: 'DATE', nullable: true, description: 'Start date' },
          { name: 'due_date', type: 'DATE', nullable: true, description: 'Due date' },
          { name: 'completed_at', type: 'TIMESTAMPTZ', nullable: true, description: 'Completion date' },
          { name: 'created_at', type: 'TIMESTAMPTZ DEFAULT NOW()', nullable: false, description: 'Created' },
        ],
        indexes: ['idx_projects_client ON projects(client_id)', 'idx_projects_status ON projects(status)'],
      },
      {
        name: 'invoices',
        description: 'Client invoices',
        columns: [
          { name: 'id', type: 'UUID DEFAULT gen_random_uuid() PRIMARY KEY', nullable: false, description: 'Invoice ID' },
          { name: 'client_id', type: 'UUID REFERENCES clients(id)', nullable: false, description: 'Client' },
          { name: 'project_id', type: 'UUID REFERENCES projects(id)', nullable: true, description: 'Project' },
          { name: 'invoice_number', type: 'TEXT UNIQUE', nullable: false, description: 'Invoice number' },
          { name: 'amount_cents', type: 'INTEGER', nullable: false, description: 'Amount' },
          { name: 'status', type: "TEXT DEFAULT 'draft'", nullable: false, description: 'Status' },
          { name: 'due_date', type: 'DATE', nullable: false, description: 'Due date' },
          { name: 'paid_at', type: 'TIMESTAMPTZ', nullable: true, description: 'Payment date' },
          { name: 'stripe_invoice_id', type: 'TEXT', nullable: true, description: 'Stripe ID' },
          { name: 'created_at', type: 'TIMESTAMPTZ DEFAULT NOW()', nullable: false, description: 'Created' },
        ],
        indexes: ['idx_invoices_client ON invoices(client_id)', 'idx_invoices_status ON invoices(status)'],
      },
      {
        name: 'time_entries',
        description: 'Time tracking for billable hours',
        columns: [
          { name: 'id', type: 'UUID DEFAULT gen_random_uuid() PRIMARY KEY', nullable: false, description: 'Entry ID' },
          { name: 'project_id', type: 'UUID REFERENCES projects(id) ON DELETE CASCADE', nullable: false, description: 'Project' },
          { name: 'description', type: 'TEXT', nullable: false, description: 'Work description' },
          { name: 'duration_minutes', type: 'INTEGER', nullable: false, description: 'Duration' },
          { name: 'billable', type: 'BOOLEAN DEFAULT TRUE', nullable: false, description: 'Is billable' },
          { name: 'invoiced', type: 'BOOLEAN DEFAULT FALSE', nullable: false, description: 'Has been invoiced' },
          { name: 'date', type: 'DATE', nullable: false, description: 'Work date' },
          { name: 'created_at', type: 'TIMESTAMPTZ DEFAULT NOW()', nullable: false, description: 'Created' },
        ],
        indexes: ['idx_time_entries_project ON time_entries(project_id)', 'idx_time_entries_date ON time_entries(date)'],
      },
    ],
    rlsPolicies: [
      { table: 'clients', name: 'clients_own', operation: 'ALL', using: 'owner_id = auth.uid()' },
      { table: 'projects', name: 'projects_via_client', operation: 'ALL', using: 'client_id IN (SELECT id FROM clients WHERE owner_id = auth.uid())' },
      { table: 'invoices', name: 'invoices_via_client', operation: 'ALL', using: 'client_id IN (SELECT id FROM clients WHERE owner_id = auth.uid())' },
    ],
  },

  ecommerce: {
    tables: [
      {
        name: 'products',
        description: 'Product catalog',
        columns: [
          { name: 'id', type: 'UUID DEFAULT gen_random_uuid() PRIMARY KEY', nullable: false, description: 'Product ID' },
          { name: 'shop_id', type: 'UUID', nullable: false, description: 'Shop ID' },
          { name: 'name', type: 'TEXT', nullable: false, description: 'Product name' },
          { name: 'slug', type: 'TEXT', nullable: false, description: 'URL slug' },
          { name: 'description', type: 'TEXT', nullable: true, description: 'Description' },
          { name: 'price_cents', type: 'INTEGER', nullable: false, description: 'Price' },
          { name: 'compare_at_price_cents', type: 'INTEGER', nullable: true, description: 'Original price' },
          { name: 'cost_cents', type: 'INTEGER', nullable: true, description: 'Cost' },
          { name: 'sku', type: 'TEXT', nullable: true, description: 'SKU' },
          { name: 'inventory_count', type: 'INTEGER DEFAULT 0', nullable: false, description: 'Stock' },
          { name: 'track_inventory', type: 'BOOLEAN DEFAULT TRUE', nullable: false, description: 'Track stock' },
          { name: 'category', type: 'TEXT', nullable: true, description: 'Category' },
          { name: 'tags', type: "TEXT[] DEFAULT '{}'", nullable: false, description: 'Tags' },
          { name: 'images', type: "TEXT[] DEFAULT '{}'", nullable: false, description: 'Image URLs' },
          { name: 'is_published', type: 'BOOLEAN DEFAULT FALSE', nullable: false, description: 'Published' },
          { name: 'created_at', type: 'TIMESTAMPTZ DEFAULT NOW()', nullable: false, description: 'Created' },
        ],
        indexes: ['idx_products_shop ON products(shop_id)', 'idx_products_slug ON products(shop_id, slug)', 'idx_products_category ON products(category)'],
      },
      {
        name: 'product_variants',
        description: 'Product variants (size, color, etc.)',
        columns: [
          { name: 'id', type: 'UUID DEFAULT gen_random_uuid() PRIMARY KEY', nullable: false, description: 'Variant ID' },
          { name: 'product_id', type: 'UUID REFERENCES products(id) ON DELETE CASCADE', nullable: false, description: 'Product' },
          { name: 'name', type: 'TEXT', nullable: false, description: 'Variant name' },
          { name: 'sku', type: 'TEXT', nullable: true, description: 'SKU' },
          { name: 'price_cents', type: 'INTEGER', nullable: true, description: 'Price override' },
          { name: 'inventory_count', type: 'INTEGER DEFAULT 0', nullable: false, description: 'Stock' },
          { name: 'options', type: "JSONB DEFAULT '{}'", nullable: false, description: 'Options (size, color)' },
          { name: 'created_at', type: 'TIMESTAMPTZ DEFAULT NOW()', nullable: false, description: 'Created' },
        ],
        indexes: ['idx_variants_product ON product_variants(product_id)'],
      },
      {
        name: 'orders',
        description: 'Customer orders',
        columns: [
          { name: 'id', type: 'UUID DEFAULT gen_random_uuid() PRIMARY KEY', nullable: false, description: 'Order ID' },
          { name: 'shop_id', type: 'UUID', nullable: false, description: 'Shop' },
          { name: 'customer_email', type: 'TEXT', nullable: false, description: 'Customer email' },
          { name: 'order_number', type: 'TEXT UNIQUE', nullable: false, description: 'Order number' },
          { name: 'status', type: "TEXT DEFAULT 'pending'", nullable: false, description: 'Status' },
          { name: 'subtotal_cents', type: 'INTEGER', nullable: false, description: 'Subtotal' },
          { name: 'shipping_cents', type: 'INTEGER DEFAULT 0', nullable: false, description: 'Shipping cost' },
          { name: 'tax_cents', type: 'INTEGER DEFAULT 0', nullable: false, description: 'Tax' },
          { name: 'total_cents', type: 'INTEGER', nullable: false, description: 'Total' },
          { name: 'shipping_address', type: 'JSONB', nullable: true, description: 'Shipping address' },
          { name: 'billing_address', type: 'JSONB', nullable: true, description: 'Billing address' },
          { name: 'stripe_payment_id', type: 'TEXT', nullable: true, description: 'Payment ID' },
          { name: 'notes', type: 'TEXT', nullable: true, description: 'Notes' },
          { name: 'created_at', type: 'TIMESTAMPTZ DEFAULT NOW()', nullable: false, description: 'Created' },
        ],
        indexes: ['idx_orders_shop ON orders(shop_id)', 'idx_orders_customer ON orders(customer_email)', 'idx_orders_status ON orders(status)'],
      },
      {
        name: 'order_items',
        description: 'Items in an order',
        columns: [
          { name: 'id', type: 'UUID DEFAULT gen_random_uuid() PRIMARY KEY', nullable: false, description: 'Item ID' },
          { name: 'order_id', type: 'UUID REFERENCES orders(id) ON DELETE CASCADE', nullable: false, description: 'Order' },
          { name: 'product_id', type: 'UUID REFERENCES products(id)', nullable: false, description: 'Product' },
          { name: 'variant_id', type: 'UUID REFERENCES product_variants(id)', nullable: true, description: 'Variant' },
          { name: 'quantity', type: 'INTEGER', nullable: false, description: 'Quantity' },
          { name: 'unit_price_cents', type: 'INTEGER', nullable: false, description: 'Unit price' },
          { name: 'total_cents', type: 'INTEGER', nullable: false, description: 'Line total' },
        ],
        indexes: ['idx_order_items_order ON order_items(order_id)'],
      },
      {
        name: 'customers',
        description: 'Customer profiles',
        columns: [
          { name: 'id', type: 'UUID DEFAULT gen_random_uuid() PRIMARY KEY', nullable: false, description: 'Customer ID' },
          { name: 'shop_id', type: 'UUID', nullable: false, description: 'Shop' },
          { name: 'email', type: 'TEXT', nullable: false, description: 'Email' },
          { name: 'name', type: 'TEXT', nullable: true, description: 'Name' },
          { name: 'phone', type: 'TEXT', nullable: true, description: 'Phone' },
          { name: 'order_count', type: 'INTEGER DEFAULT 0', nullable: false, description: 'Total orders' },
          { name: 'total_spent_cents', type: 'INTEGER DEFAULT 0', nullable: false, description: 'Total spent' },
          { name: 'accepts_marketing', type: 'BOOLEAN DEFAULT FALSE', nullable: false, description: 'Marketing opt-in' },
          { name: 'created_at', type: 'TIMESTAMPTZ DEFAULT NOW()', nullable: false, description: 'Created' },
        ],
        indexes: ['idx_customers_shop ON customers(shop_id)', 'idx_customers_email ON customers(shop_id, email)'],
      },
    ],
    rlsPolicies: [
      { table: 'products', name: 'products_public_view', operation: 'SELECT', using: 'is_published = TRUE' },
      { table: 'products', name: 'products_shop_manage', operation: 'ALL', using: 'shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid())' },
      { table: 'orders', name: 'orders_shop_view', operation: 'ALL', using: 'shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid())' },
    ],
  },
};

// ============================================================
// Email Sequence Templates
// ============================================================

export interface EmailSequenceTemplate {
  name: string;
  trigger: string;
  emails: {
    delay: string;
    subject: string;
    purpose: string;
    keyPoints: string[];
  }[];
}

export const EMAIL_SEQUENCE_TEMPLATES: Record<BusinessType, EmailSequenceTemplate[]> = {
  saas: [
    {
      name: 'Welcome Sequence',
      trigger: 'user_signup',
      emails: [
        { delay: '0', subject: 'Welcome to {productName}!', purpose: 'welcome', keyPoints: ['Thank them', 'Quick start guide', 'Support contact'] },
        { delay: '1d', subject: 'Quick tip to get started', purpose: 'onboarding', keyPoints: ['One key feature', 'Action CTA', 'Help link'] },
        { delay: '3d', subject: "How's it going with {productName}?", purpose: 'engagement', keyPoints: ['Check-in', 'Feature highlight', 'Feedback ask'] },
        { delay: '7d', subject: 'Unlock the full potential', purpose: 'upgrade', keyPoints: ['Value recap', 'Premium features', 'Upgrade CTA'] },
      ],
    },
    {
      name: 'Trial Ending',
      trigger: 'trial_ending_3_days',
      emails: [
        { delay: '0', subject: 'Your trial ends in 3 days', purpose: 'reminder', keyPoints: ['Days remaining', 'What they lose', 'Upgrade CTA'] },
        { delay: '2d', subject: 'Last day of your trial', purpose: 'urgency', keyPoints: ['Final reminder', 'Special offer', 'Easy upgrade'] },
      ],
    },
  ],
  creator: [
    {
      name: 'New Follower',
      trigger: 'new_follower',
      emails: [
        { delay: '0', subject: 'Thanks for following!', purpose: 'welcome', keyPoints: ['Appreciation', 'Best content link', 'What to expect'] },
      ],
    },
    {
      name: 'New Subscriber',
      trigger: 'new_subscription',
      emails: [
        { delay: '0', subject: "You're in! Here's your exclusive access", purpose: 'welcome', keyPoints: ['Thank you', 'Exclusive content links', 'Community access'] },
        { delay: '3d', subject: 'Check out what you might have missed', purpose: 'engagement', keyPoints: ['Popular content', 'Upcoming releases', 'Feedback ask'] },
      ],
    },
  ],
  services: [
    {
      name: 'New Lead',
      trigger: 'lead_created',
      emails: [
        { delay: '0', subject: 'Thanks for reaching out!', purpose: 'acknowledgment', keyPoints: ['Received confirmation', 'Response timeline', 'Portfolio link'] },
        { delay: '2d', subject: 'Quick follow-up on your inquiry', purpose: 'follow_up', keyPoints: ['Check-in', 'Availability', 'Calendar link'] },
      ],
    },
    {
      name: 'Project Completion',
      trigger: 'project_completed',
      emails: [
        { delay: '0', subject: 'Your project is complete!', purpose: 'delivery', keyPoints: ['Deliverables recap', 'Next steps', 'Feedback request'] },
        { delay: '7d', subject: "How's everything working?", purpose: 'follow_up', keyPoints: ['Check-in', 'Support offer', 'Referral ask'] },
      ],
    },
  ],
  ecommerce: [
    {
      name: 'Order Confirmation',
      trigger: 'order_placed',
      emails: [
        { delay: '0', subject: 'Order confirmed! #{orderNumber}', purpose: 'confirmation', keyPoints: ['Order details', 'Shipping timeline', 'Contact support'] },
      ],
    },
    {
      name: 'Abandoned Cart',
      trigger: 'cart_abandoned_1_hour',
      emails: [
        { delay: '0', subject: 'Did you forget something?', purpose: 'recovery', keyPoints: ['Cart items', 'Easy checkout link', 'Help offer'] },
        { delay: '1d', subject: 'Your cart is waiting!', purpose: 'recovery', keyPoints: ['Items still available', 'Limited stock warning', 'Checkout CTA'] },
        { delay: '3d', subject: 'Last chance: 10% off your cart', purpose: 'discount', keyPoints: ['Discount code', 'Expiration', 'Checkout CTA'] },
      ],
    },
    {
      name: 'Post-Purchase',
      trigger: 'order_delivered',
      emails: [
        { delay: '3d', subject: 'How do you like your purchase?', purpose: 'review_request', keyPoints: ['Product satisfaction', 'Review request', 'Social share'] },
        { delay: '14d', subject: 'Customers like you also loved...', purpose: 'cross_sell', keyPoints: ['Related products', 'Personalized picks', 'Shop CTA'] },
      ],
    },
  ],
};

// ============================================================
// Landing Page Templates
// ============================================================

export interface LandingPageTemplate {
  sections: string[];
  heroVariants: {
    name: string;
    structure: string;
  }[];
  colorSchemes: {
    name: string;
    primary: string;
    secondary: string;
    accent: string;
  }[];
}

export const LANDING_PAGE_TEMPLATES: Record<BusinessType, LandingPageTemplate> = {
  saas: {
    sections: ['hero', 'features', 'how-it-works', 'pricing', 'testimonials', 'faq', 'cta', 'footer'],
    heroVariants: [
      { name: 'product-demo', structure: 'Split: headline + subheadline left, product screenshot/video right' },
      { name: 'social-proof', structure: 'Centered headline, user count/logos below, CTA prominent' },
      { name: 'benefit-focused', structure: 'Big headline with key benefit, supporting stats, dual CTAs' },
    ],
    colorSchemes: [
      { name: 'trust', primary: '#2563eb', secondary: '#1e40af', accent: '#3b82f6' },
      { name: 'modern', primary: '#8b5cf6', secondary: '#7c3aed', accent: '#a78bfa' },
      { name: 'growth', primary: '#059669', secondary: '#047857', accent: '#10b981' },
    ],
  },
  creator: {
    sections: ['hero', 'about', 'content-preview', 'membership-tiers', 'testimonials', 'cta', 'footer'],
    heroVariants: [
      { name: 'personality', structure: 'Large creator photo, name + tagline, follow CTA' },
      { name: 'content-first', structure: 'Featured content preview, creator info secondary' },
      { name: 'community', structure: 'Follower count prominent, community highlights, join CTA' },
    ],
    colorSchemes: [
      { name: 'creator', primary: '#ec4899', secondary: '#db2777', accent: '#f472b6' },
      { name: 'professional', primary: '#0ea5e9', secondary: '#0284c7', accent: '#38bdf8' },
      { name: 'bold', primary: '#f97316', secondary: '#ea580c', accent: '#fb923c' },
    ],
  },
  services: {
    sections: ['hero', 'services', 'process', 'portfolio', 'testimonials', 'about', 'contact', 'footer'],
    heroVariants: [
      { name: 'results-focused', structure: 'Headline with client result, case study preview, contact CTA' },
      { name: 'expertise', structure: 'Services overview, years of experience, credentials' },
      { name: 'personal', structure: 'Founder photo + intro, specialization, booking CTA' },
    ],
    colorSchemes: [
      { name: 'professional', primary: '#1e293b', secondary: '#334155', accent: '#3b82f6' },
      { name: 'creative', primary: '#7c3aed', secondary: '#6d28d9', accent: '#a78bfa' },
      { name: 'warm', primary: '#b45309', secondary: '#92400e', accent: '#f59e0b' },
    ],
  },
  ecommerce: {
    sections: ['hero', 'featured-products', 'categories', 'bestsellers', 'reviews', 'about-brand', 'newsletter', 'footer'],
    heroVariants: [
      { name: 'product-showcase', structure: 'Hero product image, headline, shop now CTA' },
      { name: 'collection', structure: 'Multiple products grid, collection name, browse CTA' },
      { name: 'lifestyle', structure: 'Lifestyle imagery, brand story snippet, explore CTA' },
    ],
    colorSchemes: [
      { name: 'luxury', primary: '#18181b', secondary: '#27272a', accent: '#d4af37' },
      { name: 'fresh', primary: '#059669', secondary: '#047857', accent: '#34d399' },
      { name: 'playful', primary: '#f43f5e', secondary: '#e11d48', accent: '#fb7185' },
    ],
  },
};

// ============================================================
// FAQ Categories Templates
// ============================================================

export const FAQ_CATEGORY_TEMPLATES: Record<BusinessType, { name: string; slug: string; description: string }[]> = {
  saas: [
    { name: 'Getting Started', slug: 'getting-started', description: 'Setup, onboarding, and first steps' },
    { name: 'Account & Billing', slug: 'account-billing', description: 'Subscriptions, payments, and account management' },
    { name: 'Features', slug: 'features', description: 'How to use product features' },
    { name: 'Integrations', slug: 'integrations', description: 'Connecting with other tools' },
    { name: 'Troubleshooting', slug: 'troubleshooting', description: 'Common issues and solutions' },
  ],
  creator: [
    { name: 'Subscription', slug: 'subscription', description: 'Membership tiers and benefits' },
    { name: 'Content Access', slug: 'content-access', description: 'Accessing and downloading content' },
    { name: 'Community', slug: 'community', description: 'Discord, comments, and interaction' },
    { name: 'Payments', slug: 'payments', description: 'Billing, refunds, and payment methods' },
  ],
  services: [
    { name: 'Services', slug: 'services', description: 'What we offer and how we work' },
    { name: 'Process', slug: 'process', description: 'How projects work from start to finish' },
    { name: 'Pricing', slug: 'pricing', description: 'Rates, packages, and payment terms' },
    { name: 'Working Together', slug: 'working-together', description: 'Communication, revisions, and timelines' },
  ],
  ecommerce: [
    { name: 'Ordering', slug: 'ordering', description: 'Placing orders and checkout' },
    { name: 'Shipping', slug: 'shipping', description: 'Delivery times, tracking, and international shipping' },
    { name: 'Returns', slug: 'returns', description: 'Return policy, exchanges, and refunds' },
    { name: 'Products', slug: 'products', description: 'Product information and care' },
    { name: 'Account', slug: 'account', description: 'Managing your account and orders' },
  ],
};

// ============================================================
// Social Content Templates
// ============================================================

export interface SocialContentTemplate {
  bioStructure: string;
  contentTypes: string[];
  hashtagCategories: string[];
  postingFrequency: string;
}

export const SOCIAL_TEMPLATES: Record<BusinessType, SocialContentTemplate> = {
  saas: {
    bioStructure: '{productName} | {tagline} | {keyBenefit} | Link below',
    contentTypes: ['product tips', 'feature highlights', 'customer stories', 'industry insights', 'team behind-the-scenes'],
    hashtagCategories: ['product', 'industry', 'startup', 'productivity'],
    postingFrequency: '1-2 posts daily, threads 2x/week',
  },
  creator: {
    bioStructure: '{name} | {niche} | {credibility} | {cta}',
    contentTypes: ['content previews', 'personal insights', 'value threads', 'community engagement', 'behind-the-scenes'],
    hashtagCategories: ['niche', 'personal brand', 'community'],
    postingFrequency: '2-3 posts daily, threads 3x/week',
  },
  services: {
    bioStructure: '{role} | {specialization} | {result/credibility} | {cta}',
    contentTypes: ['case studies', 'expertise tips', 'client results', 'process insights', 'industry commentary'],
    hashtagCategories: ['expertise', 'industry', 'business'],
    postingFrequency: '1 post daily, case study threads weekly',
  },
  ecommerce: {
    bioStructure: '{brandName} | {tagline} | {uniqueSelling} | Shop: {link}',
    contentTypes: ['product showcases', 'customer photos', 'behind-the-scenes', 'promotions', 'lifestyle content'],
    hashtagCategories: ['brand', 'product category', 'lifestyle'],
    postingFrequency: '1-2 posts daily, promotions as needed',
  },
};
