"""Preserve grouped tool messages for the pinned Strands Ollama provider.

Strands 1.13 flattens every content block into a separate Ollama message. That
splits parallel assistant tool requests and drops the tool-result name. Keep
the original message grouping and names; inference/streaming still use the
official OllamaModel implementation.
"""
import json

from strands.models.ollama import OllamaModel


class LocalOllamaModel(OllamaModel):
    def _format_request_messages(self, messages, system_prompt=None):
        output = [{'role':'system','content':system_prompt}] if system_prompt else []
        tool_names = {}
        for message in messages:
            text, calls, results = [], [], []
            for block in message['content']:
                if 'text' in block:
                    text.append(block['text'])
                elif 'toolUse' in block:
                    use = block['toolUse']
                    tool_names[use['toolUseId']] = use['name']
                    calls.append({'function':{'name':use['name'],'arguments':use['input']}})
                elif 'toolResult' in block:
                    result=block['toolResult']
                    content='\n'.join(part.get('text',json.dumps(part.get('json'))) for part in result['content'])
                    results.append({'role':'tool','tool_name':tool_names.get(result['toolUseId'],result['toolUseId']), 'content':content})
                else:
                    output.extend(self._format_request_message_contents(message['role'], block))
            if text or calls:
                formatted={'role':message['role'],'content':'\n'.join(text)}
                if calls:
                    formatted['tool_calls']=calls
                output.append(formatted)
            output.extend(results)
        return output
