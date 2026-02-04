import express from "express";
import OpenAI from "openai";
import dotenv from "dotenv";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import serverless from "serverless-http";

dotenv.config();

const app = express();
// Use memory storage for Netlify Functions (read-only filesystem)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

app.use(express.json({ limit: "50mb" }));

// Request Logger & Body Recovery for Netlify
app.use((req, res, next) => {
    console.log(`[DEBUG] ${req.method} ${req.url}`);
    console.log(`[DEBUG] Headers:`, JSON.stringify(req.headers));

    // If body is empty but there is raw data (common in some serverless wrappers)
    if (req.body && Object.keys(req.body).length === 0 && req.rawBody) {
        try {
            req.body = JSON.parse(req.rawBody);
            console.log("[DEBUG] Recovered body from rawBody");
        } catch (e) {
            console.error("[ERROR] Failed to parse rawBody:", e.message);
        }
    }
    next();
});

const getOpenAIClient = () => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        throw new Error("Missing GROQ_API_KEY environment variable in Netlify Site Settings.");
    }
    return new OpenAI({
        apiKey: apiKey,
        baseURL: "https://api.groq.com/openai/v1"
    });
};

const POLLINATIONS_API_KEY = process.env.POLLINATIONS_API_KEY;

// Auto model selection logic
function selectOptimalModelServer(query) {
    const query_lower = query.toLowerCase();
    const query_length = query.length;
    const isCoding = /\b(code|program|debug|function|class|api|javascript|python|java|cpp|rust|go|sql|html|css|react|node|express|algorithm|git|github|bug|error|exception|variable|async|await|database|docker|kubernetes|testing|optimization|refactor|design pattern|architecture|microservices|json|xml|yaml|csv|regex)\b/i.test(query_lower);
    const isMath = /\b(math|calculate|equation|formula|algebra|calculus|geometry|statistics|probability|matrix|vector|solve|theorem|proof|graph|data analysis|machine learning|neural network|tensorflow|pytorch|pandas|numpy)\b/i.test(query_lower);
    const isWriting = /\b(write|essay|article|blog|story|fiction|novel|poem|grammar|spelling|edit|proofread|draft|outline|creative|literature|thesis|dissertation|academic|translate|language)\b/i.test(query_lower);
    const isLongContext = query_length > 8000 || /\b(document|analyze|summary|extract|find in|search through|large file|entire text|full content)\b/i.test(query_lower);

    if (isLongContext || isWriting) return 'openai/gpt-oss-120b';
    if (isMath || isCoding) return 'qwen/qwen3-32b';
    if (query_length < 200) return 'llama-3.1-8b-instant';
    return 'llama-3.3-70b-versatile';
}

// Health check and diagnostics
app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        env_keys_detected: Object.keys(process.env).filter(key =>
            ['GROQ_API_KEY', 'SUPABASE_URL', 'SUPABASE_KEY', 'POLLINATIONS_API_KEY', 'PORT', 'NODE_ENV'].includes(key)
        ),
        env: {
            hasGroqKey: !!process.env.GROQ_API_KEY,
            hasSupabase: !!process.env.SUPABASE_URL && !!process.env.SUPABASE_KEY,
            hasPollinationsKey: !!process.env.POLLINATIONS_API_KEY
        },
        node_version: process.version
    });
});

