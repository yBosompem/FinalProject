"""
AI monitoring: OpenCV face detection, YOLO26 object detection, head movement, motion.
TensorFlow used for normalized motion scoring.
"""

import base64
import math
import re
from typing import Any

import cv2
import numpy as np

try:
    import tensorflow as tf

    TF_AVAILABLE = True
except ImportError:
    TF_AVAILABLE = False

try:
    from yolo_detector import run_yolo_detections, yolo_status

    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False

    def run_yolo_detections(*_args, **_kwargs):
        return []

    def yolo_status():
        return {'loaded': False, 'weights': None}

_prev_frames: dict[str, np.ndarray] = {}
_look_away_streak: dict[str, int] = {}
_face_history: dict[str, list[tuple[float, float]]] = {}
_event_cooldown: dict[str, dict[str, int]] = {}


def _decode_image(image_b64: str) -> np.ndarray:
    data = image_b64
    if ',' in data:
        data = data.split(',', 1)[1]
    raw = base64.b64decode(re.sub(r'\s', '', data))
    arr = np.frombuffer(raw, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError('Could not decode image')
    return frame


def _load_face_detector():
    cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
    return cv2.CascadeClassifier(cascade_path)


_face_cascade = _load_face_detector()


def _motion_score_tf(diff_ratio: float) -> float:
    if not TF_AVAILABLE:
        return float(min(1.0, diff_ratio * 4))
    x = tf.constant([[diff_ratio]], dtype=tf.float32)
    score = tf.sigmoid((x - 0.02) * 80.0)
    return float(score.numpy()[0][0])


def _cooldown_ok(session_id: str, event_type: str, frames: int = 8) -> bool:
    cd = _event_cooldown.setdefault(session_id, {})
    count = cd.get(event_type, 0)
    if count > 0:
        cd[event_type] = count - 1
        return False
    cd[event_type] = frames
    return True


def _detect_phone_heuristic(frame: np.ndarray, gray: np.ndarray) -> bool:
    """Detect phone-like rectangles via edges (heuristic; works without DNN weights)."""
    h, w = gray.shape[:2]
    roi = gray[int(h * 0.35) :, :]
    edges = cv2.Canny(roi, 50, 150)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    frame_area = h * w

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < frame_area * 0.002 or area > frame_area * 0.12:
            continue
        x, y, bw, bh = cv2.boundingRect(cnt)
        if bw < 20 or bh < 20:
            continue
        aspect = bw / float(bh)
        if 0.45 <= aspect <= 0.75 or 1.35 <= aspect <= 2.2:
            roi_color = frame[int(h * 0.35) + y : int(h * 0.35) + y + bh, x : x + bw]
            if roi_color.size == 0:
                continue
            std = np.std(roi_color)
            if std > 25:
                return True
    return False


def _track_head_movement(session_id: str, cx: float, cy: float, w: int, h: int) -> bool:
    hist = _face_history.setdefault(session_id, [])
    norm = (cx / w, cy / h)
    hist.append(norm)
    if len(hist) > 20:
        hist.pop(0)
    if len(hist) < 6:
        return False

    jumps = 0
    for i in range(len(hist) - 5, len(hist)):
        if i <= 0:
            continue
        d = math.hypot(hist[i][0] - hist[i - 1][0], hist[i][1] - hist[i - 1][1])
        if d > 0.07:
            jumps += 1
    return jumps >= 3


def analyze_frame(image_b64: str, session_id: str = 'default') -> dict[str, Any]:
    frame = _decode_image(image_b64)
    h, w = frame.shape[:2]
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)

    faces = _face_cascade.detectMultiScale(
        gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60)
    )
    face_count = len(faces)
    detections: list[dict[str, Any]] = []

    if face_count == 0:
        if _cooldown_ok(session_id, 'no_face', 6):
            detections.append({
                'type': 'no_face',
                'triggered': True,
                'severity': 'high',
                'message': 'No face visible — student may have left the camera',
                'risk_delta': 15,
                'metadata': {},
            })
        _look_away_streak[session_id] = 0
    else:
        if face_count > 1 and _cooldown_ok(session_id, 'multiple_faces', 10):
            detections.append({
                'type': 'multiple_faces',
                'triggered': True,
                'severity': 'high',
                'message': f'{face_count} faces detected — possible collusion or impersonation',
                'risk_delta': 30,
                'metadata': {'face_count': face_count},
            })

        largest = max(faces, key=lambda f: f[2] * f[3])
        x, y, fw, fh = largest
        cx = x + fw / 2
        cy = y + fh / 2
        norm_dx = abs(cx - w / 2) / (w / 2)
        norm_dy = abs(cy - h / 2) / (h / 2)
        face_area_ratio = (fw * fh) / (w * h)

        if _track_head_movement(session_id, cx, cy, w, h) and _cooldown_ok(
            session_id, 'suspicious_head_movement', 12
        ):
            detections.append({
                'type': 'suspicious_head_movement',
                'triggered': True,
                'severity': 'high',
                'message': 'Rapid head movement — possible cheating behaviour',
                'risk_delta': 14,
                'metadata': {'norm_dx': round(norm_dx, 3), 'norm_dy': round(norm_dy, 3)},
            })

        looking_away = norm_dx > 0.32 or norm_dy > 0.38 or face_area_ratio < 0.035
        streak = _look_away_streak.get(session_id, 0)
        if looking_away:
            streak += 1
            _look_away_streak[session_id] = streak
            if streak >= 2 and _cooldown_ok(session_id, 'looking_away', 8):
                detections.append({
                    'type': 'looking_away',
                    'triggered': True,
                    'severity': 'medium',
                    'message': 'Head/eyes appear turned away from screen — may be reading notes',
                    'risk_delta': 12,
                    'metadata': {
                        'norm_dx': round(norm_dx, 3),
                        'norm_dy': round(norm_dy, 3),
                        'face_area_ratio': round(face_area_ratio, 4),
                    },
                })
        else:
            _look_away_streak[session_id] = 0

        if _detect_phone_heuristic(frame, gray) and _cooldown_ok(session_id, 'phone_detected', 15):
            detections.append({
                'type': 'phone_detected',
                'triggered': True,
                'severity': 'high',
                'message': 'Possible mobile phone or device detected in frame',
                'risk_delta': 28,
                'metadata': {'source': 'heuristic'},
            })

    if YOLO_AVAILABLE:
        yolo_hits = run_yolo_detections(frame, session_id, face_count, _cooldown_ok)
        existing_types = {d['type'] for d in detections}
        for hit in yolo_hits:
            if hit['type'] not in existing_types:
                detections.append(hit)
                existing_types.add(hit['type'])

    prev = _prev_frames.get(session_id)
    _prev_frames[session_id] = gray.copy()
    if prev is not None and prev.shape == gray.shape and face_count > 0:
        diff = cv2.absdiff(prev, gray)
        _, thresh = cv2.threshold(diff, 25, 255, cv2.THRESH_BINARY)
        changed = np.count_nonzero(thresh)
        diff_ratio = changed / (h * w)
        motion_tf = _motion_score_tf(diff_ratio)
        if motion_tf > 0.72 and _cooldown_ok(session_id, 'unusual_movement', 6):
            detections.append({
                'type': 'unusual_movement',
                'triggered': True,
                'severity': 'medium' if motion_tf < 0.85 else 'high',
                'message': 'Large sudden movement in frame',
                'risk_delta': 10,
                'metadata': {
                    'diff_ratio': round(float(diff_ratio), 5),
                    'motion_score': round(motion_tf, 3),
                },
            })

    return {
        'face_count': face_count,
        'detections': detections,
        'frame_size': {'width': w, 'height': h},
        'yolo': yolo_status(),
    }


def reset_session(session_id: str) -> None:
    _prev_frames.pop(session_id, None)
    _look_away_streak.pop(session_id, None)
    _face_history.pop(session_id, None)
    _event_cooldown.pop(session_id, None)
