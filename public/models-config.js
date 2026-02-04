// Model configuration with metadata for power user interface
const MODEL_CONFIG = {
  auto: {
    id: 'auto',
    name: 'Auto',
    description: 'Intelligently selects the best model (Engineered by Parithosh)',
    contextWindow: 'Variable',
    maxTokens: 'Variable',
    provider: 'AI',
    tags: ['smart', 'adaptive'],
    useCase: 'Let AI choose the best model'
  },
  'llama-3.3-70b-versatile': {
    id: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B',
    description: 'High capability with excellent reasoning',
    contextWindow: 128000,
    maxTokens: 32768,
    provider: 'Groq',
    tags: ['powerful', 'reasoning'],
    useCase: 'Complex reasoning, coding'
  },
  'llama-3.1-8b-instant': {
    id: 'llama-3.1-8b-instant',
    name: 'Llama 3.1 8B',
    description: 'Fast and efficient for most everyday tasks',
    contextWindow: 128000,
    maxTokens: 8192,
    provider: 'Groq',
    tags: ['fast', 'general-purpose'],
    useCase: 'General chat, quick responses'
  },
  'llama-3.2-11b-vision-preview': {
    id: 'llama-3.2-11b-vision-preview',
    name: 'Llama 3.2 Vision',
    description: 'Understand and analyze images',
    contextWindow: 128000,
    maxTokens: 8192,
    provider: 'Groq',
    tags: ['vision', 'multimodal'],
    useCase: 'Image analysis, OCR'
  },
  'qwen/qwen3-32b': {
    id: 'qwen/qwen3-32b',
    name: 'Qwen 3 32B',
    description: 'Next-gen reasoning model (Preview)',
    contextWindow: 131072,
    maxTokens: 40960,
    provider: 'Groq',
    tags: ['reasoning', 'new'],
    useCase: 'Advanced logic, coding, math'
  },
  'openai/gpt-oss-120b': {
    id: 'openai/gpt-oss-120b',
    name: 'OpenAI GPT-OSS 120B',
    description: 'Flagship open-weight model with 128k context',
    contextWindow: 131072,
    maxTokens: 65536,
    provider: 'OpenAI',
    tags: ['flagship', 'research'],
    useCase: 'Deep research, long-form writing'
  },
  'openai/gpt-oss-20b': {
    id: 'openai/gpt-oss-20b',
    name: 'OpenAI GPT-OSS 20B',
    description: 'Efficient open-weight model',
    contextWindow: 131072,
    maxTokens: 32768,
    provider: 'OpenAI',
    tags: ['research', 'efficient'],
    useCase: 'General tasks, writing'
  },
  'groq/compound': {
    id: 'groq/compound',
    name: 'Groq Compound',
    description: 'Agentic system with web search & tools',
    contextWindow: 131072,
    maxTokens: 8192,
    provider: 'Groq',
    tags: ['agentic', 'tools'],
    useCase: 'Real-time data, tool use'
  },
  'groq/compound-mini': {
    id: 'groq/compound-mini',
    name: 'Groq Compound Mini',
    description: 'Efficient agentic system',
    contextWindow: 131072,
    maxTokens: 8192,
    provider: 'Groq',
    tags: ['agentic', 'efficient', 'mini'],
    useCase: 'Fast tool use, simple tasks'
  },
  'moonshotai/kimi-k2-instruct-0905': {
    id: 'moonshotai/kimi-k2-instruct-0905',
    name: 'Kimi K2 Instruct',
    description: 'Medium context model from Moonshot AI',
    contextWindow: 262144,
    maxTokens: 16384,
    provider: 'Moonshot',
    tags: ['preview', 'long-context'],
    useCase: 'Long context analysis'
  },
  'meta-llama/llama-4-maverick-17b-128e-instruct': {
    id: 'meta-llama/llama-4-maverick-17b-128e-instruct',
    name: 'Llama 4 Maverick 17B',
    description: 'High performance preview model',
    contextWindow: 131072,
    maxTokens: 8192,
    provider: 'Meta',
    tags: ['preview', 'llama4'],
    useCase: 'Complex evaluation'
  },
  'meta-llama/llama-4-scout-17b-16e-instruct': {
    id: 'meta-llama/llama-4-scout-17b-16e-instruct',
    name: 'Llama 4 Scout 17B',
    description: 'Fast preview model',
    contextWindow: 131072,
    maxTokens: 8192,
    provider: 'Meta',
    tags: ['preview', 'llama4'],
    useCase: 'Rapid prototyping'
  },

};

// Model categories for UI organization
const MODEL_CATEGORIES = [
  { name: 'Smart Selection', models: ['auto'] },
  { name: 'Deep Reasoning', models: ['qwen/qwen3-32b'] },
  { name: 'Agentic & Research', models: ['groq/compound', 'groq/compound-mini', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'] },
  { name: 'New Frontiers (Preview)', models: ['meta-llama/llama-4-maverick-17b-128e-instruct', 'meta-llama/llama-4-scout-17b-16e-instruct', 'moonshotai/kimi-k2-instruct-0905'] },
  { name: 'Powerful Versatile', models: ['llama-3.3-70b-versatile'] },
  { name: 'Multimodal', models: ['llama-3.2-11b-vision-preview'] },
  { name: 'Fast & Efficient', models: ['llama-3.1-8b-instant'] }
];

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MODEL_CONFIG, MODEL_CATEGORIES };
}
