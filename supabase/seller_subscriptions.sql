CREATE TABLE IF NOT EXISTS public.seller_subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  stripe_customer_id text,
  stripe_subscription_id text UNIQUE,
  plan text CHECK (plan IN ('basic', 'premium')),
  status text CHECK (status IN ('active', 'cancelled', 'past_due')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