// Simple AI test (Non-streaming)
app.get("/api/test-ai", async (req, res) => {
    try {
        console.log("Testing AI connection...");
        const client = getOpenAIClient();
        const completion = await client.chat.completions.create({
            model: "llama-3.1-8b-instant",
            messages: [{ role: "user", content: "Say 'Connection successful' if you can read this." }],
            max_tokens: 20
        });
        res.json({
            success: true,
            response: completion.choices[0].message.content,
            model: completion.model
        });
    } catch (error) {
        console.error("AI Test Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post("/api/generate-image", async (req, res) => {
    try {
        const { prompt, model = "flux", enhance = true } = req.body;
        if (!prompt) return res.status(400).json({ error: "Prompt is required" });
        const seed = Math.floor(Math.random() * 2147483647);
        let targetModel = model;
        if (model === "bytedance-seed/seedream-4.5") targetModel = "seedream";

        const url = new URL(`https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}`);
        url.searchParams.append("model", targetModel);
        url.searchParams.append("seed", seed.toString());
        url.searchParams.append("enhance", enhance.toString());
        url.searchParams.append("nologo", "true");
        if (POLLINATIONS_API_KEY) url.searchParams.append("key", POLLINATIONS_API_KEY);

        res.json({ imageUrl: url.toString() });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/api/chat", async (req, res) => {
    console.log("[DEBUG] Chat Request Body:", JSON.stringify(req.body));
    const { messages, model, temperature, max_tokens, stream: shouldStream = true } = req.body || {};

    if (!messages || !Array.isArray(messages)) {
        console.error("[ERROR] Missing or invalid messages in request body");
        return res.status(400).json({ error: "Messages are required and must be an array." });
    }

    try {
        let modelId = model || "llama-3.3-70b-versatile";
        // ... (rest of model selection logic stays same) ...
        const hasImages = messages.some(m => Array.isArray(m.content) && m.content.some(c => c.type === 'image_url') || (m.image_url));
        if (hasImages) modelId = "llama-3.2-11b-vision-preview";
        else if (modelId === 'auto' && messages && messages.length > 0) {
            const lastUserMessage = messages.slice().reverse().find(m => m.role === 'user');
            if (lastUserMessage) {
                const query = typeof lastUserMessage.content === 'string' ? lastUserMessage.content : "";
                modelId = selectOptimalModelServer(query);
            }
        }

        const normalizedMessages = messages.map(m => {
            if (m.image_url && !Array.isArray(m.content)) return { role: m.role, content: [{ type: "text", text: m.content || "" }, { type: "image_url", image_url: { url: m.image_url } }] };
            return { role: m.role, content: Array.isArray(m.content) ? m.content : String(m.content || "") };
        });

        if (shouldStream) {
            res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache"
            });
            const stream = await getOpenAIClient().chat.completions.create({
                model: modelId,
                messages: normalizedMessages,
                stream: true,
                temperature: parseFloat(temperature) || 0.7,
                max_tokens: Math.min(parseInt(max_tokens) || 4096, 4096),
            });

            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || "";
                if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            res.end();
        } else {
            // Full response fallback for Netlify buffering
            const completion = await getOpenAIClient().chat.completions.create({
                model: modelId,
                messages: normalizedMessages,
                stream: false,
                temperature: parseFloat(temperature) || 0.7,
                max_tokens: Math.min(parseInt(max_tokens) || 4096, 4096),
            });
            res.json({ content: completion.choices[0].message.content });
        }
    } catch (error) {
        console.error("Chat Error:", error);
        if (shouldStream) {
            res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
            res.end();
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No audio file uploaded" });

        const transcription = await getOpenAIClient().audio.transcriptions.create({
            file: new File([req.file.buffer], "recording.webm", { type: "audio/webm" }),
            model: "distil-whisper-large-v3-en",
        });

        res.json({ text: transcription.text });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/title", async (req, res) => {
    try {
        const { content, chat_id } = req.body;
        const completion = await getOpenAIClient().chat.completions.create({
            model: "llama-3.1-8b-instant",
            messages: [
                { role: "system", content: "Role: Professional chat titler. Return ONLY a 1-5 word title in Title Case." },
                { role: "user", content: content }
            ],
            max_tokens: 25,
            temperature: 0.3
        });
        let title = completion.choices[0].message.content.trim().replace(/^["']|["']$/g, '').replace(/\.+$/, '');
        if (chat_id && supabase) await supabase.from('chats').update({ title }).eq('id', chat_id);
        res.json({ title });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/api/chats", async (req, res) => {
    if (!supabase) return res.status(503).json({ error: "Supabase not configured" });
    const { data, error } = await supabase.from('chats').select('*').order('updated_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.get("/api/chats/:id/messages", async (req, res) => {
    if (!supabase) return res.status(503).json({ error: "Supabase not configured" });
    const { data, error } = await supabase.from('messages').select('*').eq('chat_id', req.params.id).order('created_at', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post("/api/chats", async (req, res) => {
    if (!supabase) return res.status(503).json({ error: "Supabase not configured" });
    const { title, model, system_prompt, temperature, max_tokens } = req.body;
    const { data, error } = await supabase.from('chats').insert([{ title: title || "New Chat", model, system_prompt, temperature, max_tokens }]).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post("/api/messages", async (req, res) => {
    if (!supabase) return res.status(503).json({ error: "Supabase not configured" });
    const { chat_id, role, content, image_url } = req.body;
    const { data, error } = await supabase.from('messages').insert([{ chat_id, role, content, image_url }]).select().single();
    if (error) return res.status(500).json({ error: error.message });
    await supabase.from('chats').update({ updated_at: new Date() }).eq('id', chat_id);
    res.json(data);
});

app.delete("/api/chats/:id", async (req, res) => {
    if (!supabase) return res.status(503).json({ error: "Supabase not configured" });
    const { error } = await supabase.from('chats').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

app.get("/api/suggestions", async (req, res) => {
    try {
        const completion = await getOpenAIClient().chat.completions.create({
            model: "llama-3.1-8b-instant",
            messages: [{ role: "system", content: "Generate 4 diverse, short prompt suggestions. Return JSON: {\"suggestions\": [{\"title\": \"Title\", \"text\": \"Prompt text\"}]}" }],
            response_format: { type: "json_object" }
        });
        const data = JSON.parse(completion.choices[0].message.content);
        res.json(data.suggestions || data);
    } catch (error) {
        res.json([
            { title: "Explain concepts", text: "Explain quantum computing like I'm five" },
            { title: "Write code", text: "Write a Python script to scrape a website" }
        ]);
    }
});

// Export the handler for Netlify
export const handler = serverless(app);
