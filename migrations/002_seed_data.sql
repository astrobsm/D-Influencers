-- Skipped users seed (table pre-exists in this Supabase project with different schema)

INSERT INTO team_members (name, phone, level, active, notes)
VALUES
  ('Amara Nwosu', '+2348011111111', 'leader', TRUE, 'Top performer'),
  ('Tunde Balogun', '+2348022222222', 'senior', TRUE, 'Great presenter'),
  ('Chioma Eze', '+2348033333333', 'consultant', TRUE, 'Strong prospector')
ON CONFLICT DO NOTHING;

INSERT INTO prospects (name, phone, source, status, priority, notes)
VALUES
  ('Kelechi Obi', '+2348044444444', 'whatsapp', 'warm', 'high', 'Interested in business model'),
  ('Bola Ade', '+2348055555555', 'instagram', 'cold', 'medium', 'Needs follow-up next week'),
  ('Mariam Yusuf', '+2348066666666', 'referral', 'hot', 'high', 'Requested compensation plan details')
ON CONFLICT DO NOTHING;

INSERT INTO follow_ups (prospect_id, scheduled_date, method, notes)
SELECT id, CURRENT_DATE + INTERVAL '1 day', 'whatsapp', 'Share testimony and invite to presentation'
FROM prospects
WHERE name = 'Kelechi Obi'
LIMIT 1;

INSERT INTO commissions (member_id, amount, type, month, status, notes)
SELECT tm.id, 25000, 'personal', TO_CHAR(NOW(), 'YYYY-MM'), 'paid', 'Starter package sale'
FROM team_members tm
WHERE tm.name = 'Amara Nwosu'
LIMIT 1;
