# ─────────────────────────────────────────
#  Legacy — server.py
#  Pipeline: Audio|Testo|Immagine → Supabase → Claude Vision → TTS → Frontend
#  + Chat Sessions multiple per utente
#  + Upload immagini nel bucket Supabase "media"
#  + ElevenLabs voice cloning
#
#  Dipendenze:
#    pip install fastapi uvicorn python-multipart openai anthropic python-dotenv supabase requests
#
#  SQL richiesto PRIMA di avviare:
#    alter table memories add column if not exists image_url text;
#    alter table chat_sessions add column if not exists voice_id text;
#
#  .env richiede:
#    OPENAI_API_KEY, ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_KEY
#    ELEVENLABS_API_KEY  (opzionale — se assente si usa solo OpenAI TTS)
#
#  Avvio:
#    uvicorn server:app --reload --port 8000 --timeout-keep-alive 120
# ─────────────────────────────────────────

import os
import re
import base64
import tempfile
import time
import uuid
import requests
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import openai
import anthropic
from supabase import create_client, Client

# ── Carica .env ──────────────────────────────────────────────────────────────
load_dotenv()

OPENAI_API_KEY     = os.getenv("OPENAI_API_KEY")
ANTHROPIC_API_KEY  = os.getenv("ANTHROPIC_API_KEY")
SUPABASE_URL       = os.getenv("SUPABASE_URL")
SUPABASE_KEY       = os.getenv("SUPABASE_KEY")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")  # opzionale

for name, val in [
    ("OPENAI_API_KEY",    OPENAI_API_KEY),
    ("ANTHROPIC_API_KEY", ANTHROPIC_API_KEY),
    ("SUPABASE_URL",      SUPABASE_URL),
    ("SUPABASE_KEY",      SUPABASE_KEY),
]:
    if not val:
        raise RuntimeError(f"{name} mancante nel file .env")

if ELEVENLABS_API_KEY:
    print("[Legacy] ElevenLabs: API key trovata — voice cloning disponibile")
else:
    print("[Legacy] ElevenLabs: API key non trovata — si usa solo OpenAI TTS")

# ── Client ufficiali ─────────────────────────────────────────────────────────
openai_client    = openai.OpenAI(api_key=OPENAI_API_KEY)
anthropic_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
# ── Client Supabase ───────────────────────────────────────────────────────────
# Il backend usa la service_role key per bypassare RLS su tutte le tabelle.
# La anon key è riservata al frontend (client-side).
_service_key = os.getenv("SUPABASE_SERVICE_KEY")

if _service_key:
    print("[Legacy] Supabase: uso service_role key (RLS bypass)")
    supabase: Client = create_client(SUPABASE_URL, _service_key)
else:
    print("[Legacy] ⚠️  SUPABASE_SERVICE_KEY mancante — uso anon key (RLS attivo potrebbe bloccare le query)")
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Client storage: usa sempre service_role se disponibile (upload media)
supabase_storage: Client = supabase

# ── Configurazione TTS OpenAI (fallback) ─────────────────────────────────────
TTS_MODEL    = "gpt-4o-mini-tts"
TTS_VOICE    = "shimmer"
VALID_VOICES = {"shimmer", "onyx", "nova", "alloy", "echo", "fable"}

# ── Configurazione ElevenLabs ─────────────────────────────────────────────────
ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1"
ELEVENLABS_MODEL_ID = "eleven_multilingual_v2"

# ── Tipi MIME immagine accettati ──────────────────────────────────────────────
ALLOWED_IMAGE_TYPES = {
    "image/jpeg": "jpg",
    "image/jpg":  "jpg",
    "image/png":  "png",
    "image/gif":  "gif",
    "image/webp": "webp",
}

# ════════════════════════════════════════
#  SYSTEM PROMPTS
# ════════════════════════════════════════

def build_system_prompt(
    protagonist_name:   str = "il protagonista",
    protagonist_gender: str = "Neutro",
    biography_tone:     str = "Empatico e nostalgico",
) -> str:
    gender_map = {
        "M":      "maschile. Usa pronomi e aggettivi al maschile (lui, suo, ecc.).",
        "F":      "femminile. Usa pronomi e aggettivi al femminile (lei, sua, ecc.).",
        "Neutro": "neutro o non specificato. Usa forme inclusive quando possibile.",
    }
    gender_instruction = gender_map.get(protagonist_gender, gender_map["Neutro"])
    return (
        f"Sei un biografo professionista e stai intervistando {protagonist_name}. "
        f"Il genere del protagonista è {gender_instruction} "
        f"Il tono dell'intervista deve essere: {biography_tone}. "
        f"Fai una sola domanda alla volta. "
        f"Se l'utente condivide un'immagine, commentala con calore e usa ciò che vedi "
        f"per porre una domanda più specifica e personale sul ricordo immortalato. "
        f"Valida le emozioni di {protagonist_name}, sii empatico e colloquiale, "
        f"e scava nei dettagli dei suoi ricordi. "
        f"Sii conciso nella risposta."
    )

