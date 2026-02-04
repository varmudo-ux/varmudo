
import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = 'http://localhost:3000';

async function testBackend() {
    console.log("Testing Backend Connection...");
    try {
        const res = await fetch(`${BASE_URL}/api/chats`);
        if (res.ok) {
            const data = await res.json();
            console.log("✅ Success! Fetched chats:", data.length);
            // console.log(data);
        } else {
            console.log("❌ Error fetching chats:", res.status, res.statusText);
            const text = await res.text();
            console.log("Response body:", text);
        }
    } catch (e) {
        console.log("❌ Network/Server Error:", e.message);
    }
}

testBackend();
