
import dotenv from 'dotenv';
import OpenAI from "openai";
dotenv.config();

const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1"
});

async function testGen() {
    console.log("Testing Model: openai/gpt-oss-120b");
    try {
        const stream = await client.chat.completions.create({
            model: 'openai/gpt-oss-120b',
            messages: [{ role: 'user', content: 'Say hello' }],
            stream: true,
        });
        console.log("✅ Stream started...");
        for await (const chunk of stream) {
            process.stdout.write(chunk.choices[0]?.delta?.content || "");
        }
        console.log("\n✅ Stream finished successfully.");
    } catch (e) {
        console.log("❌ Model Error:", e.status, e.message);
        console.log("Fallback testing: llama-3.3-70b-versatile");
        const stream2 = await client.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: 'Say hello' }],
            stream: false,
        });
        console.log("✅ Fallback Success:", stream2.choices[0].message.content);
    }
}

testGen();
