"""
AI monitoring: upstream pretrained OpenCV/TensorFlow models, head movement, motion.
"""

from __future__ import annotations

import base64
import math
import re
from typing import Any

import cv2
import numpy as np

from upstream_models import (
    detect_face_spoof,
    detect_faces,
    detect_landmarks,
    detect_objects,
    estimate_eye_gaze,
    estimate_head_pose,
    is_mouth_open,
    measure_mouth,
    upstream_status,
)

try:
    import tensorflow as tf

    TF_AVAILABLE = True
except ImportError:
    TF_AVAILABLE = False

_prev_frames: dict[str, np.ndarray] = {}
_look_away_streak: dict[str, int] = {}
_eye_gaze_streak: dict[str, int] = {}
_no_face_streak: dict[str, int] = {}
_multiple_face_streak: dict[str, int] = {}
_mouth_open_streak: dict[str, int] = {}
_object_streak: dict[str, dict[str, int]] = {}
_motion_streak: dict[str, int] = {}
_face_history: dict[str, list[tuple[float, float]]] = {}
_event_cooldown: dict[str, dict[str, int]] = {}
_mouth_baseline: dict[str, dict[str, Any]] = {}
_mouth_baseline_samples: dict[str, list[dict[str, Any]]] = {}
_spoof_streak: dict[str, int] = {}


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


def _increment_streak(store: dict[str, int], session_id: str, condition: bool) -> int:
    if condition:
        store[session_id] = store.get(session_id, 0) + 1
    else:
        store[session_id] = 0
    return store[session_id]


def _track_head_movement(session_id: str, cx: float, cy: float, width: int, height: int) -> bool:
    hist = _face_history.setdefault(session_id, [])
    hist.append((cx / width, cy / height))
    if len(hist) > 20:
        hist.pop(0)
    if len(hist) < 6:
        return False

    jumps = 0
    for i in range(len(hist) - 5, len(hist)):
        if i <= 0:
            continue
        distance = math.hypot(hist[i][0] - hist[i - 1][0], hist[i][1] - hist[i - 1][1])
        if distance > 0.07:
            jumps += 1
    return jumps >= 3


def _separate_faces(faces: list[list[int]]) -> bool:
    if len(faces) < 2:
        return False
    centers: list[tuple[float, float, float]] = []
    for x1, y1, x2, y2 in faces:
        width = max(1, x2 - x1)
        height = max(1, y2 - y1)
        centers.append((x1 + width / 2, y1 + height / 2, max(width, height)))

    for i, (cx1, cy1, size1) in enumerate(centers):
        for cx2, cy2, size2 in centers[i + 1:]:
            distance = math.hypot(cx1 - cx2, cy1 - cy2)
            if distance > 0.45 * max(size1, size2):
                return True
    return False


def _landmarks_look_like_face(marks: np.ndarray | None, box: list[int]) -> bool:
    if marks is None or len(marks) < 68:
        return False
    x1, y1, x2, y2 = box
    width = max(1, x2 - x1)
    height = max(1, y2 - y1)
    required = [30, 36, 45, 48, 54]
    for idx in required:
        x, y = marks[idx]
        if x < x1 - width * 0.15 or x > x2 + width * 0.15:
            return False
        if y < y1 - height * 0.15 or y > y2 + height * 0.15:
            return False

    left_eye = np.mean(marks[36:42], axis=0)
    right_eye = np.mean(marks[42:48], axis=0)
    nose = marks[30]
    mouth_left = marks[48]
    mouth_right = marks[54]
    eye_distance = float(np.linalg.norm(left_eye - right_eye))
    mouth_width = float(np.linalg.norm(mouth_left - mouth_right))
    eyes_above_mouth = max(left_eye[1], right_eye[1]) < min(mouth_left[1], mouth_right[1])
    nose_between = min(left_eye[1], right_eye[1]) < nose[1] < max(mouth_left[1], mouth_right[1])
    return (
        eye_distance > width * 0.18
        and mouth_width > width * 0.18
        and eyes_above_mouth
        and nose_between
    )


