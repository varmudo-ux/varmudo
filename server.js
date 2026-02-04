import express from "express";
import OpenAI from "openai";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ dest: "uploads/" });

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname, "public")));

const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1"
});

const POLLINATIONS_API_KEY = process.env.POLLINATIONS_API_KEY;

// Auto model selection logic for server-side
function selectOptimalModelServer(query) {
    const query_lower = query.toLowerCase();
    const query_length = query.length;

    // Detect query type
    const isCoding = /\b(code|program|debug|function|class|api|javascript|python|java|cpp|rust|go|sql|html|css|react|node|express|algorithm|git|github|bug|error|exception|variable|async|await|database|docker|kubernetes|testing|optimization|refactor|design pattern|architecture|microservices|json|xml|yaml|csv|regex)\b/i.test(query_lower);

    const isMath = /\b(math|calculate|equation|formula|algebra|calculus|geometry|statistics|probability|matrix|vector|solve|theorem|proof|graph|data analysis|machine learning|neural network|tensorflow|pytorch|pandas|numpy)\b/i.test(query_lower);

    const isWriting = /\b(write|essay|article|blog|story|fiction|novel|poem|grammar|spelling|edit|proofread|draft|outline|creative|literature|thesis|dissertation|academic|translate|language)\b/i.test(query_lower);

    const isLongContext = query_length > 8000 || /\b(document|analyze|summary|extract|find in|search through|large file|entire text|full content)\b/i.test(query_lower);

    // Selection logic - Optimized for latest Groq models (2026)
    if (isLongContext || isWriting) return 'openai/gpt-oss-120b';
    if (isMath || isCoding) return 'qwen/qwen3-32b';

    // Default to fast model for very short queries
    if (query_length < 200) return 'llama-3.1-8b-instant';

    // Default to versatile powerful model
    return 'llama-3.3-70b-versatile';
}


app.post("/api/generate-image", async (req, res) => {
    try {
        const { prompt, chat_id, model = "flux", enhance = true } = req.body;
        if (!prompt) return res.status(400).json({ error: "Prompt is required" });

        const seed = Math.floor(Math.random() * 2147483647);
        // Map local model names to Pollinations if needed
        let targetModel = model;
        if (model === "bytedance-seed/seedream-4.5") targetModel = "seedream";

        const url = new URL(`https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}`);
        url.searchParams.append("model", targetModel);
        url.searchParams.append("seed", seed.toString());
        url.searchParams.append("enhance", enhance.toString());
        url.searchParams.append("nologo", "true");

        if (POLLINATIONS_API_KEY) {
            url.searchParams.append("key", POLLINATIONS_API_KEY);
        }

        const imageUrl = url.toString();
        res.json({ imageUrl });
    } catch (error) {
        console.error("Image Generation Error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post("/chat", async (req, res) => {
    const { messages, model, temperature, max_tokens } = req.body;

    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
    });

    try {
        let modelId = model || "llama-3.3-70b-versatile";

        // Fallback for decommissioned models
        // Extensive fallback for decommissioned or invalid models
        if (!modelId || modelId.includes('mixtral') || modelId.includes('gemma-7b') || modelId.includes('llama3-')) {
            console.log(`Swapping invalid/decommissioned model '${modelId}' for 'llama-3.3-70b-versatile'`);
            modelId = 'llama-3.3-70b-versatile';
        }

        // Check for images in messages
        const hasImages = messages.some(m =>
            Array.isArray(m.content) && m.content.some(c => c.type === 'image_url') ||
            (m.image_url)
        );

        if (hasImages) {
            modelId = "llama-3.2-11b-vision-preview";
        } else if (modelId === 'auto' && messages && messages.length > 0) {
            const lastUserMessage = messages.slice().reverse().find(m => m.role === 'user');
            if (lastUserMessage) {
                const query = typeof lastUserMessage.content === 'string'
                    ? lastUserMessage.content
                    : (Array.isArray(lastUserMessage.content) ? lastUserMessage.content.map(c => c.text || '').join(' ') : '');
                modelId = selectOptimalModelServer(query);
            } else {
                modelId = "llama-3.3-70b-versatile";
            }
        }

        // Final safety check for model compatibility
        if (modelId.includes('/') && !modelId.includes('qwen') && !modelId.includes('openai') && !modelId.includes('groq')) {
            modelId = hasImages ? "llama-3.2-11b-vision-preview" : "llama-3.3-70b-versatile";
        }


        // Validate and normalize all messages
        const normalizedMessages = messages.map((m, idx) => {
            // Convert frontend image_url fields to OpenAI format if needed
            if (m.image_url && !Array.isArray(m.content)) {
                return {
                    role: m.role,
                    content: [
                        { type: "text", text: m.content || "" },
                        { type: "image_url", image_url: { url: m.image_url } }
                    ]
                };
            }

            // If content is an array, ensure all items have valid types
            if (Array.isArray(m.content)) {
                const validContent = m.content.filter(item =>
                    item && (item.type === 'text' || item.type === 'image_url')
                );
                // If no valid items or only empty items, convert to string
                if (validContent.length === 0) {
                    return { role: m.role, content: "" };
                }
                return { role: m.role, content: validContent };
            }

            // Ensure content is a string (not null, undefined, or object)
            if (typeof m.content !== 'string') {
                console.log(`[WARNING] Message ${idx} has non-string content:`, typeof m.content, m.content);
                return { role: m.role, content: String(m.content || "") };
            }

            return { role: m.role, content: m.content };
        });

        console.log('[DEBUG] Sending messages to API:', JSON.stringify(normalizedMessages, null, 2));

        const stream = await client.chat.completions.create({
            model: modelId,
            messages: normalizedMessages,
            stream: true,
            temperature: parseFloat(temperature) || 0.7,
            max_tokens: Math.min(parseInt(max_tokens) || 4096, 4096),
        });

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
                try {
                    res.write(`data: ${JSON.stringify({ content })}\n\n`);
                } catch (e) {
                    console.error("Write error:", e);
                    break;
                }
            }
        }
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
    } catch (error) {
        console.error("Chat Error:", error);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
});

