"""
YOLO26 inference for proctoring (phones, extra persons, laptops, books).
Falls back gracefully when ultralytics or weights are unavailable.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import numpy as np

ROOT = Path(__file__).resolve().parent
_model = None
_model_path: str | None = None

# COCO class ids when using a general pretrained model
COCO_PHONE = 67
COCO_PERSON = 0
COCO_LAPTOP = 63
COCO_BOOK = 73

# Custom proctoring.yaml class ids
CUSTOM_PHONE = 1
CUSTOM_PERSON = 0
CUSTOM_LAPTOP = 2
CUSTOM_BOOK = 3

SUSPICIOUS_LABELS = {
    'cell phone',
    'cell_phone',
    'phone',
    'laptop',
    'book',
}


def _weight_candidates() -> list[Path]:
    env_path = os.environ.get('YOLO_MODEL_PATH', '').strip()
    paths: list[Path] = []
    if env_path:
        paths.append(Path(env_path))
    paths.extend([
        ROOT / 'yolo26n.pt',
        ROOT / 'yolov8n.pt',
        ROOT / 'weights' / 'proctoring.pt',
        ROOT / 'runs' / 'detect' / 'proctoring' / 'weights' / 'best.pt',
        ROOT / 'runs' / 'detect' / 'train' / 'weights' / 'best.pt',
    ])
    return paths


def get_yolo_model():
    """Load YOLO once; prefer fine-tuned proctoring weights, else pretrained nano."""
    global _model, _model_path
    if _model is not None:
        return _model

    try:
        from ultralytics import YOLO
    except ImportError:
        return None

    for path in _weight_candidates():
        if path.exists():
            try:
                _model = YOLO(str(path))
                _model_path = str(path)
                return _model
            except Exception:
                continue

    # Pretrained fallback for COCO phone/person detection without custom training.
    # Prefer small over nano for better proctoring accuracy, then fall back to nano.
    for weights in ('yolo11s.pt', 'yolo11n.pt', 'yolov8s.pt', 'yolov8n.pt'):
        try:
            _model = YOLO(weights)
            _model_path = weights
            return _model
        except Exception:
            continue
    return None


def _label_name(names: dict | list, class_id: int) -> str:
    if isinstance(names, dict):
        return str(names.get(class_id, '')).lower()
    if isinstance(names, list) and 0 <= class_id < len(names):
        return str(names[class_id]).lower()
    return ''


def _is_phone(class_id: int, label: str, custom_dataset: bool) -> bool:
    if 'phone' in label or label in {'cell phone', 'cell_phone'}:
        return True
    if custom_dataset:
        return class_id == CUSTOM_PHONE
    return class_id == COCO_PHONE


def _is_extra_person(class_id: int, label: str, custom_dataset: bool, face_count: int) -> bool:
    if label != 'person' and class_id not in {COCO_PERSON, CUSTOM_PERSON}:
        return False
    if custom_dataset:
        return class_id == CUSTOM_PERSON and face_count >= 1
    return class_id == COCO_PERSON and face_count >= 1


def run_yolo_detections(
    frame: np.ndarray,
    session_id: str,
    face_count: int,
    cooldown_ok,
) -> list[dict[str, Any]]:
    model = get_yolo_model()
    if model is None:
        return []

    custom_dataset = _model_path and 'proctoring' in (_model_path or '')
    detections: list[dict[str, Any]] = []

    try:
        results = model.predict(frame, verbose=False, conf=0.48, imgsz=640)
    except Exception:
        return []

    if not results:
        return detections

    result = results[0]
    names = result.names or {}
    boxes = result.boxes
    if boxes is None:
        return detections

    person_boxes = 0
    phone_found = False
    suspicious_items: list[str] = []
    best_phone_conf = 0.0
    best_object_conf: dict[str, float] = {}

    for box in boxes:
        class_id = int(box.cls[0])
        label = _label_name(names, class_id)
        conf = float(box.conf[0])

        if label == 'person' or class_id in {COCO_PERSON, CUSTOM_PERSON}:
            person_boxes += 1

        if _is_phone(class_id, label, custom_dataset) and conf >= 0.5:
            phone_found = True
            best_phone_conf = max(best_phone_conf, conf)

        if (label in SUSPICIOUS_LABELS or _is_phone(class_id, label, custom_dataset)) and conf >= 0.5:
            if label not in suspicious_items:
                suspicious_items.append(label or 'device')
            best_object_conf[label or 'device'] = max(best_object_conf.get(label or 'device', 0.0), conf)

    if phone_found and cooldown_ok(session_id, 'phone_detected', 15):
        detections.append({
            'type': 'phone_detected',
            'triggered': True,
            'severity': 'high',
            'message': 'Mobile phone or device detected by YOLO',
            'risk_delta': 28,
            'metadata': {'source': 'yolo', 'model': _model_path, 'confidence': round(best_phone_conf, 3)},
        })

    yolo_persons = person_boxes
    if yolo_persons > 1 and face_count >= 1 and cooldown_ok(session_id, 'multiple_faces', 10):
        detections.append({
            'type': 'multiple_faces',
            'triggered': True,
            'severity': 'high',
            'message': f'{yolo_persons} persons detected — possible collusion',
            'risk_delta': 30,
            'metadata': {'source': 'yolo', 'person_count': yolo_persons},
        })

    if suspicious_items and not phone_found:
        other = [s for s in suspicious_items if 'phone' not in s]
        if other and cooldown_ok(session_id, 'phone_detected', 20):
            detections.append({
                'type': 'phone_detected',
                'triggered': True,
                'severity': 'medium',
                'message': f'Suspicious object detected: {", ".join(other)}',
                'risk_delta': 18,
                'metadata': {
                    'source': 'yolo',
                    'objects': other,
                    'confidence': {k: round(v, 3) for k, v in best_object_conf.items() if k in other},
                },
            })

    return detections


def yolo_status() -> dict[str, Any]:
    model = get_yolo_model()
    return {
        'loaded': model is not None,
        'weights': _model_path,
    }