BOOK_SYSTEM_PROMPT = (
    "Sei un biografo ed editor professionista. "
    "Il tuo compito è scrivere o aggiornare una biografia romanzata in prima persona. "
    "\n\n"
    "REGOLE DI FORMATTAZIONE — rispettale sempre:\n"
    "- Usa <h1> per il titolo principale dell'opera (solo uno, all'inizio).\n"
    "- Usa <h2> per i titoli dei capitoli successivi.\n"
    "- Usa <p> per tutti i paragrafi narrativi.\n"
    "- Se nella cronologia ci sono URL di immagini, inseriscile nel libro come:\n"
    "  <figure><img src='URL' style='max-width:100%;border-radius:12px;margin:1rem 0'>"
    "<figcaption style='font-size:0.75rem;color:#a78bfa;text-align:center'>Ricordo</figcaption></figure>\n"
    "  Posizionali in modo fluido rispetto al testo, vicino al capitolo che descrive quel momento.\n"
    "- Restituisci SOLO tag HTML puri: niente DOCTYPE, niente <html>, <head>, <body>.\n"
    "- Non aggiungere mai backtick, markdown, commenti o testo fuori dai tag.\n"
    "\n"
    "REGOLE EDITORIALI — seguile con precisione:\n"
    "1. Se ti viene fornito un 'Libro Attuale': NON riscriverlo da zero. "
    "Mantieni il titolo (<h1>) e tutto il testo esistente invariato.\n"
    "2. Se la cronologia chat contiene nuovi ricordi non ancora presenti nel libro: "
    "aggiungili come un nuovo capitolo fluido alla fine, con un <h2> appropriato.\n"
    "3. ECCEZIONE — Correzioni esplicite: se nella cronologia chat il protagonista "
    "ha corretto un dettaglio già scritto nel libro, correggilo armoniosamente "
    "e restituisci l'intero libro aggiornato.\n"
    "4. Se NON esiste un 'Libro Attuale': scrivi la biografia dall'inizio. "
    "Usa un tono caldo, evocativo e narrativo."
)