app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
    let tempPath = null;
    try {
        if (!req.file) return res.status(400).json({ error: "No audio file uploaded" });

        // Groq/OpenAI API often needs a file extension to correctly identify the format
        const ext = path.extname(req.file.originalname) || '.webm';
        tempPath = req.file.path + ext;
        fs.renameSync(req.file.path, tempPath);

        const transcription = await client.audio.transcriptions.create({
            file: fs.createReadStream(tempPath),
            model: "distil-whisper-large-v3-en",
        });

        fs.unlinkSync(tempPath);
        res.json({ text: transcription.text });
    } catch (error) {
        console.error("Transcription Error:", error);
        if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        else if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: error.message });
    }
});

// TTS Endpoint (Using a placeholder logic for now as Groq is STT only)
app.post("/api/speech", async (req, res) => {
    try {
        const { text, voice } = req.body;
        // In a real scenario with PlayAI or similar:
        // const mp3 = await getPlayAISpeech(text, voice);
        // res.set("Content-Type", "audio/mpeg");
        // res.send(mp3);

        // For now, return a 501 or a mocked error so the frontend knows to fallback or handled
        res.status(501).json({ error: "TTS not yet implemented on server. Using browser speech as fallback recommended." });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/title", async (req, res) => {
    try {
        const { content, chat_id } = req.body;
        const completion = await client.chat.completions.create({
            model: "llama-3.1-8b-instant",
            messages: [
                {
                    role: "system",
                    content: `Role: You are a professional chat-thread titler.

Task: Analyze the User Message provided and generate a concise, descriptive title that captures the core intent.

Constraints:
- Length: Maximum of 5 words.
- Style: Use "Title Case" (e.g., Understanding Quantum Physics).
- Format: Return ONLY the plain text of the title. No quotes, no periods, and no introductory filler.
- Fallback: If the user message is a greeting or too short to summarize, return "New Conversation".
- Context: If the message is about a specific technical concept, prioritize that concept in the title.`
                },
                { role: "user", content: content }
            ],
            max_tokens: 25,
            temperature: 0.3
        });
        let title = completion.choices[0].message.content.trim();

        // Clean up any quotes or periods that might slip through
        title = title.replace(/^["']|["']$/g, '').replace(/\.+$/, '');

        if (chat_id && supabase) {
            await supabase.from('chats').update({ title }).eq('id', chat_id);
        }

        res.json({ title });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete("/api/chats", async (req, res) => {
    if (!supabase) return res.status(503).json({ error: "Supabase not configured" });
    const { error } = await supabase.from('chats').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
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

app.patch("/api/chats/:id/settings", async (req, res) => {
    if (!supabase) return res.status(503).json({ error: "Supabase not configured" });
    const { model, system_prompt, temperature, max_tokens } = req.body;
    const updates = {};
    if (model !== undefined) updates.model = model;
    if (system_prompt !== undefined) updates.system_prompt = system_prompt;
    if (temperature !== undefined) updates.temperature = temperature;
    if (max_tokens !== undefined) updates.max_tokens = max_tokens;

    const { error } = await supabase.from('chats').update(updates).eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

app.get("/api/suggestions", async (req, res) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
        const completion = await client.chat.completions.create({
            model: "llama-3.1-8b-instant",
            messages: [{ role: "system", content: "Generate 4 diverse, short prompt suggestions. Return ONLY JSON: {\"suggestions\": [{\"title\": \"Title\", \"text\": \"Prompt text\"}]}" }],
            response_format: { type: "json_object" }
        }, { signal: controller.signal });
        clearTimeout(timeoutId);
        const data = JSON.parse(completion.choices[0].message.content);
        res.json(data.suggestions || data);
    } catch (error) {
        clearTimeout(timeoutId);
        res.json([
            { title: "Explain concepts", text: "Explain quantum computing like I'm five" },
            { title: "Write code", text: "Write a Python script to scrape a website" },
            { title: "Draft emails", text: "Help me write a professional email to my boss" },
            { title: "Get advice", text: "What are some healthy dinner ideas for a week?" }
        ]);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
});