def _validated_separate_face_count(frame: np.ndarray, faces: list[list[int]]) -> int:
    valid_faces: list[list[int]] = []
    for box in faces[:5]:
        marks = detect_landmarks(frame, box)
        if _landmarks_look_like_face(marks, box):
            valid_faces.append(box)
    return len(valid_faces) if _separate_faces(valid_faces) else min(len(valid_faces), 1)


def _update_mouth_baseline(session_id: str, mouth: dict[str, Any] | None) -> None:
    if not mouth or session_id in _mouth_baseline:
        return
    samples = _mouth_baseline_samples.setdefault(session_id, [])
    samples.append(mouth)
    if len(samples) > 12:
        samples.pop(0)
    if len(samples) < 6:
        return
    outer = np.mean([sample['outer'] for sample in samples], axis=0).tolist()
    inner = np.mean([sample['inner'] for sample in samples], axis=0).tolist()
    _mouth_baseline[session_id] = {
        'outer': outer,
        'inner': inner,
        'outer_mean': round(float(np.mean(outer)), 3),
        'inner_mean': round(float(np.mean(inner)), 3),
    }


def _landmark_events(
    session_id: str,
    frame: np.ndarray,
    face_box: list[int],
    marks: np.ndarray | None,
) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    detections: list[dict[str, Any]] = []
    if marks is None:
        return detections, None

    head_pose = estimate_head_pose(frame, face_box, marks)
    eye_gaze = estimate_eye_gaze(frame, marks)
    if eye_gaze and eye_gaze['direction'] in {'left', 'right', 'up'}:
        streak = _eye_gaze_streak.get(session_id, 0) + 1
        _eye_gaze_streak[session_id] = streak
        if streak >= 5 and _cooldown_ok(session_id, 'eye_gaze_away', 12):
            direction = eye_gaze['direction']
            detections.append({
                'type': 'eye_gaze_away',
                'triggered': True,
                'severity': 'low',
                'message': f'Sustained eye gaze away from screen ({direction})',
                'risk_delta': 4,
                'metadata': {
                    'source': 'landmark_eye_tracker',
                    'eye_gaze': eye_gaze,
                    'evidence_frames': streak,
                    'review_required': True,
                },
            })
    else:
        _eye_gaze_streak[session_id] = 0

    mouth = measure_mouth(marks)
    _update_mouth_baseline(session_id, mouth)
    mouth_open, mouth_metadata = is_mouth_open(mouth, _mouth_baseline.get(session_id))
    mouth_streak = _increment_streak(_mouth_open_streak, session_id, mouth_open)
    if mouth_streak >= 4 and _cooldown_ok(session_id, 'mouth_open', 16):
        detections.append({
            'type': 'mouth_open',
            'triggered': True,
            'severity': 'low',
            'message': 'Sustained mouth opening detected',
            'risk_delta': 4,
            'metadata': {
                'source': 'landmark_mouth_detector',
                'evidence_frames': mouth_streak,
                'review_required': True,
                **mouth_metadata,
            },
        })

    return detections, head_pose


def _spoof_event(
    session_id: str,
    frame: np.ndarray,
    face_box: list[int],
) -> dict[str, Any] | None:
    spoof = detect_face_spoof(frame, face_box)
    if not spoof:
        _spoof_streak[session_id] = 0
        return None

    if spoof['is_spoof'] and spoof.get('source') == 'face_spoofing_model':
        streak = _spoof_streak.get(session_id, 0) + 1
        _spoof_streak[session_id] = streak
        if streak >= 2 and _cooldown_ok(session_id, 'face_spoofing', 20):
            return {
                'type': 'face_spoofing',
                'triggered': True,
                'severity': 'high',
                'message': 'Possible spoofed face or photo detected',
                'risk_delta': 20,
                'metadata': {'source': 'face_spoofing_model', 'review_required': True, **spoof},
            }
    else:
        _spoof_streak[session_id] = 0
    return None


