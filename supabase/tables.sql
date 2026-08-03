-- ============================================================
-- ZMT Auto Parts - Supabase Database Tables
-- ============================================================
-- انسخ هذا الكود والصقه في Supabase Dashboard → SQL Editor → Run

-- ===== 1. جدول المحلات الرئيسية =====
CREATE TABLE IF NOT EXISTS stores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code VARCHAR(10) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  store_name VARCHAR(255) DEFAULT 'ZMT Auto Parts',
  password_hash VARCHAR(64) DEFAULT '',
  password_salt VARCHAR(32) DEFAULT '',
  password_plain VARCHAR(255) DEFAULT '',
  last_password_hash VARCHAR(64) DEFAULT '',
  last_password_salt VARCHAR(32) DEFAULT '',
  auth_password VARCHAR(255) DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===== 2. جدول الفروع =====
CREATE TABLE IF NOT EXISTS branches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code VARCHAR(10) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===== 3. جدول مستخدمي البرنامج =====
CREATE TABLE IF NOT EXISTS app_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL,
  permissions JSONB DEFAULT '{}',
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(username, store_id),
  UNIQUE(username, branch_id)
);

-- ===== 4. تفعيل Row Level Security =====
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

-- ===== 5. سياسات الأمان (السماح بالوصول بال anon key) =====
CREATE POLICY "Allow all on stores" ON stores FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on branches" ON branches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on app_users" ON app_users FOR ALL USING (true) WITH CHECK (true);

-- ===== 6. فهارس للبحث السريع =====
CREATE INDEX IF NOT EXISTS idx_stores_code ON stores(code);
CREATE INDEX IF NOT EXISTS idx_stores_email ON stores(email);
CREATE INDEX IF NOT EXISTS idx_branches_code ON branches(code);
CREATE INDEX IF NOT EXISTS idx_branches_store_id ON branches(store_id);
CREATE INDEX IF NOT EXISTS idx_app_users_store_id ON app_users(store_id);
CREATE INDEX IF NOT EXISTS idx_app_users_branch_id ON app_users(branch_id);

-- ===== 7. إضافة عمود password_plain للجداول الموجودة (شغّل هذا مرة واحدة) =====
-- ALTER TABLE stores ADD COLUMN IF NOT EXISTS password_plain VARCHAR(255) DEFAULT '';
