from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from detector import analyze_frame, reset_session
from upstream_models import upstream_status

app = FastAPI(
    title='Exam Monitor AI Service',
    description='Webcam analysis for suspicious exam behavior',
    version='1.0.0',
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


class AnalyzeRequest(BaseModel):
    image: str
    session_id: str = 'default'


@app.get('/health')
def health():
    return {'status': 'ok', 'service': 'ai-monitoring', 'models': upstream_status()}


@app.post('/analyze')
def analyze(req: AnalyzeRequest):
    result = analyze_frame(req.image, req.session_id)
    return result


@app.post('/reset/{session_id}')
def reset(session_id: str):
    reset_session(session_id)
    return {'message': 'Session state cleared'}


if __name__ == '__main__':
    import uvicorn

    uvicorn.run(app, host='0.0.0.0', port=8000)
