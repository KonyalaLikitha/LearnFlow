import os, json, re, tempfile
from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
from pypdf import PdfReader

app = Flask(__name__)
CORS(app)

# ── Config ────────────────────────────────────────────────────────────────────
# Get your free key at: https://openrouter.ai/keys
OPENROUTER_API_KEY = "YOUR_API_KEY_HERE"

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL          = "openai/gpt-3.5-turbo"

# ── Helpers ───────────────────────────────────────────────────────────────────
def chunk_text(text: str, max_chars: int = 3000) -> str:
    return text[:max_chars].strip()


def call_openrouter(prompt: str) -> str:
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type":  "application/json",
    }
    payload = {
        "model":           MODEL,
        "messages":        [{"role": "user", "content": prompt}],
        "response_format": {"type": "json_object"},
    }
    resp = requests.post(OPENROUTER_URL, headers=headers, json=payload, timeout=60)
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


def generate_learning_output(text: str) -> dict:
    context = chunk_text(text)
    prompt  = f"""You are an intelligent study assistant.

From the given academic text generate:
1. Summary (5 lines, simple explanation)
2. Key Concepts (important terms with short definitions)
3. Flashcards (exactly 5 Q&A pairs for revision)

Return ONLY valid JSON in this exact format:
{{
  "summary": "...",
  "concepts": [
    {{"term": "...", "definition": "..."}}
  ],
  "flashcards": [
    {{"question": "...", "answer": "..."}}
  ]
}}

Text:
{context}"""

    raw = call_openrouter(prompt).strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    return json.loads(raw)


def extract_pdf_text(file_storage) -> str:
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        file_storage.save(tmp.name)
        reader = PdfReader(tmp.name)
        return "\n".join(page.extract_text() or "" for page in reader.pages)


# ── Routes ────────────────────────────────────────────────────────────────────
@app.route("/analyze", methods=["POST"])
def analyze():
    try:
        if request.content_type and "multipart/form-data" in request.content_type:
            pdf_file = request.files.get("file")
            if not pdf_file:
                return jsonify({"error": "No file provided"}), 400
            text = extract_pdf_text(pdf_file)
        else:
            data = request.get_json(force=True)
            text = (data or {}).get("text", "").strip()

        if not text:
            return jsonify({"error": "No text provided"}), 400

        result = generate_learning_output(text)
        return jsonify({
            "summary":    result.get("summary", ""),
            "concepts":   result.get("concepts", []),
            "flashcards": result.get("flashcards", []),
        })

    except json.JSONDecodeError:
        return jsonify({"error": "AI returned invalid JSON. Please try again."}), 500
    except requests.HTTPError as e:
        return jsonify({"error": f"OpenRouter error: {e.response.text}"}), 502
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
