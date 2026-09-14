"""Provider identity and readiness; never substitute a scripted model for an LLM."""
import os

import httpx
from fastapi import HTTPException


def configured_mode():
    value = os.getenv('AGENT_MODE', 'ollama')
    if value not in ('demo', 'bedrock', 'ollama'):
        raise HTTPException(503, 'AGENT_MODE must be ollama, bedrock, or demo')
    return value


def identity(mode=None):
    mode = mode or configured_mode()
    model = {'ollama': os.getenv('OLLAMA_MODEL', 'qwen3:4b-instruct'),
             'bedrock': os.getenv('BEDROCK_MODEL_ID', 'us.anthropic.claude-sonnet-4-20250514-v1:0'),
             'demo': 'secondserve-scripted-demo'}[mode]
    return {'mode': mode, 'model_id': model, 'llm': mode != 'demo',
            'provider': {'ollama':'Local LLM · Ollama', 'bedrock':'Amazon Bedrock', 'demo':'Scripted demo'}[mode]}


def readiness():
    info = identity()
    if info['mode'] != 'ollama':
        return info | {'ready': True, 'status': 'configured', 'detail': 'Bedrock access is checked when a run starts.' if info['llm'] else 'Scripted test provider. No LLM inference.'}
    try:
        response = httpx.get(os.getenv('OLLAMA_HOST', 'http://localhost:11434').rstrip('/') + '/api/tags', timeout=3)
        response.raise_for_status()
        installed = any(m.get('name') == info['model_id'] or m.get('model') == info['model_id'] for m in response.json()['models'])
        return info | {'ready': installed, 'status': 'ready' if installed else 'model_missing',
                       'detail': 'Local model installed. Ready for inference.' if installed else 'The local model is not installed yet. First startup downloads it; check docker compose logs model-init for progress or errors.'}
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        return info | {'ready': False, 'status': 'unavailable', 'detail': 'Cannot reach the local model server. Start the Ollama service with Docker Compose.'}
