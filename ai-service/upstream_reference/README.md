Upstream Proctoring-AI reference
================================

Source: https://github.com/vardanagarwal/Proctoring-AI

This folder keeps the upstream demo scripts and test videos for reference and
manual comparison. The production FastAPI service does not import these files
directly because the upstream scripts start webcam/video loops at import time.

Production integration lives in:

- `../upstream_models.py`
- `../detector.py`

Integrated into the live `/analyze` flow:

- OpenCV DNN face detection
- TensorFlow facial landmarks
- Eye gaze detection
- Mouth opening detection with per-session baseline
- Head pose estimation
- Person count and phone/device detection through TFLite COCO SSD
- Face spoofing model file with a compatibility fallback

Reference media:

- `test_media/center_focus.mp4`
- `test_media/center_left_center.mp4`
- `test_media/center_right_center.mp4`
- `test_media/video.mp4`
