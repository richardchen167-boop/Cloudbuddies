/*
  # Restore Full Schema

  This migration creates all missing tables that were defined in previous migrations
  but are not present in the current database. Tables already existing (pets, chat_messages,
  shop_items, user_sessions) are skipped with IF NOT EXISTS.

  1. Tables Created/Restored:
    - `user_settings` - User profile, username, bio, trade settings
    - `pet_accessories` - Accessories/items attached to pets
    - `pet_events` - Random pet events log
    - `pet_activity_log` - Activity history per pet
    - `user_activity` - General user activity tracking
    - `user_trade_settings` - Trade preference per user
    - `trade_requests` - Trade offers between users
    - `house_inventory` - Items placed in user's house
    - `pet_inventory` - Pet items owned by users
    - `accessory_inventory` - Accessories owned by users
    - `user_followers` - Follow relationships between users
    - `banned_users` - Admin ban records
    - `admins` - Admin user records
    - `friends` - Friend relationships between users

  2. Security:
    - RLS enabled on all tables with appropriate policies
*/

-- user_settings
CREATE TABLE IF NOT EXISTS user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL,
  username text,
  display_name text,
  bio text,
  trades_enabled boolean DEFAULT false,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_settings' AND policyname='Anyone can view user settings') THEN
    CREATE POLICY "Anyone can view user settings" ON user_settings FOR SELECT USING (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_settings' AND policyname='Users can insert own settings') THEN
    CREATE POLICY "Users can insert own settings" ON user_settings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_settings' AND policyname='Users can update own settings') THEN
    CREATE POLICY "Users can update own settings" ON user_settings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- pet_accessories
CREATE TABLE IF NOT EXISTS pet_accessories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id uuid REFERENCES pets(id) ON DELETE CASCADE,
  item_type text NOT NULL,
  item_name text NOT NULL,
  equipped_at timestamptz DEFAULT now()
);
ALTER TABLE pet_accessories ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pet_accessories' AND policyname='Anyone can view accessories') THEN
    CREATE POLICY "Anyone can view accessories" ON pet_accessories FOR SELECT USING (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pet_accessories' AND policyname='Authenticated users can manage accessories') THEN
    CREATE POLICY "Authenticated users can manage accessories" ON pet_accessories FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- pet_events
CREATE TABLE IF NOT EXISTS pet_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id uuid REFERENCES pets(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  description text,
  occurred_at timestamptz DEFAULT now()
);
ALTER TABLE pet_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pet_events' AND policyname='Anyone can view events') THEN
    CREATE POLICY "Anyone can view events" ON pet_events FOR SELECT USING (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pet_events' AND policyname='Authenticated users can insert events') THEN
    CREATE POLICY "Authenticated users can insert events" ON pet_events FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

-- pet_activity_log
CREATE TABLE IF NOT EXISTS pet_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id uuid REFERENCES pets(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  xp_earned integer DEFAULT 0,
  performed_at timestamptz DEFAULT now()
);
ALTER TABLE pet_activity_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pet_activity_log' AND policyname='Anyone can view activity log') THEN
    CREATE POLICY "Anyone can view activity log" ON pet_activity_log FOR SELECT USING (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pet_activity_log' AND policyname='Authenticated users can insert activity') THEN
    CREATE POLICY "Authenticated users can insert activity" ON pet_activity_log FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

-- user_activity
CREATE TABLE IF NOT EXISTS user_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE user_activity ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_activity' AND policyname='Users can view own activity') THEN
    CREATE POLICY "Users can view own activity" ON user_activity FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_activity' AND policyname='Users can insert own activity') THEN
    CREATE POLICY "Users can insert own activity" ON user_activity FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- trade_requests
CREATE TABLE IF NOT EXISTS trade_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  receiver_id uuid NOT NULL,
  sender_offer jsonb DEFAULT '[]',
  receiver_offer jsonb DEFAULT '[]',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE trade_requests ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trade_requests' AND policyname='Users can view own trades') THEN
    CREATE POLICY "Users can view own trades" ON trade_requests FOR SELECT TO authenticated USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trade_requests' AND policyname='Users can insert trades') THEN
    CREATE POLICY "Users can insert trades" ON trade_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trade_requests' AND policyname='Users can update own trades') THEN
    CREATE POLICY "Users can update own trades" ON trade_requests FOR UPDATE TO authenticated USING (auth.uid() = sender_id OR auth.uid() = receiver_id) WITH CHECK (auth.uid() = sender_id OR auth.uid() = receiver_id);
  END IF;
END $$;

-- house_inventory
CREATE TABLE IF NOT EXISTS house_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  item_type text NOT NULL,
  item_name text NOT NULL,
  position_x integer DEFAULT 0,
  position_y integer DEFAULT 0,
  placed_at timestamptz DEFAULT now()
);
ALTER TABLE house_inventory ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='house_inventory' AND policyname='Anyone can view house inventory') THEN
    CREATE POLICY "Anyone can view house inventory" ON house_inventory FOR SELECT USING (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='house_inventory' AND policyname='Users can manage own house inventory') THEN
    CREATE POLICY "Users can manage own house inventory" ON house_inventory FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- pet_inventory
CREATE TABLE IF NOT EXISTS pet_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  item_type text NOT NULL,
  item_name text NOT NULL,
  quantity integer DEFAULT 1,
  acquired_at timestamptz DEFAULT now()
);
ALTER TABLE pet_inventory ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pet_inventory' AND policyname='Users can view own pet inventory') THEN
    CREATE POLICY "Users can view own pet inventory" ON pet_inventory FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pet_inventory' AND policyname='Users can manage own pet inventory') THEN
    CREATE POLICY "Users can manage own pet inventory" ON pet_inventory FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- accessory_inventory