def _object_events(session_id: str, frame: np.ndarray, face_count: int) -> list[dict[str, Any]]:
    objects = detect_objects(frame)
    detections: list[dict[str, Any]] = []
    if not objects:
        return detections

    persons = [obj for obj in objects if obj['label'] == 'person']
    phones = [
        obj
        for obj in objects
        if obj['label'] == 'cell phone' and obj.get('confidence', 0) >= 0.7
    ]
    suspicious = [
        obj
        for obj in objects
        if obj['label'] in {'laptop', 'book', 'keyboard', 'remote', 'tv'}
        and obj.get('confidence', 0) >= 0.72
    ]

    object_streaks = _object_streak.setdefault(session_id, {})
    object_streaks['phone'] = object_streaks.get('phone', 0) + 1 if phones else 0
    object_streaks['suspicious'] = object_streaks.get('suspicious', 0) + 1 if suspicious else 0
    object_streaks['persons'] = object_streaks.get('persons', 0) + 1 if len(persons) > 1 else 0

    if phones and object_streaks['phone'] >= 3 and _cooldown_ok(session_id, 'phone_detected', 18):
        best = max(phones, key=lambda obj: obj['confidence'])
        detections.append({
            'type': 'phone_detected',
            'triggered': True,
            'severity': 'high',
            'message': 'Mobile phone detected across multiple frames',
            'risk_delta': 28,
            'metadata': {
                'source': 'tflite_coco',
                'object': best,
                'evidence_frames': object_streaks['phone'],
                'review_required': True,
            },
        })

    if len(persons) > 1 and object_streaks['persons'] >= 3 and face_count >= 1 and _cooldown_ok(
        session_id, 'multiple_faces', 10
    ):
        detections.append({
            'type': 'multiple_faces',
            'triggered': True,
            'severity': 'high',
            'message': f'{len(persons)} persons detected across multiple frames',
            'risk_delta': 30,
            'metadata': {
                'source': 'tflite_coco',
                'person_count': len(persons),
                'evidence_frames': object_streaks['persons'],
                'review_required': True,
            },
        })

    if (
        suspicious
        and not phones
        and object_streaks['suspicious'] >= 4
        and _cooldown_ok(session_id, 'suspicious_object_detected', 24)
    ):
        labels = sorted({obj['label'] for obj in suspicious})
        detections.append({
            'type': 'suspicious_object_detected',
            'triggered': True,
            'severity': 'low',
            'message': f'Potential restricted object visible: {", ".join(labels)}',
            'risk_delta': 6,
            'metadata': {
                'source': 'tflite_coco',
                'objects': suspicious,
                'evidence_frames': object_streaks['suspicious'],
                'review_required': True,
            },
        })

    return detections


