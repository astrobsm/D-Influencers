CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(30),
  email VARCHAR(160) UNIQUE,
  sponsor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  rank VARCHAR(40) DEFAULT 'starter',
  join_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prospects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(30),
  source VARCHAR(40) DEFAULT 'other',
  status VARCHAR(20) DEFAULT 'cold' CHECK (status IN ('cold', 'warm', 'hot', 'converted')),
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  notes TEXT,
  added_date DATE DEFAULT CURRENT_DATE,
  next_followup DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS follow_ups (
  id SERIAL PRIMARY KEY,
  prospect_id INTEGER NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  method VARCHAR(30) DEFAULT 'whatsapp',
  notes TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_members (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(30),
  level VARCHAR(40) DEFAULT 'starter',
  sponsor_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
  active BOOLEAN DEFAULT TRUE,
  join_date DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commissions (
  id SERIAL PRIMARY KEY,
  member_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
  amount NUMERIC(12, 2) NOT NULL,
  type VARCHAR(30) DEFAULT 'personal',
  month VARCHAR(7),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS training_progress (
  id SERIAL PRIMARY KEY,
  member_id INTEGER REFERENCES team_members(id) ON DELETE CASCADE,
  module VARCHAR(160) NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  completed_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_checklist (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  checklist_date DATE NOT NULL DEFAULT CURRENT_DATE,
  block VARCHAR(20) NOT NULL CHECK (block IN ('morning', 'afternoon', 'evening', 'night')),
  task TEXT NOT NULL,
  done BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(status);
CREATE INDEX IF NOT EXISTS idx_followups_date ON follow_ups(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_team_members_level ON team_members(level);
CREATE INDEX IF NOT EXISTS idx_commissions_month ON commissions(month);
