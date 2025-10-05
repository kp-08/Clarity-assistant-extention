# backend/app.py - Clarity Assistant backend (Cerebras wrapper)
from flask import Flask, request, jsonify
from flask_cors import CORS
import os, requests, json, time, re, logging
# load .env automatically (if present)
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))


app = Flask(__name__)
CORS(app)

CEREBRAS_ENDPOINT = os.getenv('CEREBRAS_ENDPOINT')
CEREBRAS_KEY = os.getenv('CEREBRAS_KEY')
CEREBRAS_MODEL = os.getenv('CEREBRAS_MODEL', '')

log = logging.getLogger('werkzeug')
log.setLevel(logging.INFO)

def call_cerebras_raw(prompt, max_tokens=500):
    if not CEREBRAS_ENDPOINT or not CEREBRAS_KEY:
        raise RuntimeError('Cerebras credentials not configured (see .env)')
    headers = {'Authorization': f'Bearer {CEREBRAS_KEY}', 'Content-Type': 'application/json'}
    payload = {'model': CEREBRAS_MODEL, 'messages': [{'role': 'user', 'content': prompt}], 'max_tokens': max_tokens}
    resp = requests.post(CEREBRAS_ENDPOINT, json=payload, headers=headers, timeout=60)
    try:
        resp.raise_for_status()
    except requests.HTTPError as e:
        raise RuntimeError(f'HTTP {resp.status_code}: {resp.text}') from e
    return resp.json()

def extract_text_from_response(data):
    if isinstance(data, dict) and 'choices' in data and isinstance(data['choices'], list) and len(data['choices'])>0:
        first = data['choices'][0]
        if 'message' in first:
            msg = first['message']
            if isinstance(msg, dict) and 'content' in msg:
                return msg['content']
            if isinstance(msg, str):
                m = re.search(r'content=(.*?)(?:;\s*role=|\}$)', msg)
                if m:
                    extracted = m.group(1).strip()
                    if (extracted.startswith('"') and extracted.endswith('"')) or (extracted.startswith("'") and extracted.endswith("'")):
                        extracted = extracted[1:-1]
                    return extracted
                return msg
        if 'text' in first:
            return first['text']

    for k in ('output','result','generated_text','text'):
        if isinstance(data, dict) and k in data:
            v = data[k]
            if isinstance(v, list):
                pieces = []
                for item in v:
                    if isinstance(item, dict) and 'content' in item:
                        pieces.append(item['content'])
                    elif isinstance(item, dict) and 'text' in item:
                        pieces.append(item['text'])
                    elif isinstance(item, str):
                        pieces.append(item)
                return ' '.join(pieces).strip()
            else:
                return str(v).strip()

    def find_first_string(obj):
        if isinstance(obj, str):
            return obj
        if isinstance(obj, dict):
            for kk,vv in obj.items():
                fs = find_first_string(vv)
                if fs: return fs
        if isinstance(obj, list):
            for item in obj:
                fs = find_first_string(item)
                if fs: return fs
        return None
    return find_first_string(data) or json.dumps(data)[:1200]

def parse_any_json_from_text(s):
    if not s or not isinstance(s, str):
        return None
    try:
        return json.loads(s)
    except Exception:
        pass
    m = re.search(r'(\{[\s\S]*\})', s)
    if m:
        candidate = m.group(1)
        try:
            return json.loads(candidate)
        except Exception:
            try:
                fixed = candidate.replace("'", '"')
                return json.loads(fixed)
            except Exception:
                return None
    return None

def simple_fallback_summary(text):
    s = re.split(r'(?<=[.!?])\s+', text.strip())
    if len(s) >= 2:
        return ' '.join(s[:2]).strip()
    return text.strip()[:240]

@app.route('/api/explain', methods=['POST'])
def explain():
    body = request.get_json(force=True)
    text = body.get('text','').strip()
    mode = body.get('mode','general')
    context = body.get('context', {})
    action = body.get('action', None)
    followup = body.get('followup', None)
    if not text:
        return jsonify({'error':'no text provided'}), 400

    if action == 'rephrase' or (followup and 'Rephrase' in followup):
        prompt = f"""Do NOT repeat the original text. Rephrase the following content for a layperson in 2 short sentences.
TEXT: {text}
Return only JSON: {{ "rephrase": "..." }}
""" 
    elif action == 'action_list' or (followup and 'Provide a prioritized list' in followup):
        prompt = f"""Do NOT repeat the original text. Provide a prioritized list of 5 concrete next actions the user can take based on the TEXT. 
TEXT: {text}
Return only JSON: {{ "action_list": ["...","..."] }}
""" 
    elif action == 'brainstorm':
        prompt = f"""Do NOT repeat the original text. Brainstorm 5 short ideas the user could try next based on the TEXT.
TEXT: {text}
Return only JSON: {{ "ideas": ["...","..."] }}
""" 
    else:
        ctx_frag = ''
        if context:
            ctx_frag = f"\nPage title: {context.get('title','')}\nURL: {context.get('url','')}\nSurrounding text: {context.get('surrounding','')[:800]}\n"
        prompt = f"""You are Clarity Assistant. Analyse the following TEXT and return a single valid JSON object ONLY and nothing else (do NOT repeat or echo the input).
TEXT: {text}
{ctx_frag}
The JSON object must contain these fields:
- "type": one of ["code","legal","academic","general"]
- "summary": max 2 short sentences (do NOT repeat the original text)
- "implication": one short sentence explaining why it matters
- "actions": an array of action objects, each with {{"title":"...","importance":1-5,"description":"...","cmd": optional string}}
- "followups": array of short follow-up questions the user might ask
- "entities": array of extracted entities like people, dates, amounts (each {{"text":"", "label":""}})
- "confidence": a number 0-1 indicating confidence
Return only the JSON object."""

    start = time.time()
    try:
        raw = call_cerebras_raw(prompt)
        model_text = extract_text_from_response(raw)
        parsed = parse_any_json_from_text(model_text)
        if parsed is None:
            if action in ('rephrase','action_list','brainstorm'):
                parsed = {}
                if action == 'rephrase':
                    parsed['rephrase'] = model_text.strip()
                elif action == 'action_list':
                    items = [l.strip('-* \\t') for l in model_text.splitlines() if l.strip()]
                    parsed['action_list'] = items[:10]
                elif action == 'brainstorm':
                    items = [l.strip('-* \\t') for l in model_text.splitlines() if l.strip()]
                    parsed['ideas'] = items[:20]
            else:
                parsed = {
                    'type': mode,
                    'summary': simple_fallback_summary(model_text),
                    'implication': '',
                    'actions': [],
                    'followups': [],
                    'entities': [],
                    'confidence': 0.5
                }
        result = parsed
        result['latency_ms'] = round((time.time() - start) * 1000)
        return jsonify(result)
    except Exception as e:
        app.logger.exception('Model call failed')
        return jsonify({'error': 'model_call_failed', 'trace': str(e), 'summary': simple_fallback_summary(text), 'latency_ms': 0}), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.getenv('PORT',5000)))