def analyze_frame(image_b64: str, session_id: str = 'default') -> dict[str, Any]:
    frame = _decode_image(image_b64)
    h, w = frame.shape[:2]
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    face_results = detect_faces(frame)
    faces = [result['box'] for result in face_results]
    face_count = len(faces)
    detections: list[dict[str, Any]] = []

    if face_count == 0:
        no_face_streak = _increment_streak(_no_face_streak, session_id, True)
        if no_face_streak >= 4 and _cooldown_ok(session_id, 'no_face', 8):
            detections.append({
                'type': 'no_face',
                'triggered': True,
                'severity': 'high',
                'message': 'No face visible across multiple frames',
                'risk_delta': 15,
                'metadata': {
                    'source': 'opencv_dnn',
                    'evidence_frames': no_face_streak,
                    'review_required': True,
                },
            })
        _look_away_streak[session_id] = 0
        _multiple_face_streak[session_id] = 0
    else:
        _no_face_streak[session_id] = 0
        validated_face_count = _validated_separate_face_count(frame, faces) if face_count > 1 else face_count
        has_separate_faces = validated_face_count > 1
        multi_face_streak = _increment_streak(_multiple_face_streak, session_id, has_separate_faces)
        if has_separate_faces and multi_face_streak >= 3 and _cooldown_ok(session_id, 'multiple_faces', 12):
            detections.append({
                'type': 'multiple_faces',
                'triggered': True,
                'severity': 'high',
                'message': f'{validated_face_count} faces detected across multiple frames',
                'risk_delta': 30,
                'metadata': {
                    'source': 'opencv_dnn',
                    'face_count': validated_face_count,
                    'raw_face_count': face_count,
                    'evidence_frames': multi_face_streak,
                    'review_required': True,
                },
            })

        largest = max(faces, key=lambda box: (box[2] - box[0]) * (box[3] - box[1]))
        x1, y1, x2, y2 = largest
        fw = x2 - x1
        fh = y2 - y1
        cx = x1 + fw / 2
        cy = y1 + fh / 2
        norm_dx = abs(cx - w / 2) / (w / 2)
        norm_dy = abs(cy - h / 2) / (h / 2)
        face_area_ratio = (fw * fh) / (w * h)
        marks = detect_landmarks(frame, largest)
        landmark_hits, head_pose = _landmark_events(session_id, frame, largest, marks)
        detections.extend(landmark_hits)

        spoof_hit = _spoof_event(session_id, frame, largest)
        if spoof_hit:
            detections.append(spoof_hit)

        if _track_head_movement(session_id, cx, cy, w, h) and _cooldown_ok(
            session_id, 'suspicious_head_movement', 12
        ):
            detections.append({
                'type': 'suspicious_head_movement',
                'triggered': True,
                'severity': 'low',
                'message': 'Unusual head movement observed',
                'risk_delta': 5,
                'metadata': {
                    'norm_dx': round(norm_dx, 3),
                    'norm_dy': round(norm_dy, 3),
                    'review_required': True,
                },
            })

        pose_away = bool(head_pose and head_pose['direction'] in {'left', 'right', 'up', 'down'})
        looking_away = (
            (pose_away and (norm_dx > 0.22 or norm_dy > 0.28))
            or norm_dx > 0.48
            or norm_dy > 0.52
        )
        streak = _look_away_streak.get(session_id, 0)
        if looking_away:
            streak += 1
            _look_away_streak[session_id] = streak
            if streak >= 5 and _cooldown_ok(session_id, 'looking_away', 12):
                detections.append({
                    'type': 'looking_away',
                    'triggered': True,
                    'severity': 'low',
                    'message': 'Sustained looking away from screen',
                    'risk_delta': 5,
                    'metadata': {
                        'norm_dx': round(norm_dx, 3),
                        'norm_dy': round(norm_dy, 3),
                        'face_area_ratio': round(face_area_ratio, 4),
                        'head_pose': head_pose,
                        'evidence_frames': streak,
                        'review_required': True,
                    },
                })
        else:
            _look_away_streak[session_id] = 0

    model_hits = _object_events(session_id, frame, face_count)
    existing_types = {d['type'] for d in detections}
    for hit in model_hits:
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
        motion_streak = _increment_streak(_motion_streak, session_id, motion_tf > 0.85 and diff_ratio > 0.08)
        if motion_streak >= 2 and _cooldown_ok(session_id, 'unusual_movement', 10):
            detections.append({
                'type': 'unusual_movement',
                'triggered': True,
                'severity': 'low',
                'message': 'Large movement observed across frames',
                'risk_delta': 4,
                'metadata': {
                    'diff_ratio': round(float(diff_ratio), 5),
                    'motion_score': round(motion_tf, 3),
                    'evidence_frames': motion_streak,
                    'review_required': True,
                },
            })

    return {
        'face_count': face_count,
        'faces': face_results,
        'detections': detections,
        'frame_size': {'width': w, 'height': h},
        'models': upstream_status(),
    }


def reset_session(session_id: str) -> None:
    _prev_frames.pop(session_id, None)
    _look_away_streak.pop(session_id, None)
    _eye_gaze_streak.pop(session_id, None)
    _no_face_streak.pop(session_id, None)
    _multiple_face_streak.pop(session_id, None)
    _mouth_open_streak.pop(session_id, None)
    _object_streak.pop(session_id, None)
    _motion_streak.pop(session_id, None)
    _face_history.pop(session_id, None)
    _event_cooldown.pop(session_id, None)
    _mouth_baseline.pop(session_id, None)
    _mouth_baseline_samples.pop(session_id, None)
    _spoof_streak.pop(session_id, None)