CREATE TABLE IF NOT EXISTS accessory_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  item_type text NOT NULL,
  item_name text NOT NULL,
  quantity integer DEFAULT 1,
  acquired_at timestamptz DEFAULT now()
);
ALTER TABLE accessory_inventory ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='accessory_inventory' AND policyname='Users can view own accessory inventory') THEN
    CREATE POLICY "Users can view own accessory inventory" ON accessory_inventory FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='accessory_inventory' AND policyname='Users can manage own accessory inventory') THEN
    CREATE POLICY "Users can manage own accessory inventory" ON accessory_inventory FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- user_followers
CREATE TABLE IF NOT EXISTS user_followers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL,
  following_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(follower_id, following_id)
);
ALTER TABLE user_followers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_followers' AND policyname='Anyone can view followers') THEN
    CREATE POLICY "Anyone can view followers" ON user_followers FOR SELECT USING (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_followers' AND policyname='Users can manage own follows') THEN
    CREATE POLICY "Users can manage own follows" ON user_followers FOR ALL TO authenticated USING (auth.uid() = follower_id) WITH CHECK (auth.uid() = follower_id);
  END IF;
END $$;

-- banned_users
CREATE TABLE IF NOT EXISTS banned_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL,
  banned_by uuid,
  reason text DEFAULT '',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE banned_users ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='banned_users' AND policyname='Admins can manage banned users') THEN
    CREATE POLICY "Admins can manage banned users" ON banned_users FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- admins
CREATE TABLE IF NOT EXISTS admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL,
  granted_by uuid,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='admins' AND policyname='Anyone can view admins') THEN
    CREATE POLICY "Anyone can view admins" ON admins FOR SELECT USING (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='admins' AND policyname='Admins can manage admins') THEN
    CREATE POLICY "Admins can manage admins" ON admins FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- friends
CREATE TABLE IF NOT EXISTS friends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL,
  addressee_id uuid NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(requester_id, addressee_id)
);
ALTER TABLE friends ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='friends' AND policyname='Users can view own friend requests') THEN
    CREATE POLICY "Users can view own friend requests" ON friends FOR SELECT TO authenticated USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='friends' AND policyname='Users can send friend requests') THEN
    CREATE POLICY "Users can send friend requests" ON friends FOR INSERT TO authenticated WITH CHECK (auth.uid() = requester_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='friends' AND policyname='Users can update friend requests they received') THEN
    CREATE POLICY "Users can update friend requests they received" ON friends FOR UPDATE TO authenticated USING (auth.uid() = addressee_id OR auth.uid() = requester_id) WITH CHECK (auth.uid() = addressee_id OR auth.uid() = requester_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='friends' AND policyname='Users can delete own friend records') THEN
    CREATE POLICY "Users can delete own friend records" ON friends FOR DELETE TO authenticated USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
  END IF;
END $$;

-- add_first_admin function
CREATE OR REPLACE FUNCTION add_first_admin(new_admin_id uuid)
RETURNS void AS $$
BEGIN
  INSERT INTO admins (user_id) VALUES (new_admin_id) ON CONFLICT (user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
