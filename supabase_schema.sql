-- ==========================================
-- Supabase Schema Update for varmudio v7
-- ==========================================

-- 1. ENHANCE CHATS TABLE
-- Add support for pinned chats, folders, and tags
ALTER TABLE chats 
ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS folder_id UUID,
ADD COLUMN IF NOT EXISTS tags TEXT[], -- Array of strings for tags
ADD COLUMN IF NOT EXISTS summary TEXT;  -- Auto-generated summary

-- 2. ENHANCE MESSAGES TABLE
-- Add support for feedback (thumbs up/down) and tokens
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS feedback TEXT CHECK (feedback IN ('up', 'down', NULL)),
ADD COLUMN IF NOT EXISTS tokens_used INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS model_used TEXT; -- To track which model generated this specific message

-- 3. CREATE FOLDERS TABLE (New Feature)
CREATE TABLE IF NOT EXISTS folders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    name TEXT NOT NULL,
    color TEXT DEFAULT '#27272a',
    parent_id UUID REFERENCES folders(id)
);

-- 4. CREATE PROMPTS LIBRARY (New Feature)
-- Store reusable system prompts
CREATE TABLE IF NOT EXISTS system_prompts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT DEFAULT 'General',
    is_public BOOLEAN DEFAULT FALSE
);

-- 5. CREATE INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON chats(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_chats_folder_id ON chats(folder_id);

-- 6. ROW LEVEL SECURITY (RLS) - Basic Setup
-- Enable RLS to ensure data safety if you expose Supabase directly to client
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all operations for now (Modify this if adding Auth later)
CREATE POLICY "Allow all access" ON chats FOR ALL USING (true);
CREATE POLICY "Allow all access" ON messages FOR ALL USING (true);
CREATE POLICY "Allow all access" ON folders FOR ALL USING (true);

-- ==========================================
-- Run this in your Supabase SQL Editor
-- ==========================================