# ── App FastAPI ───────────────────────────────────────────────────────────────
app = FastAPI(title="Legacy API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://legacy-app-tau.vercel.app",
        "https://legacy-backend-wtx4.onrender.com",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ════════════════════════════════════════
#  HELPERS SUPABASE
# ════════════════════════════════════════

def db_insert_message(session_id: str, role: str, content: str, image_url: str | None = None, user_id: str | None = None) -> None:
    payload: dict = {"session_id": session_id, "role": role, "content": content}
    if image_url:
        payload["image_url"] = image_url
    if user_id:
        payload["user_id"] = user_id
    result = supabase.table("memories").insert(payload).execute()
    print(f"[Supabase INSERT] role={role!r}, image={'sì' if image_url else 'no'} → {len(result.data)} righe")


def db_load_history_with_images(session_id: str) -> list[dict]:
    result = (
        supabase.table("memories")
        .select("role, content, image_url, created_at")
        .eq("session_id", session_id)
        .order("created_at", desc=False)
        .execute()
    )
    return [
        {"role": r["role"], "content": r["content"], "image_url": r.get("image_url")}
        for r in result.data
    ]


def db_load_history(session_id: str) -> list[dict]:
    rows = db_load_history_with_images(session_id)
    return [{"role": r["role"], "content": r["content"]} for r in rows]


def get_user_subscription(user_id: str) -> str:
    """Legge subscription_level dalla tabella profiles. Default: 'free'."""
    try:
        result = (
            supabase.table("profiles")
            .select("subscription_level")
            .eq("id", user_id)
            .execute()
        )
        if result.data and result.data[0].get("subscription_level"):
            return result.data[0]["subscription_level"]
    except Exception as e:
        print(f"[Legacy] get_user_subscription warning: {e}")
    return "free"


def get_user_id_from_session(session_id: str) -> str | None:
    """Recupera lo user_id dalla chat_sessions dato un session_id."""
    try:
        result = (
            supabase.table("chat_sessions")
            .select("user_id")
            .eq("id", session_id)
            .execute()
        )
        if result.data:
            return result.data[0].get("user_id")
    except Exception as e:
        print(f"[Legacy] get_user_id_from_session warning: {e}")
    return None


def db_get_story_type(session_id: str) -> str:
    """Recupera lo story_type della sessione. Default: 'personale'."""
    try:
        result = (
            supabase.table("chat_sessions")
            .select("story_type")
            .eq("id", session_id)
            .execute()
        )
        if result.data and result.data[0].get("story_type"):
            return result.data[0]["story_type"]
    except Exception as e:
        print(f"[Legacy] Avviso: impossibile leggere story_type — {e}")
    return "personale"


def db_get_voice_id(session_id: str) -> str | None:
    """Recupera il voice_id ElevenLabs associato alla sessione, se esiste."""
    try:
        result = (
            supabase.table("chat_sessions")
            .select("voice_id")
            .eq("id", session_id)
            .execute()
        )
        if result.data and result.data[0].get("voice_id"):
            return result.data[0]["voice_id"]
    except Exception as e:
        print(f"[Legacy] Avviso: impossibile leggere voice_id — {e}")
    return None


IMAGE_LIMITS = {"free": 2, "premium": 15, "ultra": 50}
MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB per tutti i piani

def count_session_images(session_id: str) -> int:
    """Conta le immagini già caricate per questa sessione."""
    try:
        result = (
            supabase.table("memories")
            .select("id", count="exact")
            .eq("session_id", session_id)
            .not_.is_("image_url", "null")
            .execute()
        )
        return result.count or 0
    except Exception as e:
        print(f"[Legacy] count_session_images warning: {e}")
        return 0


def upload_image_to_storage(image_bytes: bytes, content_type: str, session_id: str) -> str:
    ext      = ALLOWED_IMAGE_TYPES.get(content_type, "jpg")
    filename = f"{session_id}/{uuid.uuid4().hex}.{ext}"
    supabase_storage.storage.from_("media").upload(
        path=filename,
        file=image_bytes,
        file_options={"content-type": content_type},
    )
    public_url = supabase_storage.storage.from_("media").get_public_url(filename)
    print(f"[Legacy] Immagine caricata → {public_url}")
    return public_url


# ════════════════════════════════════════
#  HELPERS TTS
# ════════════════════════════════════════

STORY_TYPE_DIRECTIVES = {
    "personale": (
        "Sei un biografo empatico e introspettivo. "
        "Fai domande sulla crescita personale, le sfide superate e i sogni del protagonista. "
        "Usa un tono caldo e motivante."
    ),
    "coppia": (
        "Sei un narratore romantico e complice. "
        "Stai raccogliendo le memorie di una storia d'amore. "
        "Fai domande su come si sono conosciuti, i viaggi insieme, i momenti divertenti "
        "e le sfide di coppia. Usa un tono dolce. "
        "Nel libro finale, usa spesso il 'Noi' o intreccia le due voci."
    ),
    "famiglia": (
        "Sei uno storico familiare rispettoso e nostalgico. "
        "Il tuo obiettivo è tramandare un'eredità per le generazioni future. "
        "Fai domande su come era il mondo un tempo, sulle tradizioni di famiglia, "
        "i nonni, i sacrifici e le lezioni di vita. "
        "Usa un tono profondo e celebrativo."
    ),
}

def build_story_type_directive(session_id: str) -> str:
    """Recupera lo story_type e restituisce la direttiva narrativa corrispondente."""
    story_type = db_get_story_type(session_id)
    directive  = STORY_TYPE_DIRECTIVES.get(story_type, STORY_TYPE_DIRECTIVES["personale"])
    print(f"[Legacy] story_type: {story_type!r}")
    return directive


def tts_elevenlabs(text: str, voice_id: str) -> bytes:
    """Genera audio con ElevenLabs. Restituisce bytes MP3."""
    url     = f"{ELEVENLABS_BASE_URL}/text-to-speech/{voice_id}"
    headers = {
        "xi-api-key":   ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        "Accept":       "audio/mpeg",
    }
    payload = {
        "text":     text,
        "model_id": ELEVENLABS_MODEL_ID,
        "voice_settings": {
            "stability":         0.5,
            "similarity_boost":  0.85,
            "style":             0.0,
            "use_speaker_boost": True,
        },
    }
    response = requests.post(url, json=payload, headers=headers, timeout=60)
    if response.status_code != 200:
        raise RuntimeError(f"ElevenLabs TTS errore {response.status_code}: {response.text[:200]}")
    return response.content


def tts_openai(text: str, voice: str | None) -> bytes:
    """Genera audio con OpenAI TTS. Restituisce bytes MP3."""
    tts_voice = voice if voice in VALID_VOICES else TTS_VOICE
    response  = openai_client.audio.speech.create(
        model=TTS_MODEL,
        voice=tts_voice,
        input=text,
        response_format="mp3",
    )
    return response.read()


def generate_tts(text: str, session_id: str, voice_setting: str | None = None) -> tuple[bytes, str]:
    """
    Seleziona il TTS migliore:
    1. ElevenLabs con voce clonata (se disponibile per la sessione)
    2. OpenAI TTS (fallback)
    Restituisce (audio_bytes, provider).
    """
    if ELEVENLABS_API_KEY:
        el_voice_id = db_get_voice_id(session_id)
        if el_voice_id:
            try:
                audio_bytes = tts_elevenlabs(text, el_voice_id)
                print(f"[Legacy] TTS ElevenLabs — voice_id: {el_voice_id!r}")
                return audio_bytes, "elevenlabs"
            except Exception as e:
                print(f"[Legacy] ElevenLabs TTS fallito ({e}) — fallback OpenAI")

    audio_bytes = tts_openai(text, voice_setting)
    print(f"[Legacy] TTS OpenAI — voce: {voice_setting or TTS_VOICE!r}")
    return audio_bytes, "openai"


# ════════════════════════════════════════
#  HELPERS CLAUDE VISION
# ════════════════════════════════════════

def build_claude_messages_with_vision(
    history:           list[dict],
    current_user_text: str,
    current_image_url: str | None,
) -> list[dict]:
    messages = []
    history_without_last = history[:-1] if history else []

    for msg in history_without_last:
        role    = msg["role"]
        content = msg["content"]
        img_url = msg.get("image_url")

        if role == "user" and img_url:
            messages.append({
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "url", "url": img_url}},
                    {"type": "text",  "text":   content or "Ho condiviso questa immagine."},
                ],
            })
        else:
            messages.append({"role": role, "content": content})

    if current_image_url:
        messages.append({
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "url", "url": current_image_url}},
                {"type": "text",  "text":   current_user_text or "Ho condiviso questa immagine."},
            ],
        })
    else:
        messages.append({"role": "user", "content": current_user_text})

    return messages


