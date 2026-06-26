from __future__ import annotations

import math
import sys
from pathlib import Path
from typing import Any

import cv2
import numpy as np

try:
    import tensorflow as tf

    TF_AVAILABLE = True
except ImportError:
    tf = None
    TF_AVAILABLE = False

ROOT = Path(__file__).resolve().parent
MODELS = ROOT / 'models'

FACE_PROTO = MODELS / 'deploy.prototxt'
FACE_WEIGHTS = MODELS / 'res10_300x300_ssd_iter_140000.caffemodel'
POSE_MODEL = MODELS / 'pose_model'
TFLITE_MODEL = MODELS / 'coco_ssd_mobilenet' / 'detect.tflite'
TFLITE_LABELS = MODELS / 'coco_ssd_mobilenet' / 'labelmap.txt'
SPOOF_MODEL = MODELS / 'face_spoofing.pkl'

_face_net = None
_pose_model = None
_object_interpreter = None
_object_labels: list[str] | None = None
_spoof_model = None
_spoof_load_attempted = False
_last_errors: dict[str, str] = {}

_POSE_POINTS = np.array(
    [
        (0.0, 0.0, 0.0),
        (0.0, -330.0, -65.0),
        (-225.0, 170.0, -135.0),
        (225.0, 170.0, -135.0),
        (-150.0, -150.0, -125.0),
        (150.0, -150.0, -125.0),
    ],
    dtype='double',
)


def _remember_error(component: str, exc: Exception) -> None:
    _last_errors[component] = f'{type(exc).__name__}: {exc}'


def _load_face_net():
    global _face_net
    if _face_net is not None:
        return _face_net
    if not FACE_PROTO.exists() or not FACE_WEIGHTS.exists():
        return None
    try:
        _face_net = cv2.dnn.readNetFromCaffe(str(FACE_PROTO), str(FACE_WEIGHTS))
    except Exception as exc:
        _remember_error('face', exc)
        _face_net = None
    return _face_net


