import { createClient } from '@supabase/supabase-js'

const supabaseUrl = "https://havgnqcvnkdgiqojmbvh.supabase.co"
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhdmducWN2bmtkZ2lxb2ptYnZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5MjMyNDQsImV4cCI6MjA2OTQ5OTI0NH0.TN3iYyA3Hj44TKJB4V83hrGfDFD9pH7lA5d1qXwEhbk"

export const supabase = createClient(supabaseUrl, supabaseKey) 