# ════════════════════════════════════════
#  ENDPOINT: SESSIONI
# ════════════════════════════════════════

@app.post("/api/sessions")
async def create_session(
    user_id:    str           = Form(...),
    title:      str           = Form(...),
    story_type: Optional[str] = Form(default=None),
):
    session_id    = f"session_{int(time.time() * 1000)}"
    story_type_val = story_type.strip() if story_type and story_type.strip() else "personale"

    result = supabase.table("chat_sessions").insert({
        "id":         session_id,
        "user_id":    user_id,
        "title":      title,
        "story_type": story_type_val,
    }).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Impossibile creare la sessione.")
    print(f"[Legacy] Sessione creata → {session_id!r} (tipo: {story_type_val!r})")
    return {
        "session_id": session_id,
        "title":      title,
        "story_type": story_type_val,
        "created_at": result.data[0].get("created_at", ""),
    }


@app.get("/api/user/{user_id}")
async def get_user_profile(user_id: str):
    """Restituisce il profilo utente incluso subscription_level."""
    level = get_user_subscription(user_id)
    return {"user_id": user_id, "subscription_level": level}


@app.get("/api/sessions/{user_id}")
async def get_sessions(user_id: str):
    result = (
        supabase.table("chat_sessions")
        .select("id, title, created_at, book_content, voice_id, story_type")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    sessions = [
        {
            "session_id":       r["id"],
            "title":            r["title"],
            "created_at":       r["created_at"],
            "book_content":     r.get("book_content"),
            "has_cloned_voice": bool(r.get("voice_id")),
            "story_type":       r.get("story_type") or "personale",
        }
        for r in result.data
    ]
    return {"sessions": sessions}


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    # Elimina voce clonata da ElevenLabs se presente
    if ELEVENLABS_API_KEY:
        voice_id = db_get_voice_id(session_id)
        if voice_id:
            try:
                requests.delete(
                    f"{ELEVENLABS_BASE_URL}/voices/{voice_id}",
                    headers={"xi-api-key": ELEVENLABS_API_KEY},
                    timeout=15,
                )
                print(f"[Legacy] ElevenLabs: voce {voice_id!r} eliminata")
            except Exception as e:
                print(f"[Legacy] Avviso: impossibile eliminare voce ElevenLabs — {e}")

    supabase.table("memories").delete().eq("session_id", session_id).execute()
    supabase.table("chat_sessions").delete().eq("id", session_id).execute()
    print(f"[Legacy] Sessione eliminata → {session_id!r}")
    return {"success": True}


from pydantic import BaseModel

class RenameSessionRequest(BaseModel):
    title: str

@app.put("/api/sessions/{session_id}/archive")
async def update_archive(session_id: str, request: Request):
    """Salva le modifiche manuali dell'utente al testo del libro."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Body JSON non valido")

    new_content = body.get("new_content", "").strip()
    if not new_content:
        raise HTTPException(status_code=400, detail="Il campo new_content è obbligatorio")

    try:
        result = (
            supabase.table("chat_sessions")
            .update({"book_content": new_content})
            .eq("id", session_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Sessione non trovata")
        return {"ok": True, "session_id": session_id}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Legacy] update_archive error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/sessions/{session_id}")
async def rename_session(session_id: str, body: RenameSessionRequest):
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Il titolo non può essere vuoto.")
    result = (
        supabase.table("chat_sessions")
        .update({"title": title})
        .eq("id", session_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail=f"Sessione '{session_id}' non trovata.")
    print(f"[Legacy] Sessione {session_id!r} rinominata → {title!r}")
    return {"success": True, "new_title": title}


# ════════════════════════════════════════
#  ENDPOINT: CLONAZIONE VOCE (ElevenLabs)
# ════════════════════════════════════════

@app.post("/api/clone_voice")
async def clone_voice(
    session_id:  str        = Form(...),
    sample_file: UploadFile = File(...),
):
    """
    Clona la voce dell'utente tramite ElevenLabs IVC (Instant Voice Cloning).
    - Riceve un file audio campione (consigliati almeno 30 secondi di parlato pulito)
    - Lo invia a ElevenLabs /v1/voices/add
    - Salva il voice_id in chat_sessions.voice_id
    - La voce viene usata da /api/read_archive per generare l'audiolibro

    Restituisce: {"success": true, "voice_id": "..."}
    """
    if not ELEVENLABS_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="ElevenLabs non configurato. Aggiungi ELEVENLABS_API_KEY nel file .env."
        )

    # ── Paywall: solo ultra può clonare la voce ───────────────────────────────
    user_id = get_user_id_from_session(session_id)
    if user_id:
        level = get_user_subscription(user_id)
        if level != "ultra":
            raise HTTPException(
                status_code=403,
                detail="UPGRADE_REQUIRED:ultra:La clonazione vocale è disponibile esclusivamente nel piano Ultra."
            )

    print(f"[Legacy] clone_voice — session: {session_id!r}, file: {sample_file.filename!r}")

    # ── Leggi il file audio ───────────────────────────────────────────────────
    audio_bytes = await sample_file.read()
    if not audio_bytes:
        raise HTTPException(status_code=422, detail="File audio vuoto.")
    if len(audio_bytes) < 10_000:
        raise HTTPException(
            status_code=422,
            detail="File audio troppo corto. Carica almeno 30 secondi di parlato pulito."
        )

    content_type = sample_file.content_type or "audio/mpeg"
    ext_map = {
        "audio/mpeg": "mp3", "audio/mp3": "mp3",
        "audio/wav":  "wav", "audio/wave": "wav",
        "audio/webm": "webm", "audio/ogg": "ogg",
        "audio/m4a":  "m4a", "audio/x-m4a": "m4a",
    }
    ext = ext_map.get(content_type, "mp3")

    # ── Chiama ElevenLabs /v1/voices/add ──────────────────────────────────────
    voice_name = f"Legacy_{session_id[-8:]}"
    try:
        response = requests.post(
            f"{ELEVENLABS_BASE_URL}/voices/add",
            headers={"xi-api-key": ELEVENLABS_API_KEY},
            files=[("files", (f"sample.{ext}", audio_bytes, content_type))],
            data={
                "name":        voice_name,
                "description": f"Voce clonata per sessione Legacy {session_id}",
            },
            timeout=120,
        )
    except requests.exceptions.Timeout:
        raise HTTPException(
            status_code=504,
            detail="ElevenLabs: timeout durante la clonazione. Riprova con un file più corto."
        )
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=502, detail=f"ElevenLabs: errore di rete — {str(e)}")

    if response.status_code not in (200, 201):
        print(f"[Legacy] ElevenLabs clone error {response.status_code}: {response.text[:300]}")
        raise HTTPException(
            status_code=response.status_code,
            detail=f"ElevenLabs errore: {response.text[:300]}"
        )

    voice_id = response.json().get("voice_id")
    if not voice_id:
        raise HTTPException(
            status_code=502,
            detail=f"ElevenLabs non ha restituito un voice_id. Risposta: {response.json()}"
        )

    print(f"[Legacy] Voice cloning riuscito — voice_id: {voice_id!r}")

    # ── Salva voice_id in chat_sessions ───────────────────────────────────────
    try:
        supabase.table("chat_sessions").update({
            "voice_id": voice_id
        }).eq("id", session_id).execute()
        print(f"[Legacy] voice_id salvato per session {session_id!r}")
    except Exception as e:
        print(f"[Legacy] Avviso: impossibile salvare voice_id — {e}")

    return {"success": True, "voice_id": voice_id}


# ════════════════════════════════════════
#  ENDPOINT: CHAT PRINCIPALE
# ════════════════════════════════════════

@app.post("/api/chat")
async def chat_endpoint(
    session_id:          str                  = Form(default="test_session"),
    user_id:             Optional[str]        = Form(default=None),
    audio:               Optional[UploadFile] = File(default=None),
    text_input:          Optional[str]        = Form(default=None),
    image_file:          Optional[UploadFile] = File(default=None),
    protagonist_name:    Optional[str]        = Form(default=None),
    protagonist_gender:  Optional[str]        = Form(default=None),
    biography_tone:      Optional[str]        = Form(default=None),
    voice_setting:       Optional[str]        = Form(default=None),
    ui_language:         Optional[str]        = Form(default=None),
):
    """
    Accetta audio (Whisper STT) o text_input, più un'immagine opzionale.
    TTS: usa ElevenLabs voce clonata se disponibile, altrimenti OpenAI.
    """
    print(f"[Legacy] /api/chat — session_id: {session_id!r}, user_id: {user_id!r}")

    user_text: str      = ""
    image_url: str|None = None

    # ── Audio → Whisper ───────────────────────────────────────────────────────
    if audio and audio.filename:
        content_type = audio.content_type or "audio/webm"
        ext          = content_type.split("/")[-1].split(";")[0].strip() or "webm"
        tmp_path     = Path(tempfile.gettempdir()) / f"legacy_{session_id}.{ext}"
        try:
            audio_bytes = await audio.read()
            if not audio_bytes:
                raise HTTPException(status_code=422, detail="File audio vuoto.")
            tmp_path.write_bytes(audio_bytes)
            with open(tmp_path, "rb") as f:
                transcription = openai_client.audio.transcriptions.create(
                    model="gpt-4o-mini-transcribe",
                    file=f,
                )
            user_text = transcription.text.strip()
            if not user_text:
                raise HTTPException(status_code=422, detail="Audio non comprensibile. Riprova.")
        finally:
            if tmp_path.exists():
                tmp_path.unlink()

    # ── Testo diretto ─────────────────────────────────────────────────────────
    elif text_input and text_input.strip():
        user_text = text_input.strip()

    # ── Upload immagine (opzionale) ───────────────────────────────────────────
    if image_file and image_file.filename:
        img_content_type = image_file.content_type or "image/jpeg"
        if img_content_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(
                status_code=422,
                detail=f"Tipo immagine non supportato: {img_content_type}"
            )
        img_bytes = await image_file.read()
        if not img_bytes:
            raise HTTPException(status_code=422, detail="File immagine vuoto.")

        # ── Controllo dimensione: max 5 MB per tutti i piani ─────────────────
        if len(img_bytes) > MAX_IMAGE_SIZE_BYTES:
            raise HTTPException(
                status_code=413,
                detail="FILE_TOO_LARGE:File troppo grande. Dimensione massima consentita: 5 MB."
            )

        # ── Controllo limite immagini per piano ───────────────────────────────
        img_user_id = get_user_id_from_session(session_id)
        if img_user_id:
            plan       = get_user_subscription(img_user_id)
            img_limit  = IMAGE_LIMITS.get(plan, IMAGE_LIMITS["free"])
            img_count  = count_session_images(session_id)
            if img_count >= img_limit:
                raise HTTPException(
                    status_code=403,
                    detail=f"IMAGE_LIMIT_REACHED:{plan}:Hai raggiunto il limite di {img_limit} immagini per questa sessione con il piano {plan}."
                )

        try:
            image_url = upload_image_to_storage(img_bytes, img_content_type, session_id)
        except Exception as e:
            print(f"[Legacy] Errore upload immagine: {e}")
            raise HTTPException(status_code=500, detail=f"Errore caricamento immagine: {str(e)}")

    # ── Validazione ───────────────────────────────────────────────────────────
    if not user_text and not image_url:
        raise HTTPException(status_code=422, detail="Invia un testo, un audio o un'immagine.")

    if not user_text and image_url:
        user_text = "[Ha condiviso un'immagine]"

    # ── Salva messaggio utente ────────────────────────────────────────────────
    db_insert_message(session_id, "user", user_text, image_url=image_url, user_id=user_id)

    # ── Storia + Claude ───────────────────────────────────────────────────────
    full_history   = db_load_history_with_images(session_id)
    dynamic_prompt = build_system_prompt(
        protagonist_name   = protagonist_name   or "il protagonista",
        protagonist_gender = protagonist_gender or "Neutro",
        biography_tone     = biography_tone     or "Empatico e nostalgico",
    )
    if ui_language:
        dynamic_prompt += (
            f" L'utente sta usando l'app in lingua {ui_language}."
            f" DEVI rispondere, fare domande e generare tutto il testo ESCLUSIVAMENTE in {ui_language}."
        )

    # ── Direttiva story_type ─────────────────────────────────────────────────
    dynamic_prompt += " " + build_story_type_directive(session_id)

    claude_messages = build_claude_messages_with_vision(
        history           = full_history,
        current_user_text = user_text,
        current_image_url = image_url,
    )

    message = anthropic_client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=512,
        system=dynamic_prompt,
        messages=claude_messages,
    )
    ai_reply = message.content[0].text.strip()
    print(f"[Legacy] Claude: {ai_reply!r}")

    db_insert_message(session_id, "assistant", ai_reply, user_id=user_id)

    # ── TTS: SEMPRE OpenAI in chat (ElevenLabs riservato all'audiolibro) ───────
    audio_bytes  = tts_openai(ai_reply, voice_setting)
    audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")
    print(f"[Legacy] TTS OpenAI chat — voce: {voice_setting or TTS_VOICE!r}")

    return {
        "user_text":    user_text,
        "ai_reply":     ai_reply,
        "audio_base64": audio_base64,
        "image_url":    image_url,
        "tts_provider": "openai",
    }



# ════════════════════════════════════════
#  ENDPOINT: LEGGI ARCHIVIO (Audiolibro)
# ════════════════════════════════════════

@app.post("/api/read_archive")
async def read_archive(
    session_id:  str = Form(...),
    text:        str = Form(...),
    voice_setting: Optional[str] = Form(default=None),
):
    """
    Genera l'audio dell'archivio biografico.
    - Se la sessione ha un voice_id ElevenLabs → usa la voce clonata
    - Altrimenti → usa OpenAI TTS come fallback
    Restituisce: {"audio_base64": "...", "tts_provider": "elevenlabs|openai"}

    Nota: il testo del libro può essere molto lungo (decine di migliaia di caratteri).
    ElevenLabs supporta fino a ~5.000 caratteri per chiamata → il testo viene spezzato
    in chunk e gli audio vengono concatenati.
    """
    print(f"[Legacy] read_archive — session_id: {session_id!r}, testo: {len(text)} chars")

    if not text.strip():
        raise HTTPException(status_code=422, detail="Testo vuoto.")

    # ── Controlla voice_id della sessione ─────────────────────────────────────
    el_voice_id = db_get_voice_id(session_id) if ELEVENLABS_API_KEY else None

    if el_voice_id:
        print(f"[Legacy] read_archive — uso ElevenLabs voice_id: {el_voice_id!r}")
        try:
            # ElevenLabs ha un limite di ~5.000 caratteri per richiesta
            # Spezza il testo in chunk e concatena gli MP3
            MAX_CHUNK = 4500
            chunks    = _split_text_into_chunks(text, MAX_CHUNK)
            print(f"[Legacy] read_archive — {len(chunks)} chunk da elaborare")

            audio_parts = []
            for i, chunk in enumerate(chunks):
                print(f"[Legacy] read_archive — chunk {i+1}/{len(chunks)} ({len(chunk)} chars)")
                part = tts_elevenlabs(chunk, el_voice_id)
                audio_parts.append(part)

            # Concatena tutti i byte MP3
            combined = b"".join(audio_parts)
            audio_b64 = base64.b64encode(combined).decode("utf-8")
            print(f"[Legacy] read_archive — ElevenLabs completato: {len(combined)} bytes")
            return {"audio_base64": audio_b64, "tts_provider": "elevenlabs"}

        except Exception as e:
            print(f"[Legacy] ElevenLabs read_archive fallito ({e}) — fallback OpenAI")

    # ── Fallback: OpenAI TTS ──────────────────────────────────────────────────
    # OpenAI TTS supporta fino a 4.096 caratteri per richiesta
    print(f"[Legacy] read_archive — uso OpenAI TTS")
    MAX_CHUNK  = 4000
    chunks     = _split_text_into_chunks(text, MAX_CHUNK)
    audio_parts = []
    tts_voice   = voice_setting if voice_setting in VALID_VOICES else TTS_VOICE

    for i, chunk in enumerate(chunks):
        print(f"[Legacy] read_archive OpenAI — chunk {i+1}/{len(chunks)}")
        part = tts_openai(chunk, tts_voice)
        audio_parts.append(part)

    combined  = b"".join(audio_parts)
    audio_b64 = base64.b64encode(combined).decode("utf-8")
    print(f"[Legacy] read_archive — OpenAI completato: {len(combined)} bytes")
    return {"audio_base64": audio_b64, "tts_provider": "openai"}


def _split_text_into_chunks(text: str, max_chars: int) -> list[str]:
    """
    Spezza il testo in chunk da max_chars caratteri, rispettando i confini
    di frase (punto, a capo) per evitare tagli nel mezzo di una parola.
    """
    if len(text) <= max_chars:
        return [text]

    # Rimuovi tag HTML per il TTS (legge il testo puro)
    import re as _re
    clean = _re.sub(r'<[^>]+>', ' ', text)
    clean = _re.sub(r'\s+', ' ', clean).strip()

    if len(clean) <= max_chars:
        return [clean]

    chunks = []
    while clean:
        if len(clean) <= max_chars:
            chunks.append(clean.strip())
            break
        # Cerca il punto più vicino al limite
        cut = clean.rfind('. ', 0, max_chars)
        if cut == -1:
            cut = clean.rfind(' ', 0, max_chars)
        if cut == -1:
            cut = max_chars
        else:
            cut += 1  # includi il punto
        chunks.append(clean[:cut].strip())
        clean = clean[cut:].strip()

    return [c for c in chunks if c]

# ════════════════════════════════════════
#  ENDPOINT: GENERA / AGGIORNA LIBRO
# ════════════════════════════════════════

@app.get("/api/generate_book")
async def generate_book(
    session_id:  str           = "test_session",
    ui_language: Optional[str] = None,
):
    print(f"[Legacy] generate_book — session_id: {session_id!r}")

    # Free può generare — il paywall è solo su PDF/Modifica/Audiolibro (frontend)
    user_id = get_user_id_from_session(session_id)

    full_history = db_load_history_with_images(session_id)
    if not full_history:
        raise HTTPException(
            status_code=404,
            detail="Nessun messaggio trovato. Completa almeno una parte dell'intervista."
        )

    session_result = (
        supabase.table("chat_sessions")
        .select("book_content")
        .eq("id", session_id)
        .execute()
    )
    existing_book = None
    if session_result.data:
        existing_book = session_result.data[0].get("book_content") or None

    lines = []
    for r in full_history:
        label = "Protagonista" if r["role"] == "user" else "Biografo (domanda)"
        line  = f"{label}: {r['content']}"
        if r.get("image_url"):
            line += f"\n[IMMAGINE ALLEGATA: {r['image_url']}]"
        lines.append(line)
    transcript = "\n\n".join(lines)

    if existing_book:
        user_message = (
            "=== LIBRO ATTUALE (da mantenere e/o aggiornare) ===\n"
            f"{existing_book}\n\n"
            "=== CRONOLOGIA CHAT ===\n"
            f"{transcript}\n\n"
            "Agisci come editor: mantieni il libro esistente, aggiungi eventuali nuovi ricordi "
            "come nuovo capitolo, inserisci le immagini come <figure><img>, "
            "e applica correzioni esplicite. Restituisci l'intero HTML aggiornato."
        )
    else:
        user_message = (
            "=== LIBRO ATTUALE ===\nNessun libro ancora.\n\n"
            "=== CRONOLOGIA CHAT ===\n"
            f"{transcript}\n\n"
            "Scrivi la biografia dall'inizio con le immagini come <figure><img>. "
            "Restituisci l'HTML completo."
        )

    book_prompt = BOOK_SYSTEM_PROMPT
    # Aggiunge direttiva narrativa basata sul tipo di storia
    book_prompt += " " + build_story_type_directive(session_id)
    if ui_language:
        book_prompt += (
            f" L'utente sta usando l'app in lingua {ui_language}."
            f" DEVI scrivere l'intera biografia ESCLUSIVAMENTE in {ui_language}."
        )

    # Con max_tokens=64000 e' obbligatorio usare lo streaming (SDK Anthropic requirement)
    book_html = ""
    with anthropic_client.messages.stream(
        model="claude-sonnet-4-6",
        max_tokens=64000,
        system=book_prompt,
        messages=[{"role": "user", "content": user_message}],
    ) as stream:
        book_html = stream.get_final_text().strip()
    book_html = re.sub(r'^```[a-z]*\n?', '', book_html, flags=re.IGNORECASE)
    book_html = re.sub(r'\n?```$', '', book_html).strip()
    body_match = re.search(r'<body[^>]*>(.*?)</body>', book_html, re.DOTALL | re.IGNORECASE)
    if body_match:
        book_html = body_match.group(1).strip()

    try:
        supabase.table("chat_sessions").update({
            "book_content": book_html
        }).eq("id", session_id).execute()
    except Exception as e:
        print(f"[Legacy] Avviso: impossibile salvare book_content — {e}")

    return {"book_html": book_html}


# ════════════════════════════════════════
#  ENDPOINT: HISTORY
# ════════════════════════════════════════

@app.get("/api/history/{session_id}")
async def get_history(session_id: str):
    rows = db_load_history_with_images(session_id)
    return {"history": rows}


# ════════════════════════════════════════
#  ENDPOINT: RESET
# ════════════════════════════════════════

@app.post("/api/reset")
async def reset_session(session_id: str = Form(default="test_session")):
    supabase.table("memories").delete().eq("session_id", session_id).execute()
    return {"status": "ok"}


# ── Avvio diretto ─────────────────────────────────────────────────────────────
# StaticFiles rimosso: frontend su Vercel, backend solo API su Render.
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True, timeout_keep_alive=120)