def _iou(box_a: list[int], box_b: list[int]) -> float:
    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b
    ix1 = max(ax1, bx1)
    iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)
    iw = max(0, ix2 - ix1)
    ih = max(0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    area_a = max(0, ax2 - ax1) * max(0, ay2 - ay1)
    area_b = max(0, bx2 - bx1) * max(0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _dedupe_boxes(
    detections: list[dict[str, Any]],
    iou_threshold: float = 0.3,
    max_results: int = 5,
) -> list[dict[str, Any]]:
    kept: list[dict[str, Any]] = []
    for det in sorted(detections, key=lambda item: item.get('confidence', 0), reverse=True):
        if all(_iou(det['box'], existing['box']) < iou_threshold for existing in kept):
            kept.append(det)
        if len(kept) >= max_results:
            break
    return kept


def detect_faces(frame: np.ndarray, confidence_threshold: float = 0.75) -> list[dict[str, Any]]:
    net = _load_face_net()
    if net is None:
        return []

    h, w = frame.shape[:2]
    blob = cv2.dnn.blobFromImage(
        cv2.resize(frame, (300, 300)),
        1.0,
        (300, 300),
        (104.0, 177.0, 123.0),
    )
    net.setInput(blob)
    output = net.forward()

    candidates: list[dict[str, Any]] = []
    for i in range(output.shape[2]):
        confidence = float(output[0, 0, i, 2])
        if confidence < confidence_threshold:
            continue
        x1, y1, x2, y2 = (output[0, 0, i, 3:7] * np.array([w, h, w, h])).astype(int)
        x1 = max(0, min(w - 1, int(x1)))
        y1 = max(0, min(h - 1, int(y1)))
        x2 = max(0, min(w, int(x2)))
        y2 = max(0, min(h, int(y2)))
        if x2 <= x1 or y2 <= y1:
            continue
        box_w = x2 - x1
        box_h = y2 - y1
        area_ratio = (box_w * box_h) / max(1, w * h)
        aspect = box_w / max(1, box_h)
        if box_w < 36 or box_h < 36:
            continue
        if area_ratio < 0.003 or area_ratio > 0.7:
            continue
        if aspect < 0.62 or aspect > 1.75:
            continue
        candidates.append({
            'box': [x1, y1, x2, y2],
            'confidence': round(confidence, 3),
        })
    return _dedupe_boxes(candidates, iou_threshold=0.28, max_results=5)


def _load_pose_model():
    global _pose_model
    if _pose_model is not None:
        return _pose_model
    if not TF_AVAILABLE or not POSE_MODEL.exists():
        return None
    try:
        _pose_model = tf.saved_model.load(str(POSE_MODEL))
    except Exception as exc:
        _remember_error('pose', exc)
        _pose_model = None
    return _pose_model


def _square_face_box(box: list[int], width: int, height: int) -> list[int] | None:
    left, top, right, bottom = box
    offset_y = int(abs((bottom - top) * 0.1))
    top += offset_y
    bottom += offset_y

    box_w = right - left
    box_h = bottom - top
    delta = abs(box_h - box_w) // 2
    if box_h > box_w:
        left -= delta
        right += delta + (abs(box_h - box_w) % 2)
    elif box_w > box_h:
        top -= delta
        bottom += delta + (abs(box_h - box_w) % 2)

    left = max(0, left)
    top = max(0, top)
    right = min(width, right)
    bottom = min(height, bottom)
    if right - left < 20 or bottom - top < 20:
        return None
    return [left, top, right, bottom]


def detect_landmarks(frame: np.ndarray, face_box: list[int]) -> np.ndarray | None:
    model = _load_pose_model()
    if model is None:
        return None

    h, w = frame.shape[:2]
    crop_box = _square_face_box(face_box, w, h)
    if crop_box is None:
        return None
    x1, y1, x2, y2 = crop_box
    face_img = frame[y1:y2, x1:x2]
    if face_img.size == 0:
        return None

    try:
        face_img = cv2.resize(face_img, (128, 128))
        face_img = cv2.cvtColor(face_img, cv2.COLOR_BGR2RGB)
        predictions = model.signatures['predict'](tf.constant([face_img], dtype=tf.uint8))
        marks = np.array(predictions['output']).flatten()[:136].reshape((-1, 2))
    except Exception as exc:
        _remember_error('pose', exc)
        return None

    marks *= (x2 - x1)
    marks[:, 0] += x1
    marks[:, 1] += y1
    return marks.astype(np.float64)


def estimate_head_pose(
    frame: np.ndarray,
    face_box: list[int],
    marks: np.ndarray | None = None,
) -> dict[str, Any] | None:
    if marks is None:
        marks = detect_landmarks(frame, face_box)
    if marks is None or len(marks) < 55:
        return None

    image_points = np.array(
        [marks[30], marks[8], marks[36], marks[45], marks[48], marks[54]],
        dtype='double',
    )
    h, w = frame.shape[:2]
    camera_matrix = np.array(
        [[w, 0, w / 2], [0, w, h / 2], [0, 0, 1]],
        dtype='double',
    )
    dist_coeffs = np.zeros((4, 1))

    try:
        success, rotation_vector, translation_vector = cv2.solvePnP(
            _POSE_POINTS,
            image_points,
            camera_matrix,
            dist_coeffs,
            flags=cv2.SOLVEPNP_UPNP,
        )
        if not success:
            return None
        nose_end, _ = cv2.projectPoints(
            np.array([(0.0, 0.0, 1000.0)]),
            rotation_vector,
            translation_vector,
            camera_matrix,
            dist_coeffs,
        )
    except Exception as exc:
        _remember_error('pose', exc)
        return None

    p1 = image_points[0]
    p2 = nose_end[0][0]
    dx = float(p2[0] - p1[0])
    dy = float(p2[1] - p1[1])
    pitch = 90.0 if abs(dx) < 1e-6 else math.degrees(math.atan(dy / dx))
    yaw_proxy = dx / max(1.0, w)

    direction = 'center'
    if pitch >= 48:
        direction = 'down'
    elif pitch <= -48:
        direction = 'up'
    elif yaw_proxy >= 0.22:
        direction = 'right'
    elif yaw_proxy <= -0.22:
        direction = 'left'

    return {
        'direction': direction,
        'pitch_angle': round(float(pitch), 2),
        'yaw_proxy': round(float(yaw_proxy), 3),
    }


def _eye_on_mask(mask: np.ndarray, indices: list[int], marks: np.ndarray):
    points = np.array([marks[i] for i in indices], dtype=np.int32)
    mask = cv2.fillConvexPoly(mask, points, 255)
    left = int(points[0][0])
    top = int((points[1][1] + points[2][1]) // 2)
    right = int(points[3][0])
    bottom = int((points[4][1] + points[5][1]) // 2)
    return mask, [left, top, right, bottom]


def _eyeball_position(end_points: list[int], cx: int, cy: int) -> int:
    left, top, right, bottom = end_points
    x_den = cx - right
    y_den = bottom - cy
    if abs(x_den) < 1:
        x_den = -1 if x_den < 0 else 1
    if abs(y_den) < 1:
        y_den = 1
    x_ratio = (left - cx) / x_den
    y_ratio = (cy - top) / y_den
    if x_ratio > 3:
        return 1
    if x_ratio < 0.33:
        return 2
    if y_ratio < 0.33:
        return 3
    return 0


def _contour_eye_position(
    thresh: np.ndarray,
    mid: int,
    end_points: list[int],
    right_eye: bool = False,
) -> int | None:
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not contours:
        return None
    contour = max(contours, key=cv2.contourArea)
    moments = cv2.moments(contour)
    if moments['m00'] == 0:
        return None
    cx = int(moments['m10'] / moments['m00'])
    cy = int(moments['m01'] / moments['m00'])
    if right_eye:
        cx += mid
    return _eyeball_position(end_points, cx, cy)


def _process_eye_threshold(thresh: np.ndarray) -> np.ndarray:
    thresh = cv2.erode(thresh, None, iterations=2)
    thresh = cv2.dilate(thresh, None, iterations=4)
    thresh = cv2.medianBlur(thresh, 3)
    return cv2.bitwise_not(thresh)


def estimate_eye_gaze(frame: np.ndarray, marks: np.ndarray, threshold: int = 75) -> dict[str, Any] | None:
    if marks is None or len(marks) < 48:
        return None

    left_eye = [36, 37, 38, 39, 40, 41]
    right_eye = [42, 43, 44, 45, 46, 47]
    kernel = np.ones((9, 9), np.uint8)
    mask = np.zeros(frame.shape[:2], dtype=np.uint8)
    mask, left_end = _eye_on_mask(mask, left_eye, marks)
    mask, right_end = _eye_on_mask(mask, right_eye, marks)
    mask = cv2.dilate(mask, kernel, 5)

    eyes = cv2.bitwise_and(frame, frame, mask=mask)
    blank = (eyes == [0, 0, 0]).all(axis=2)
    eyes[blank] = [255, 255, 255]
    mid = int((marks[42][0] + marks[39][0]) // 2)
    eyes_gray = cv2.cvtColor(eyes, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(eyes_gray, threshold, 255, cv2.THRESH_BINARY)
    thresh = _process_eye_threshold(thresh)

    left_pos = _contour_eye_position(thresh[:, 0:mid], mid, left_end)
    right_pos = _contour_eye_position(thresh[:, mid:], mid, right_end, True)
    labels = {0: 'center', 1: 'left', 2: 'right', 3: 'up'}
    direction = 'unknown'
    if left_pos is not None and left_pos == right_pos:
        direction = labels.get(left_pos, 'unknown')

    return {
        'direction': direction,
        'left': labels.get(left_pos, 'unknown'),
        'right': labels.get(right_pos, 'unknown'),
    }


_OUTER_MOUTH = [(49, 59), (50, 58), (51, 57), (52, 56), (53, 55)]
_INNER_MOUTH = [(61, 67), (62, 66), (63, 65)]


def measure_mouth(marks: np.ndarray) -> dict[str, Any] | None:
    if marks is None or len(marks) < 68:
        return None
    outer = [float(marks[p2][1] - marks[p1][1]) for p1, p2 in _OUTER_MOUTH]
    inner = [float(marks[p2][1] - marks[p1][1]) for p1, p2 in _INNER_MOUTH]
    return {
        'outer': outer,
        'inner': inner,
        'outer_mean': round(float(np.mean(outer)), 3),
        'inner_mean': round(float(np.mean(inner)), 3),
    }


def is_mouth_open(
    current: dict[str, Any] | None,
    baseline: dict[str, Any] | None,
) -> tuple[bool, dict[str, Any]]:
    if not current:
        return False, {}
    if not baseline:
        return False, {'baseline_ready': False, 'current': current}

    outer_count = sum(
        1 for base, value in zip(baseline['outer'], current['outer']) if base + 3 < value
    )
    inner_count = sum(
        1 for base, value in zip(baseline['inner'], current['inner']) if base + 2 < value
    )
    return outer_count > 3 and inner_count > 2, {
        'baseline_ready': True,
        'outer_count': outer_count,
        'inner_count': inner_count,
        'current': current,
        'baseline': baseline,
    }


def _load_spoof_model():
    global _spoof_load_attempted, _spoof_model
    if _spoof_model is not None:
        return _spoof_model
    if _spoof_load_attempted:
        return None
    _spoof_load_attempted = True
    if not SPOOF_MODEL.exists():
        return None
    try:
        try:
            import joblib
            import sklearn.ensemble._forest as forest_module
            import sklearn.tree._classes as tree_classes_module
            import sklearn.tree._tree as tree_module

            sys.modules.setdefault('sklearn.ensemble.forest', forest_module)
            sys.modules.setdefault('sklearn.tree.tree', tree_classes_module)
            sys.modules.setdefault('sklearn.tree._tree', tree_module)
            sys.modules.setdefault('sklearn.externals.joblib', joblib)
        except Exception:
            pass
        _spoof_model = joblib.load(SPOOF_MODEL)
    except Exception as exc:
        _remember_error('spoofing', exc)
        _spoof_model = None
    return _spoof_model


def _calc_hist(img: np.ndarray) -> np.ndarray:
    histograms = [0] * 3
    for channel in range(3):
        hist = cv2.calcHist([img], [channel], None, [256], [0, 256])
        max_value = hist.max()
        if max_value > 0:
            hist *= 255.0 / max_value
        histograms[channel] = hist
    return np.array(histograms)


def detect_face_spoof(frame: np.ndarray, face_box: list[int]) -> dict[str, Any] | None:
    model = _load_spoof_model()

    h, w = frame.shape[:2]
    x1, y1, x2, y2 = face_box
    x1 = max(0, min(w - 1, x1))
    y1 = max(0, min(h - 1, y1))
    x2 = max(0, min(w, x2))
    y2 = max(0, min(h, y2))
    roi = frame[y1:y2, x1:x2]
    if roi.size == 0:
        return None

    if model is None:
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        texture = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        color_std = float(np.std(roi))
        flat_face = texture < 8.0 and color_std < 22.0
        return {
            'spoof_probability': 0.72 if flat_face else 0.18,
            'is_spoof': flat_face,
            'source': 'fallback_texture_liveness',
            'texture': round(texture, 3),
            'color_std': round(color_std, 3),
        }

    try:
        img_ycrcb = cv2.cvtColor(roi, cv2.COLOR_BGR2YCR_CB)
        img_luv = cv2.cvtColor(roi, cv2.COLOR_BGR2LUV)
        ycrcb_hist = _calc_hist(img_ycrcb)
        luv_hist = _calc_hist(img_luv)
        feature_vector = np.append(ycrcb_hist.ravel(), luv_hist.ravel()).reshape(1, -1)
        probabilities = model.predict_proba(feature_vector)
        spoof_probability = float(probabilities[0][1])
    except Exception as exc:
        _remember_error('spoofing', exc)
        return None

    return {
        'spoof_probability': round(spoof_probability, 3),
        'is_spoof': spoof_probability >= 0.7,
        'source': 'face_spoofing_model',
    }


def _load_object_labels() -> list[str]:
    global _object_labels
    if _object_labels is not None:
        return _object_labels
    if TFLITE_LABELS.exists():
        _object_labels = [
            line.strip().lower()
            for line in TFLITE_LABELS.read_text(encoding='utf-8', errors='ignore').splitlines()
        ]
    else:
        _object_labels = []
    return _object_labels


def _load_object_interpreter():
    global _object_interpreter
    if _object_interpreter is not None:
        return _object_interpreter
    if not TF_AVAILABLE or not TFLITE_MODEL.exists():
        return None
    try:
        _object_interpreter = tf.lite.Interpreter(model_path=str(TFLITE_MODEL))
        _object_interpreter.allocate_tensors()
    except Exception as exc:
        _remember_error('objects', exc)
        _object_interpreter = None
    return _object_interpreter


def _label_for(class_id: int, labels: list[str]) -> str:
    has_placeholder = bool(labels and labels[0] == '???')
    idx = class_id + 1 if has_placeholder else class_id
    if 0 <= idx < len(labels):
        label = labels[idx]
        if label and label != '???':
            return label
    return str(class_id)


def detect_objects(frame: np.ndarray, confidence_threshold: float = 0.55) -> list[dict[str, Any]]:
    interpreter = _load_object_interpreter()
    if interpreter is None:
        return []

    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()
    input_info = input_details[0]
    _, in_h, in_w, _ = input_info['shape']

    resized = cv2.resize(frame, (int(in_w), int(in_h)))
    rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
    if input_info['dtype'] == np.float32:
        input_data = np.expand_dims(rgb.astype(np.float32) / 255.0, axis=0)
    else:
        input_data = np.expand_dims(rgb.astype(input_info['dtype']), axis=0)

    try:
        interpreter.set_tensor(input_info['index'], input_data)
        interpreter.invoke()
        raw_outputs = [interpreter.get_tensor(out['index']) for out in output_details]
    except Exception as exc:
        _remember_error('objects', exc)
        return []

    boxes = classes = scores = None
    for raw in raw_outputs:
        squeezed = np.squeeze(raw)
        if squeezed.ndim == 2 and squeezed.shape[-1] == 4:
            boxes = squeezed
        elif squeezed.ndim == 1 and squeezed.size > 1:
            if np.issubdtype(squeezed.dtype, np.floating) and np.nanmax(squeezed) <= 1.0:
                scores = squeezed
            else:
                classes = squeezed

    if boxes is None or scores is None or classes is None:
        return []

    labels = _load_object_labels()
    h, w = frame.shape[:2]
    candidates: list[dict[str, Any]] = []
    for box, score, class_value in zip(boxes, scores, classes):
        confidence = float(score)
        if confidence < confidence_threshold:
            continue
        class_id = int(class_value)
        label = _label_for(class_id, labels)
        ymin, xmin, ymax, xmax = [float(v) for v in box]
        x1 = max(0, min(w, int(xmin * w)))
        y1 = max(0, min(h, int(ymin * h)))
        x2 = max(0, min(w, int(xmax * w)))
        y2 = max(0, min(h, int(ymax * h)))
        if x2 <= x1 or y2 <= y1:
            continue
        candidates.append({
            'label': label,
            'class_id': class_id,
            'confidence': round(confidence, 3),
            'box': [x1, y1, x2, y2],
        })

    deduped: list[dict[str, Any]] = []
    for label in sorted({det['label'] for det in candidates}):
        label_hits = [det for det in candidates if det['label'] == label]
        deduped.extend(_dedupe_boxes(label_hits, iou_threshold=0.45, max_results=8))
    return sorted(deduped, key=lambda item: item.get('confidence', 0), reverse=True)[:20]


def upstream_status() -> dict[str, Any]:
    return {
        'face_detector': {
            'loaded': _face_net is not None,
            'files_present': FACE_PROTO.exists() and FACE_WEIGHTS.exists(),
            'model': str(FACE_WEIGHTS),
        },
        'head_pose': {
            'loaded': _pose_model is not None,
            'files_present': POSE_MODEL.exists(),
            'tensorflow_available': TF_AVAILABLE,
            'model': str(POSE_MODEL),
        },
        'objects': {
            'loaded': _object_interpreter is not None,
            'files_present': TFLITE_MODEL.exists() and TFLITE_LABELS.exists(),
            'tensorflow_available': TF_AVAILABLE,
            'model': str(TFLITE_MODEL),
        },
        'spoofing': {
            'loaded': _spoof_model is not None,
            'files_present': SPOOF_MODEL.exists(),
            'fallback_available': True,
            'model': str(SPOOF_MODEL),
        },
        'last_errors': dict(_last_errors),
    }
